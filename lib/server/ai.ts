import OpenAI from "openai";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { buildExtractionSystem, localExtractionFallback, normalizeExtractionCandidate, responseJsonSchemaFor } from "./extraction-core";

export const IFM_MODEL = "IFM/K2-Horizon-375B-A23B";
export const IFM_REASONING_EFFORT = "low";
export const IFM_MAX_TOKENS = 4_096;
export const XAI_IMAGE_MODEL = "grok-imagine-image-2.0";
export const XAI_VOICE_MODEL = "grok-voice-think-fast-2.0";

const emotions = ["Proud", "Calm", "Grateful", "Nervous", "Sad", "Curious", "Tired"] as const;

export const DimensionSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  active: z.boolean(),
}).passthrough();

export const ProposalSchema = z.object({
  text: z.string().trim().min(1).max(1_200),
  dims: z.array(z.string().min(1).max(80)).min(1).max(2),
  reason: z.string().trim().min(1).max(240),
  emotion: z.enum(emotions).nullable(),
  confidence: z.number().min(0).max(1),
});

export const ExtractionSchema = z.object({
  items: z.array(ProposalSchema).max(6),
  question: z.string().trim().min(1).max(300).nullable(),
});

export type Extraction = z.infer<typeof ExtractionSchema> & { source: "model" | "local" };
export type Dimension = z.infer<typeof DimensionSchema>;

type RecentExperience = { text: string; dims?: string[] };
export type ExtractionContext = {
  recent?: RecentExperience[];
  priorItems?: Array<z.infer<typeof ProposalSchema>>;
  correction?: string;
};

export class ProviderError extends Error {
  constructor(
    public readonly code: "provider_unavailable" | "provider_timeout" | "invalid_provider_response" | "provider_refusal",
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export function ifmClient() {
  if (!env.IFM_API_KEY) throw new ProviderError("provider_unavailable", "Experience sorting is not configured.", 503);
  return new OpenAI({ apiKey: env.IFM_API_KEY, baseURL: "https://api.ifm.ai/v1" });
}

function xaiClient() {
  if (!env.XAI_API_KEY) throw new ProviderError("provider_unavailable", "Image generation is not configured.", 503);
  return new OpenAI({ apiKey: env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
}

function boundedContext(context?: ExtractionContext) {
  if (!context) return undefined;
  return {
    recent: (context.recent ?? []).slice(-8).map((item) => ({
      text: item.text.slice(0, 500),
      dims: (item.dims ?? []).slice(0, 2),
    })),
    priorItems: (context.priorItems ?? []).slice(0, 6).map((item) => ({
      text: item.text.slice(0, 800), dims: item.dims.slice(0, 2), emotion: item.emotion,
    })),
    correction: context.correction?.slice(0, 800),
  };
}

const transientStatus = new Set([408, 409, 429, 500, 502, 503, 504]);

export async function extractExperiences(args: {
  text: string;
  dimensions: Dimension[];
  context?: ExtractionContext;
}): Promise<Extraction> {
  const active = args.dimensions.filter((dimension) => dimension.active);
  if (!active.length) throw new ProviderError("invalid_provider_response", "At least one active dimension is required.", 422);

  const allowedIds = new Set(active.map((dimension) => dimension.id));
  const system = buildExtractionSystem(active, args.context);
  const userPayload = JSON.stringify({ diaryText: args.text, context: boundedContext(args.context) });
  const responseJsonSchema = responseJsonSchemaFor(active);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const completion = await ifmClient().chat.completions.create(
        {
          model: IFM_MODEL,
          messages: [{ role: "system", content: system }, { role: "user", content: userPayload }],
          temperature: 0.1,
          // This reasoning model can spend its output allowance on hidden reasoning.
          // Low effort and a bounded ceiling keep structured responses timely.
          reasoning_effort: IFM_REASONING_EFFORT,
          max_tokens: IFM_MAX_TOKENS,
          response_format: { type: "json_schema", json_schema: responseJsonSchema },
        },
        { timeout: attempt === 0 ? 18_000 : 24_000, maxRetries: 0 },
      );
      const choice = completion.choices[0];
      if (!choice) throw new ProviderError("invalid_provider_response", "The model returned no result.");
      if (choice.finish_reason !== "stop") {
        if (choice.finish_reason === "length" && attempt === 0) {
          continue;
        }
        throw new ProviderError("invalid_provider_response", `The model response was incomplete (${choice.finish_reason ?? "unknown"}).`);
      }
      if ("refusal" in choice.message && choice.message.refusal) {
        throw new ProviderError("provider_refusal", "The model could not process this entry.", 422);
      }
      const raw = parseStructuredContent(choice.message.content);
      const normalized = normalizeExtractionCandidate(raw);
      const parsed = ExtractionSchema.parse(normalized);
      if (parsed.items.some((item) => item.dims.some((id) => !allowedIds.has(id)))) {
        throw new ProviderError("invalid_provider_response", "The model selected an unavailable dimension.");
      }
      return { ...parsed, source: "model" };
    } catch (error) {
      if ((error instanceof ProviderError || error instanceof z.ZodError || error instanceof SyntaxError) && attempt === 0) continue;
      if (error instanceof ProviderError || error instanceof z.ZodError || error instanceof SyntaxError) break;
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
      const timedOut = error instanceof Error && (error.name.includes("Timeout") || /timeout/i.test(error.message));
      if ((!transientStatus.has(status) && !timedOut) || attempt === 1) break;
    }
  }
  return localExtractionFallback(args.text, active);
}

export function parseStructuredContent(content: unknown): unknown {
  if (content && typeof content === "object") return content;
  if (typeof content !== "string") throw new SyntaxError("Structured response was empty");
  const text=content.split('</ifm|think>').at(-1)??content;
  try { return JSON.parse(text); } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) return JSON.parse(fenced);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new SyntaxError("Structured response was not JSON");
  }
}

