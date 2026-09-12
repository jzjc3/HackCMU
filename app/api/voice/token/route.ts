import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { checkAbuseLimit, errorResponse, ProviderError, XAI_VOICE_MODEL } from "@/lib/server/ai";
import { z } from "zod";

const SecretSchema = z.object({ value: z.string().min(1), expires_at: z.number().optional() }).passthrough();

export async function POST() {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: { code: "unauthorized", message: "Sign in to use voice." } }, { status: 401 });
    checkAbuseLimit(user.userId, "voice-token", 10);
    if (!env.XAI_API_KEY) throw new ProviderError("provider_unavailable", "Realtime voice is not configured.", 503);
    const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new ProviderError("provider_unavailable", "Realtime voice is temporarily unavailable.", response.status === 429 ? 429 : 502);
    const parsed = SecretSchema.safeParse(await response.json());
    if (!parsed.success) throw new ProviderError("invalid_provider_response", "The voice provider returned an invalid credential.");
    return Response.json({ token: parsed.data.value, expiresAt: parsed.data.expires_at ?? null, model: XAI_VOICE_MODEL, url: `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(XAI_VOICE_MODEL)}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
