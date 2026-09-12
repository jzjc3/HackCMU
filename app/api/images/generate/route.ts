import { getChatGPTUser } from "@/app/chatgpt-auth";
import { checkAbuseLimit, errorResponse, generateImage } from "@/lib/server/ai";
import { loadWorld, storeImage } from "@/lib/server/storage";
import { z } from "zod";

const BodySchema = z.object({ prompt: z.string().trim().min(5).max(1_500), memoryId: z.string().max(100).optional() }).strict();

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: { code: "unauthorized", message: "Sign in to generate an illustration." } }, { status: 401 });
    checkAbuseLimit(user.userId, "image", 3, 10 * 60_000);
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) return Response.json({ error: { code: "invalid_request", message: "Enter a valid image prompt." } }, { status: 400 });
    if (body.data.memoryId) {
      const world = await loadWorld(user.userId);
      if (!world.memories.some((memory) => memory.id === body.data.memoryId)) {
        return Response.json({ error: { code: "memory_not_found", message: "That memory is not available." } }, { status: 404 });
      }
    }
    const generated = await generateImage(body.data.prompt);
    const extension = generated.mime === "image/jpeg" ? "jpg" : generated.mime.split("/")[1];
    const attachment = await storeImage(user.userId, generated.bytes, generated.mime, `mind-travel-illustration.${extension}`, "generated", crypto.randomUUID());
    return Response.json({ attachment }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
