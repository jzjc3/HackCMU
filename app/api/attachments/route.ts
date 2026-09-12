import { getChatGPTUser } from "../../chatgpt-auth";
import { apiError, authenticatedUserId, errorResponse } from "../../../lib/server/http";
import { storeImage } from "../../../lib/server/storage";
import { detectImageType, MAX_IMAGE_BYTES, sanitizeName, validateRequestKey } from "../../../lib/server/validation";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const userId = await authenticatedUserId(getChatGPTUser);
  if (userId instanceof Response) return userId;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES + 256_000) return apiError(413, "file_too_large", "Images must be 10 MB or smaller.");

  try {
    let requestKey: string | null;
    try {
      requestKey = validateRequestKey(request.headers.get("Idempotency-Key"));
    } catch (error) {
      return apiError(400, "invalid_idempotency_key", (error as Error).message);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError(400, "file_required", "A multipart image field named file is required.");
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return apiError(413, "file_too_large", "Images must be between 1 byte and 10 MB.");
    if (!ALLOWED_TYPES.has(file.type)) return apiError(415, "unsupported_image", "Only JPEG, PNG, and WebP images are supported.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectImageType(bytes);
    if (!detected || detected !== file.type) return apiError(415, "image_type_mismatch", "The file contents do not match its declared image type.");

    const attachment = await storeImage(userId, bytes, detected, sanitizeName(file.name), "upload", requestKey);
    return Response.json({ attachment }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

