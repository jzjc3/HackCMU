import { getChatGPTUser } from "@/app/chatgpt-auth";
import { checkAbuseLimit, errorResponse, extractExperiences } from "@/lib/server/ai";
import { loadWorld } from "@/lib/server/storage";
import { z } from "zod";

const BodySchema = z.object({
  text: z.string().trim().min(2).max(8_000),
  context: z.object({
    recent: z.array(z.object({ text: z.string().max(500), dims: z.array(z.string()).max(2).optional() })).max(8).optional(),
    priorItems: z.array(z.object({
      text: z.string().max(1_200), dims: z.array(z.string()).min(1).max(2), reason: z.string().max(240),
      emotion: z.enum(["Proud", "Calm", "Grateful", "Nervous", "Sad", "Curious", "Tired"]).nullable(),
      confidence: z.number().min(0).max(1),
    })).max(6).optional(),
    correction: z.string().trim().max(800).optional(),
  }).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: { code: "unauthorized", message: "Sign in to sort experiences." } }, { status: 401 });
    checkAbuseLimit(user.userId, "extract", 12);
    const body = BodySchema.safeParse(await request.json());
    if (!body.success) return Response.json({ error: { code: "invalid_request", message: "Enter a valid description." } }, { status: 400 });
    const world = await loadWorld(user.userId);
    if (!world) return Response.json({ error: { code: "world_not_found", message: "Set up your world first." } }, { status: 409 });
    const dimensions = world.dims.map((d) => ({ id: d.id, name: d.name, active: d.active }));
    const result = await extractExperiences({ text: body.data.text, dimensions, context: body.data.context });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
