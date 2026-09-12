import { getChatGPTUser } from "../../chatgpt-auth";
import { apiError, authenticatedUserId, errorResponse } from "../../../lib/server/http";
import { deleteWorldAndFiles, loadWorld, ownedAttachmentIds, saveWorld } from "../../../lib/server/storage";
import { MAX_WORLD_BYTES, parseWorld } from "../../../lib/server/validation";

export async function GET() {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  try {
    return Response.json({ world: await loadWorld(userId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WORLD_BYTES) return apiError(413, "world_too_large", "World data must be 1 MB or smaller.");

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_WORLD_BYTES) return apiError(413, "world_too_large", "World data must be 1 MB or smaller.");
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return apiError(400, "invalid_request", "Request body must contain world and expectedRevision.");
    const body = payload as Record<string, unknown>;
    if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return apiError(400, "invalid_revision", "expectedRevision must be a non-negative integer.");

    let world;
    try {
      world = parseWorld(body.world, await ownedAttachmentIds(userId));
    } catch (error) {
      return apiError(400, "invalid_world", error instanceof Error ? error.message : "World data is invalid.");
    }
    const result = await saveWorld(userId, world, Number(body.expectedRevision));
    if (result.conflict) return Response.json({ error: { code: "revision_conflict", message: "This world changed in another session. Reload it and retry your edit." }, world: result.world }, { status: 409 });
    return Response.json({ world: result.world }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  try {
    await deleteWorldAndFiles(userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
