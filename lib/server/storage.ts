import { env } from "cloudflare:workers";
import { emptyWorld, type Attachment, type AttachmentKind, type World } from "./world-types";
import { detectImageType, MAX_IMAGE_BYTES, publicAttachment, sanitizeName, validateRequestKey } from "./validation";

type AttachmentRow = {
  id: string;
  user_id: string;
  object_key: string;
  content_type: string;
  original_name: string;
  kind: AttachmentKind;
  byte_size: number;
  request_key: string | null;
  created_at: number;
};

function db(): D1Database {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

function bucket(): R2Bucket {
  if (!env.BUCKET) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable.");
  return env.BUCKET;
}

async function loadStoredWorld(userId: string): Promise<World | null> {
  const row = await db().prepare("SELECT document_json, revision FROM worlds WHERE user_id = ? LIMIT 1").bind(userId).first<{ document_json: string; revision: number }>();
  if (!row) return null;
  return { ...(JSON.parse(row.document_json) as Omit<World, "revision">), revision: row.revision };
}

export async function loadWorld(userId: string): Promise<World> {
  return (await loadStoredWorld(userId)) ?? emptyWorld();
}

export async function ownedAttachmentIds(userId: string): Promise<Set<string>> {
  const result = await db().prepare("SELECT id FROM attachments WHERE user_id = ?").bind(userId).all<{ id: string }>();
  return new Set(result.results.map((row) => row.id));
}

export async function saveWorld(userId: string, world: Omit<World, "revision">, expectedRevision: number): Promise<{ world: World; conflict: boolean }> {
  const documentJson = JSON.stringify(world);
  const current = await loadStoredWorld(userId);
  if (current && current.revision !== expectedRevision) {
    const { revision: _revision, ...currentDocument } = current;
    if (JSON.stringify(currentDocument) === documentJson) return { world: current, conflict: false };
    return { world: current, conflict: true };
  }
  if (!current && expectedRevision !== 0) return { world: { ...world, revision: 0 }, conflict: true };

  const nextRevision = expectedRevision + 1;
  const now = Date.now();
  let changed = false;
  if (current) {
    const result = await db().prepare("UPDATE worlds SET document_json = ?, revision = ?, updated_at = ? WHERE user_id = ? AND revision = ?").bind(documentJson, nextRevision, now, userId, expectedRevision).run();
    changed = result.meta.changes === 1;
  } else {
    const result = await db().prepare("INSERT OR IGNORE INTO worlds (user_id, document_json, revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").bind(userId, documentJson, now, now).run();
    changed = result.meta.changes === 1;
  }
  if (changed) return { world: { ...world, revision: nextRevision }, conflict: false };

  const winner = await loadStoredWorld(userId);
  if (!winner) throw new Error("Concurrent world write did not produce a readable document");
  const { revision: _revision, ...winnerDocument } = winner;
  return { world: winner, conflict: JSON.stringify(winnerDocument) !== documentJson };
}

export async function findAttachment(userId: string, id: string): Promise<AttachmentRow | null> {
  return db().prepare("SELECT * FROM attachments WHERE id = ? AND user_id = ? LIMIT 1").bind(id, userId).first<AttachmentRow>();
}

async function findAttachmentByRequestKey(userId: string, requestKey: string): Promise<AttachmentRow | null> {
  return db().prepare("SELECT * FROM attachments WHERE user_id = ? AND request_key = ? LIMIT 1").bind(userId, requestKey).first<AttachmentRow>();
}

async function removeStaleOrphans(userId: string): Promise<void> {
  const cutoff=Date.now()-7*24*60*60*1000;
  const result=await db().prepare("SELECT * FROM attachments WHERE user_id = ? AND created_at < ? LIMIT 100").bind(userId,cutoff).all<AttachmentRow>();
  if(!result.results.length)return;
  const world=await loadStoredWorld(userId);
  const referenced=new Set(world?.memories.flatMap(memory=>memory.attachmentIds??[])??[]);
  const stale=result.results.filter(row=>!referenced.has(row.id));
  if(!stale.length)return;
  await bucket().delete(stale.map(row=>row.object_key));
  await db().batch(stale.map(row=>db().prepare("DELETE FROM attachments WHERE id = ? AND user_id = ?").bind(row.id,userId)));
}

export async function storeImage(
  userId: string,
  input: Uint8Array | ArrayBuffer,
  mime: "image/jpeg" | "image/png" | "image/webp",
  name: string,
  kind: AttachmentKind,
  requestKey: string | null = null,
): Promise<Attachment> {
  await removeStaleOrphans(userId);
  requestKey = validateRequestKey(requestKey);
  if (requestKey) {
    const existing = await findAttachmentByRequestKey(userId, requestKey);
    if (existing) return publicAttachment(existing);
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image must be between 1 byte and 10 MB");
  const detected = detectImageType(bytes);
  if (!detected || detected !== mime) throw new Error("Image bytes do not match the declared JPEG, PNG, or WebP type");

  const id = crypto.randomUUID();
  const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const objectKey = `users/${encodeURIComponent(userId)}/attachments/${id}.${extension}`;
  const originalName = sanitizeName(name);
  const createdAt = Date.now();
  await bucket().put(objectKey, bytes, { httpMetadata: { contentType: mime }, customMetadata: { attachmentId: id, kind } });

  try {
    await db().prepare("INSERT INTO attachments (id, user_id, object_key, content_type, original_name, kind, byte_size, request_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, userId, objectKey, mime, originalName, kind, bytes.byteLength, requestKey, createdAt).run();
  } catch (error) {
    await bucket().delete(objectKey);
    if (requestKey) {
      const existing = await findAttachmentByRequestKey(userId, requestKey);
      if (existing) return publicAttachment(existing);
    }
    throw error;
  }
  return { id, url: `/api/attachments/${encodeURIComponent(id)}`, contentType: mime, name: originalName, kind, size: bytes.byteLength, created: createdAt };
}

export async function readOwnedImage(userId: string, id: string): Promise<{ row: AttachmentRow; object: R2ObjectBody } | null> {
  const row = await findAttachment(userId, id);
  if (!row) return null;
  const object = await bucket().get(row.object_key);
  if (!object) throw new Error("Attachment metadata exists but its file is unavailable");
  return { row, object };
}

export async function deleteOwnedImage(userId: string, id: string): Promise<boolean> {
  const row = await findAttachment(userId, id);
  if (!row) return false;
  await bucket().delete(row.object_key);
  const result = await db().prepare("DELETE FROM attachments WHERE id = ? AND user_id = ?").bind(id, userId).run();
  return result.meta.changes === 1;
}

export async function attachmentIsReferenced(userId: string, id: string): Promise<boolean> {
  const world = await loadStoredWorld(userId);
  return Boolean(world?.memories.some((memory) => memory.attachmentIds?.includes(id)));
}

export async function deleteWorldAndFiles(userId: string): Promise<void> {
  const rows = await db().prepare("SELECT object_key FROM attachments WHERE user_id = ?").bind(userId).all<{ object_key: string }>();
  if (rows.results.length) await bucket().delete(rows.results.map((row) => row.object_key));
  await db().batch([
    db().prepare("DELETE FROM attachments WHERE user_id = ?").bind(userId),
    db().prepare("DELETE FROM worlds WHERE user_id = ?").bind(userId),
  ]);
}
