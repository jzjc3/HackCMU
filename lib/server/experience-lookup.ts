import { env } from "cloudflare:workers";
import {
  FindExperiencesArgsSchema,
  type FindExperiencesResult,
  type FoundExperience,
} from "../experience-lookup";

const MAX_RESULT_TEXT = 8_000;

type LookupRow = {
  id: string;
  text: string;
  date: string;
  created: number;
  memory_dims: string;
  world_dims: string;
};

function db(): D1Database {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

function escapeLikeLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toExperience(row: LookupRow): FoundExperience {
  const categoryIds = parseArray(row.memory_dims).filter((value): value is string => typeof value === "string").slice(0, 7);
  const categoryNames = new Map(
    parseArray(row.world_dims)
      .filter((value): value is { id: string; name: string } => {
        if (typeof value !== "object" || value === null) return false;
        const item = value as Record<string, unknown>;
        return typeof item.id === "string" && typeof item.name === "string";
      })
      .map((value) => [value.id, value.name.slice(0, 100)]),
  );
  const text = typeof row.text === "string" ? row.text : "";
  return {
    id: String(row.id).slice(0, 128),
    text: text.slice(0, MAX_RESULT_TEXT),
    textTruncated: text.length > MAX_RESULT_TEXT,
    categories: categoryIds.map((id) => ({ id: id.slice(0, 128), name: categoryNames.get(id) ?? id.slice(0, 100) })),
    date: typeof row.date === "string" ? row.date.slice(0, 10) : "",
    created: Number.isFinite(Number(row.created)) ? Number(row.created) : 0,
  };
}

export async function findExperiences(userId: string, args: unknown): Promise<FindExperiencesResult> {
  if (!userId.trim()) throw new Error("An authenticated user is required to find experiences.");
  const { query, limit } = FindExperiencesArgsSchema.parse(args);
  const pattern = `%${escapeLikeLiteral(query)}%`;
  const result = await db().prepare(`
    SELECT
      CAST(json_extract(memory.value, '$.id') AS TEXT) AS id,
      CAST(json_extract(memory.value, '$.text') AS TEXT) AS text,
      CAST(json_extract(memory.value, '$.date') AS TEXT) AS date,
      CAST(json_extract(memory.value, '$.created') AS INTEGER) AS created,
      COALESCE(json_extract(memory.value, '$.dims'), '[]') AS memory_dims,
      COALESCE(json_extract(world.document_json, '$.dims'), '[]') AS world_dims
    FROM worlds AS world, json_each(world.document_json, '$.memories') AS memory
    WHERE world.user_id = ?
      AND LOWER(CAST(json_extract(memory.value, '$.text') AS TEXT)) LIKE LOWER(?) ESCAPE '\\'
    ORDER BY created DESC, id ASC
    LIMIT ?
  `).bind(userId, pattern, limit + 1).all<LookupRow>();
  const rows = result.results.slice(0, limit);
  return { query, results: rows.map(toExperience), hasMore: result.results.length > limit };
}
