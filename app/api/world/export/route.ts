import { getChatGPTUser } from "../../../chatgpt-auth";
import { authenticatedUserId, errorResponse } from "../../../../lib/server/http";
import { loadWorld } from "../../../../lib/server/storage";

export async function GET() {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  try {
    const world = await loadWorld(userId);
    return new Response(JSON.stringify(world, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="mind-travel-world.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

