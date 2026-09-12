import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { loader, moduleUrl } from "./test-loader.mjs";

const sql = new DatabaseSync(":memory:");
sql.exec("CREATE TABLE worlds (user_id TEXT PRIMARY KEY, document_json TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");

const calls = [];
const prepare = (query) => {
  let values = [];
  return {
    bind(...args) { values = args; calls.push({ query, values }); return this; },
    async all() { return { results: sql.prepare(query).all(...values) }; },
  };
};
globalThis.__lookupTestEnv = { DB: { prepare } };

const dimensions = [
  { id: "travel", name: "Travel" },
  { id: "career", name: "Career" },
];
const memory = (id, text, created, dims = ["travel"], date = "2026-09-12") => ({ id, text, title: "", date, dims, emotion: null, importance: null, clarity: null, created });
const aliceMemories = [
  memory("case", "Pittsburgh Robotics Expo", 90, ["career"]),
  memory("percent", "Finished 100% of the trail", 80),
  memory("underscore", "The literal file_name was memorable", 70),
  memory("backslash", "Saved it under C:\\Users\\alice", 60),
  memory("chinese", "我在上海外滩看日出", 50),
  memory("long", `needle ${"x".repeat(8_100)}`, 40),
  ...Array.from({ length: 12 }, (_, index) => memory(`many-${String(index).padStart(2, "0")}`, `shared result ${index}`, 30 - index)),
];
const insert = sql.prepare("INSERT INTO worlds (user_id, document_json, revision, created_at, updated_at) VALUES (?, ?, 1, 0, 0)");
insert.run("alice", JSON.stringify({ dims: dimensions, memories: aliceMemories }));
insert.run("bob", JSON.stringify({ dims: dimensions, memories: [memory("bob-secret", "secret beach memory", 100)] }));

const load = loader({ "cloudflare:workers": moduleUrl("export const env=globalThis.__lookupTestEnv;") });
const { findExperiences } = await load("lib/server/experience-lookup.ts");

const caseMatch = await findExperiences("alice", { query: "ROBOTICS" });
assert.deepEqual(caseMatch.results.map((item) => item.id), ["case"], "matching is case-insensitive");
assert.deepEqual(caseMatch.results[0].categories, [{ id: "career", name: "Career" }]);

for (const [query, id] of [["%", "percent"], ["_", "underscore"], ["\\", "backslash"], ["上海", "chinese"]]) {
  assert.deepEqual((await findExperiences("alice", { query })).results.map((item) => item.id), [id], `${query} is matched literally`);
}
assert.equal((await findExperiences("alice", { query: "secret" })).results.length, 0, "another user's records are isolated");
assert.deepEqual((await findExperiences("bob", { query: "secret" })).results.map((item) => item.id), ["bob-secret"]);
assert.equal((await findExperiences("alice", { query: "not present" })).results.length, 0);
assert.equal((await findExperiences("alice", { query: "' OR 1=1 --" })).results.length, 0, "SQL-shaped text remains a literal parameter");
assert.equal((await findExperiences("alice", { query: "q".repeat(200) })).results.length, 0, "the documented query boundary is accepted");

const bounded = await findExperiences("alice", { query: "shared" });
assert.equal(bounded.results.length, 5, "default result limit is five");
assert.equal(bounded.hasMore, true);
assert.deepEqual(bounded.results.map((item) => item.id), ["many-00", "many-01", "many-02", "many-03", "many-04"], "results have deterministic newest-first order");
assert.equal((await findExperiences("alice", { query: "shared", limit: 10 })).results.length, 10);

const long = (await findExperiences("alice", { query: "needle" })).results[0];
assert.equal(long.text.length, 8_000);
assert.equal(long.textTruncated, true);

await assert.rejects(findExperiences("alice", { query: "   " }), /too_small|String must contain|at least 1/i);
await assert.rejects(findExperiences("alice", { query: "中".repeat(201) }), /too_big|String must contain|at most 200/i);
await assert.rejects(findExperiences("alice", { query: "x" + " ".repeat(200) }), /too_big|String must contain|at most 200/i, "oversized raw input cannot bypass the limit through trimming");
await assert.rejects(findExperiences("alice", { query: "shared", limit: 11 }), /too_big|less than or equal to 10/i);
assert.equal(calls.at(-1).values[0], "alice", "authenticated owner is bound as a query parameter");
assert.ok(calls.some((call) => call.values[1] === "%\\%%"), "LIKE wildcard characters are escaped in a bound parameter");
assert.ok(calls.every((call) => call.query.includes("world.user_id = ?")), "owner is never interpolated into SQL");

globalThis.__lookupRouteUser = null;
globalThis.__lookupRateCalls = [];
const routeLoad = loader({
  "cloudflare:workers": moduleUrl("export const env=globalThis.__lookupTestEnv;"),
  "@/app/chatgpt-auth": moduleUrl("export async function getChatGPTUser(){return globalThis.__lookupRouteUser}"),
  "@/lib/server/ai": moduleUrl("export function checkAbuseLimit(userId,bucket,limit){globalThis.__lookupRateCalls.push({userId,bucket,limit})} export function errorResponse(){return Response.json({error:{code:'internal_error',message:'failed'}},{status:500})}"),
});
const route = await routeLoad("app/api/experiences/find/route.ts");
const post = (body) => route.POST(new Request("https://mind.local/api/experiences/find", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));
assert.equal((await post({ query: "secret" })).status, 401, "the route requires authenticated server identity");
globalThis.__lookupRouteUser = { userId: "alice" };
assert.equal((await post({ query: "secret", userId: "bob" })).status, 400, "a client cannot supply or override the owner");
assert.equal((await (await post({ query: "secret" })).json()).results.length, 0, "the route scopes lookup to its authenticated owner");
globalThis.__lookupRouteUser = { userId: "bob" };
assert.deepEqual((await (await post({ query: "secret" })).json()).results.map((item) => item.id), ["bob-secret"]);
assert.ok(globalThis.__lookupRateCalls.every((call) => call.bucket === "experience-lookup" && call.limit === 20));

sql.close();
console.log("Experience lookup checks passed: route auth, isolation, literal matching, Chinese input, validation, deterministic bounds, categories, and truncation.");
