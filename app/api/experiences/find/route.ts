import { getChatGPTUser } from "@/app/chatgpt-auth";
import { FindExperiencesArgsSchema } from "@/lib/experience-lookup";
import { checkAbuseLimit, errorResponse } from "@/lib/server/ai";
import { findExperiences } from "@/lib/server/experience-lookup";

export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: { code: "unauthorized", message: "Sign in to find saved experiences." } }, { status: 401 });
    checkAbuseLimit(user.userId, "experience-lookup", 20);
    const body = FindExperiencesArgsSchema.safeParse(await request.json());
    if (!body.success) return Response.json({ error: { code: "invalid_request", message: "Enter a search phrase between 1 and 200 characters." } }, { status: 400 });
    const result = await findExperiences(user.userId, body.data);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
