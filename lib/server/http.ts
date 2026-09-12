export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export async function authenticatedUserId(
  getUser: () => Promise<{ userId: string } | null>,
): Promise<string | Response> {
  const user = await getUser();
  return user?.userId || apiError(401, "unauthorized", "Sign in with ChatGPT to continue.");
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (message.includes("binding `DB`")) return apiError(503, "database_unavailable", "Saved memories are temporarily unavailable. Please try again.");
  if (message.includes("binding `BUCKET`")) return apiError(503, "file_storage_unavailable", "Image storage is temporarily unavailable. Please try again.");
  return apiError(500, "internal_error", "The request could not be completed.");
}