export async function generateImage(prompt: string): Promise<{ bytes: Uint8Array; mime: "image/jpeg" | "image/png" | "image/webp" }> {
  const result = await xaiClient().images.generate(
    // Persist bytes immediately instead of fetching the provider's temporary URL.
    { model: XAI_IMAGE_MODEL, prompt, response_format: "b64_json" },
    // Do not automatically retry a billed generation request.
    { timeout: 45_000, maxRetries: 0 },
  );
  const image = result.data?.[0];
  if (!image) throw new ProviderError("invalid_provider_response", "The image provider returned no image.");
  if (image.b64_json) {
    const bytes = Uint8Array.from(atob(image.b64_json), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 12_000_000) throw new ProviderError("invalid_provider_response", "The generated image is too large.");
    return { bytes, mime: detectImageMime(bytes) };
  }
  if (!image.url) throw new ProviderError("invalid_provider_response", "The image provider returned no downloadable image.");
  const response = await fetch(image.url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new ProviderError("provider_unavailable", "The generated image could not be downloaded.");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 12_000_000) throw new ProviderError("invalid_provider_response", "The generated image is too large.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 12_000_000) throw new ProviderError("invalid_provider_response", "The generated image is too large.");
  return { bytes, mime: detectImageMime(bytes) };
}

function detectImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  throw new ProviderError("invalid_provider_response", "The generated file is not a supported image.");
}

type Window = { started: number; count: number };
const requestWindows = new Map<string, Window>();
export function checkAbuseLimit(userId: string, bucket: string, limit: number, periodMs = 60_000) {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  if (requestWindows.size > 5_000) {
    for (const [storedKey, window] of requestWindows) if (now - window.started >= periodMs) requestWindows.delete(storedKey);
    while (requestWindows.size > 5_000) requestWindows.delete(requestWindows.keys().next().value as string);
  }
  const current = requestWindows.get(key);
  if (!current || now - current.started >= periodMs) {
    requestWindows.set(key, { started: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new ProviderError("provider_unavailable", "Too many requests. Please wait a moment.", 429);
}

export function errorResponse(error: unknown) {
  const known = error instanceof ProviderError;
  return Response.json(
    { error: { code: known ? error.code : "internal_error", message: known ? error.message : "The request could not be completed." } },
    { status: known ? error.status : 500 },
  );
}
