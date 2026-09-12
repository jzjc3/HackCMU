import { getChatGPTUser } from "../../../chatgpt-auth";
import { apiError, authenticatedUserId, errorResponse } from "../../../../lib/server/http";
import { attachmentIsReferenced, deleteOwnedImage, readOwnedImage, findAttachment } from "../../../../lib/server/storage";
import { publicAttachment } from "../../../../lib/server/validation";

type RouteContext = { params: Promise<{ id: string }> };

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!validId(id)) return apiError(404, "attachment_not_found", "Attachment not found.");
  try {
    if (new URL(_request.url).searchParams.get('metadata') === '1') {
      const row = await findAttachment(userId, id);
      if (!row) return apiError(404, "attachment_not_found", "Attachment not found.");
      return Response.json({attachment:publicAttachment(row)}, {headers:{'Cache-Control':'private, no-store'}});
    }
    const found = await readOwnedImage(userId, id);
    if (!found) return apiError(404, "attachment_not_found", "Attachment not found.");
    return new Response(found.object.body, {
      headers: {
        "Content-Type": found.row.content_type,
        "Content-Length": String(found.row.byte_size),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(found.row.original_name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!validId(id)) return apiError(404, "attachment_not_found", "Attachment not found.");
  try {
    if (await attachmentIsReferenced(userId, id)) return apiError(409, "attachment_in_use", "Remove this attachment from its memory and save the world before deleting it.");
    if (!(await deleteOwnedImage(userId, id))) return apiError(404, "attachment_not_found", "Attachment not found.");
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
