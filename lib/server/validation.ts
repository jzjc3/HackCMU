import { EMOTIONS, REGIONS, type Attachment, type World } from "./world-types";

export const MAX_WORLD_BYTES = 1_048_576;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortString(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
}

function rating(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5);
}

export function parseWorld(value: unknown, ownedAttachmentIds: Set<string>): Omit<World, "revision"> {
  if (!object(value)) throw new Error("world must be an object");
  if (typeof value.setupDone !== "boolean") throw new Error("setupDone must be a boolean");
  if (!Array.isArray(value.dims) || value.dims.length > 7) throw new Error("dims must contain at most 7 dimensions");

  const dimensionIds = new Set<string>();
  const dims = value.dims.map((raw, index) => {
    if (!object(raw) || !shortString(raw.id, 128) || !ID.test(raw.id)) throw new Error(`dims[${index}].id is invalid`);
    if (dimensionIds.has(raw.id)) throw new Error("dimension ids must be unique");
    dimensionIds.add(raw.id);
    if (!shortString(raw.name, 100) || !REGIONS.includes(raw.region as never) || !shortString(raw.color, 7) || !HEX.test(raw.color) || typeof raw.active !== "boolean") {
      throw new Error(`dims[${index}] is invalid`);
    }
    return { id: raw.id, name: raw.name.trim(), region: raw.region as (typeof REGIONS)[number], color: raw.color.toLowerCase(), active: raw.active };
  });

  if (!Array.isArray(value.memories) || value.memories.length > 10_000) throw new Error("memories must contain at most 10000 items");
  const memoryIds = new Set<string>();
  const memories = value.memories.map((raw, index) => {
    if (!object(raw) || !shortString(raw.id, 128) || !ID.test(raw.id)) throw new Error(`memories[${index}].id is invalid`);
    if (memoryIds.has(raw.id)) throw new Error("memory ids must be unique");
    memoryIds.add(raw.id);
    if (!shortString(raw.text, 10_000) || !shortString(raw.title, 300, true) || !shortString(raw.date, 10) || !validDate(raw.date)) throw new Error(`memories[${index}] text, title, or date is invalid`);
    if (!Array.isArray(raw.dims) || raw.dims.length < 1 || raw.dims.length > 7 || raw.dims.some((id) => typeof id !== "string" || !dimensionIds.has(id))) throw new Error(`memories[${index}].dims is invalid`);
    const dimsForMemory = [...new Set(raw.dims as string[])];
    if (raw.emotion !== null && !EMOTIONS.includes(raw.emotion as never)) throw new Error(`memories[${index}].emotion is invalid`);
    if (!rating(raw.importance) || !rating(raw.clarity)) throw new Error(`memories[${index}] ratings are invalid`);
    if (!Number.isSafeInteger(raw.created) || Number(raw.created) < 0) throw new Error(`memories[${index}].created is invalid`);

    const attachmentIds = raw.attachmentIds === undefined ? [] : raw.attachmentIds;
    if (!Array.isArray(attachmentIds) || attachmentIds.length > 10 || attachmentIds.some((id) => typeof id !== "string" || !ownedAttachmentIds.has(id))) {
      throw new Error(`memories[${index}].attachmentIds contains an unavailable attachment`);
    }
    const uniqueAttachments = [...new Set(attachmentIds as string[])];
    const expectedPhoto = uniqueAttachments[0] ? `/api/attachments/${encodeURIComponent(uniqueAttachments[0])}` : undefined;
    if (raw.photo !== undefined && raw.photo !== expectedPhoto) throw new Error(`memories[${index}].photo must reference its first owned attachment`);

    return {
      id: raw.id,
      text: raw.text.trim(),
      title: raw.title.trim(),
      date: raw.date,
      dims: dimsForMemory,
      emotion: raw.emotion as (typeof EMOTIONS)[number] | null,
      importance: raw.importance as number | null,
      clarity: raw.clarity as number | null,
      created: Number(raw.created),
      ...(uniqueAttachments.length ? { attachmentIds: uniqueAttachments, photo: expectedPhoto } : {}),
    };
  });

  if (!object(value.overrides)) throw new Error("overrides must be an object");
  const overrides: World["overrides"] = {};
  for (const [region, raw] of Object.entries(value.overrides)) {
    if (!REGIONS.includes(region as never) || !object(raw)) throw new Error("overrides contains an invalid region");
    const color = raw.color;
    const opacity = raw.opacity;
    if (color !== undefined && (typeof color !== "string" || !HEX.test(color))) throw new Error(`override color for ${region} is invalid`);
    if (opacity !== undefined && (typeof opacity !== "number" || opacity < 0.3 || opacity > 1)) throw new Error(`override opacity for ${region} is invalid`);
    overrides[region as (typeof REGIONS)[number]] = { ...(color === undefined ? {} : { color: color.toLowerCase() }), ...(opacity === undefined ? {} : { opacity }) };
  }

  if (value.lastOpened !== null && !shortString(value.lastOpened, 128)) throw new Error("lastOpened is invalid");
  return { setupDone: value.setupDone, dims, memories, overrides, lastOpened: value.lastOpened as string | null };
}

export function sanitizeName(value: string): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return clean || "image";
}

export function validateRequestKey(value: string | null): string | null {
  if (value === null) return null;
  if (value.length < 8 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error("Idempotency-Key must be 8-128 safe characters");
  return value;
}

export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function publicAttachment(row: { id: string; content_type: string; original_name: string; kind: string; byte_size: number; created_at: number }): Attachment {
  return { id: row.id, url: `/api/attachments/${encodeURIComponent(row.id)}`, contentType: row.content_type, name: row.original_name, kind: row.kind as Attachment["kind"], size: row.byte_size, created: row.created_at };
}
