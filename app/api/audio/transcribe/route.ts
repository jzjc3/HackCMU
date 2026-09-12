import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { checkAbuseLimit, errorResponse, ProviderError } from "@/lib/server/ai";
import { z } from "zod";

const MAX_AUDIO_BYTES = 20_000_000;
const allowed = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg", "audio/opus", "audio/flac", "audio/aac", "audio/x-m4a", "video/x-matroska"]);
const ResultSchema = z.object({ text: z.string(), language: z.string().optional(), duration: z.number().optional() }).passthrough();

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: { code: "unauthorized", message: "Sign in to transcribe audio." } }, { status: 401 });
    checkAbuseLimit(user.userId, "transcribe", 8);
    if (!env.XAI_API_KEY) throw new ProviderError("provider_unavailable", "Transcription is not configured.", 503);
    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_AUDIO_BYTES || !allowed.has(file.type)) {
      return Response.json({ error: { code: "invalid_audio", message: "Use a supported audio file up to 20 MB." } }, { status: 400 });
    }
    const form = new FormData();
    form.append("format", "true");
    form.append("language", "en");
    form.append("file", file, file.name || "recording.webm"); // xAI requires file last.
    const response = await fetch("https://api.x.ai/v1/stt", {
      method: "POST", headers: { Authorization: `Bearer ${env.XAI_API_KEY}` }, body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ProviderError("provider_unavailable", "Transcription is temporarily unavailable.", response.status === 429 ? 429 : 502);
    const parsed = ResultSchema.safeParse(await response.json());
    if (!parsed.success || !parsed.data.text.trim()) throw new ProviderError("invalid_provider_response", "No speech was detected.", 422);
    return Response.json({ text: parsed.data.text.trim() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
