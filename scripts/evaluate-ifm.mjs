import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const staging = path.resolve(here, "..");
const allFixtures = JSON.parse(await fs.readFile(path.join(staging, "eval", "fixtures.json"), "utf8"));
const coreSource = await fs.readFile(path.join(staging, "lib", "server", "extraction-core.ts"), "utf8");
const coreCompiled = ts.transpileModule(coreSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { buildExtractionSystem, normalizeExtractionCandidate, responseJsonSchemaFor } = await import(`data:text/javascript;base64,${Buffer.from(coreCompiled).toString("base64")}`);
const releaseIds = new Set(["single-career","two-events","same-event-two-dims","negation","prompt-injection","factual-numbers","correction-prior","max-six","heldout-negated-outcome","heldout-ambiguous-no-event"]);
const releaseRun = process.argv.includes("--release");
const fixtures = releaseRun ? allFixtures.filter((fixture) => releaseIds.has(fixture.id)) : allFixtures;
const IFM_MODEL = "IFM/K2-Horizon-375B-A23B";
const IFM_REASONING_EFFORT = "low";
const IFM_MAX_TOKENS = 4096;
const reportStem = releaseRun ? "release-report" : "report";
const checkpointFile = path.join(staging, "eval", `${reportStem}-checkpoint.json`);
const checkpointConfig = { model: IFM_MODEL, reasoningEffort: IFM_REASONING_EFFORT, maxTokens: IFM_MAX_TOKENS, promptVersion: 6, retryPolicy: "one-on-any-invalid-or-provider-failure", fixtureIds: fixtures.map((fixture) => fixture.id) };

async function loadKey() {
  if (process.env.IFM_API_KEY) return process.env.IFM_API_KEY;
  let cursor = staging;
  for (;;) {
    try {
      const text = await fs.readFile(path.join(cursor, ".env"), "utf8");
      const line = text.split(/\r?\n/).find((row) => /^\s*IFM_API_KEY\s*=/.test(row));
      if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

const apiKey = await loadKey();
if (!apiKey) throw new Error("IFM_API_KEY was not found; no evaluation requests were made.");

function systemFor(test) {
  return buildExtractionSystem(test.dimensions, test.context);
}

function validateShape(value, allowed) {
  if (!value || !Array.isArray(value.items) || value.items.length > 6 || !(value.question === null || typeof value.question === "string")) return false;
  return value.items.every((item) => typeof item.text === "string" && item.text.length > 0 && Array.isArray(item.dims) && item.dims.length >= 1 && item.dims.length <= 2 && item.dims.every((id) => allowed.has(id)) && typeof item.reason === "string" && typeof item.confidence === "number" && item.confidence >= 0 && item.confidence <= 1);
}

function score(test, output) {
  const texts = output.items.map((item) => item.text).join(" ").toLowerCase();
  const countOk = test.expectedCountMax != null ? output.items.length <= test.expectedCountMax : output.items.length === test.expected.length;
  const dimsOk = test.expectedCountMax != null || (countOk && test.expected.every((dims, index) => dims.length === output.items[index].dims.length && dims.every((id) => output.items[index].dims.includes(id))));
  const fidelityOk = test.required.every((term) => texts.includes(term.toLowerCase())) && test.forbidden.every((term) => !texts.includes(term.toLowerCase()));
  const clarificationOk = !test.questionExpected || (typeof output.question === "string" && output.question.length > 0);
  const emotionOk = !test.emotion || output.items.some((item) => item.emotion === test.emotion);
  return { countOk, dimsOk, fidelityOk, clarificationOk, emotionOk, passed: countOk && dimsOk && fidelityOk && clarificationOk && emotionOk };
}

async function runOnce(test, maxTokens, timeoutMs) {
  const started = performance.now();
  try {
    const response = await fetch("https://api.ifm.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: IFM_MODEL, temperature: 0.1, reasoning_effort: IFM_REASONING_EFFORT, max_tokens: maxTokens,
        response_format: { type: "json_schema", json_schema: responseJsonSchemaFor(test.dimensions) },
        messages: [{ role: "system", content: systemFor(test) }, { role: "user", content: JSON.stringify({ diaryText: test.text, context: test.context }) }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) return { id: test.id, latencyMs, providerStatus: response.status, error: `provider_http_${response.status}` };
    const body = await response.json();
    const choice = body.choices?.[0];
    if (choice?.finish_reason !== "stop") return { id: test.id, latencyMs, finishReason: choice?.finish_reason ?? null, error: "incomplete" };
    let output;
    try { output = normalizeExtractionCandidate(parseStructuredContent(choice.message?.content)); } catch { return { id: test.id, latencyMs, error: "malformed_json" }; }
    const shapeValid = validateShape(output, new Set(test.dimensions.filter((d) => d.active).map((d) => d.id)));
    if (!shapeValid) return { id: test.id, latencyMs, error: "schema_invalid", output };
    return { id: test.id, latencyMs, finishReason: choice.finish_reason, shapeValid, ...score(test, output), output };
  } catch (error) {
    return { id: test.id, latencyMs: Math.round(performance.now() - started), error: error?.name === "TimeoutError" ? "timeout" : "request_failed" };
  }
}

async function run(test) {
  const first=await runOnce(test,IFM_MAX_TOKENS,18_000);
  if(!first.error)return {...first,attempts:1};
  const second=await runOnce(test,IFM_MAX_TOKENS,24_000);
  return {...second,latencyMs:first.latencyMs+second.latencyMs,attempts:2,firstAttemptError:first.error};
}

function parseStructuredContent(content) {
  if (content && typeof content === "object") return content;
  if (typeof content !== "string") throw new SyntaxError("empty structured content");
  try { return JSON.parse(content); } catch {
    const fenced=content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if(fenced)return JSON.parse(fenced);
    const start=content.indexOf("{"),end=content.lastIndexOf("}");
    if(start>=0&&end>start)return JSON.parse(content.slice(start,end+1));
    throw new SyntaxError("not JSON");
  }
}

let results = [];
try {
  const checkpoint = JSON.parse(await fs.readFile(checkpointFile, "utf8"));
  if (JSON.stringify(checkpoint.config) === JSON.stringify(checkpointConfig) && Array.isArray(checkpoint.results)) results = checkpoint.results;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
for (const test of fixtures) {
  if (results.some((result) => result.id === test.id)) {
    process.stdout.write(`Evaluating ${test.id}... checkpoint (${results.find((result) => result.id === test.id).latencyMs} ms)\n`);
    continue;
  }
  process.stdout.write(`Evaluating ${test.id}... `);
  const result = await run(test);
  results.push(result);
  await fs.writeFile(checkpointFile, JSON.stringify({ config: checkpointConfig, results }, null, 2) + "\n");
  process.stdout.write(`${result.passed ? "pass" : result.error ?? "fail"} (${result.latencyMs} ms)\n`);
}

const completed = results.filter((r) => r.shapeValid);
const passed = results.filter((r) => r.passed);
const criticalFailures = results.filter((r) => fixtures.find((f) => f.id === r.id)?.critical && !r.passed);
const latencies = completed.map((r) => r.latencyMs).sort((a,b) => a-b);
function cohortMetrics(split) {
  const cohort = results.filter((result) => (fixtures.find((fixture) => fixture.id === result.id)?.split ?? "development") === split);
  return { total: cohort.length, completed: cohort.filter((result) => result.shapeValid).length, passed: cohort.filter((result) => result.passed).length };
}
const metrics = {
  runAt: new Date().toISOString(), model: IFM_MODEL, reasoningEffort: IFM_REASONING_EFFORT, maxTokens: IFM_MAX_TOKENS, total: results.length,
  providerCompleted: completed.length, malformed: results.filter((r) => ["malformed_json","schema_invalid"].includes(r.error)).length,
  failures: results.filter((r) => r.error).length, passed: passed.length,
  passRate: results.length ? passed.length / results.length : 0,
  eventCountAccuracy: completed.length ? completed.filter((r) => r.countOk).length / completed.length : 0,
  dimensionAccuracy: completed.length ? completed.filter((r) => r.dimsOk).length / completed.length : 0,
  // This is a fixture-keyword proxy. It does not establish semantic factuality.
  factualFidelityHeuristic: completed.length ? completed.filter((r) => r.fidelityOk).length / completed.length : 0,
  criticalFailures: criticalFailures.map((r) => r.id),
  cohorts: { development: cohortMetrics("development"), heldout: cohortMetrics("heldout") },
  latencyMs: latencies.length ? { min: latencies[0], median: latencies[Math.floor(latencies.length / 2)], p95: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * .95))], max: latencies.at(-1) } : null,
};
await fs.writeFile(path.join(staging, "eval", `${reportStem}.json`), JSON.stringify({ metrics, results }, null, 2) + "\n");
const failures = results.filter((r) => !r.passed).map((r) => `- ${r.id}: ${r.error ?? Object.entries(r).filter(([k,v]) => k.endsWith("Ok") && v === false).map(([k]) => k).join(", ")}`).join("\n") || "- None";
const md = `# IFM extraction evaluation\n\nRun: ${metrics.runAt}\n\nModel: ${metrics.model}\n\nReasoning effort: ${metrics.reasoningEffort}\n\nMax tokens: ${metrics.maxTokens}\n\nCases: ${metrics.total}\n\n## Metrics\n\n| Metric | Result |\n|---|---:|\n| Provider-completed | ${metrics.providerCompleted}/${metrics.total} |\n| Fully passed | ${metrics.passed}/${metrics.total} (${(metrics.passRate*100).toFixed(1)}%) |\n| Event-count accuracy | ${(metrics.eventCountAccuracy*100).toFixed(1)}% |\n| Dimension accuracy | ${(metrics.dimensionAccuracy*100).toFixed(1)}% |\n| Factual-fidelity heuristic | ${(metrics.factualFidelityHeuristic*100).toFixed(1)}% |\n| Malformed responses | ${metrics.malformed} |\n| Provider/request failures | ${metrics.failures} |\n| Median latency | ${metrics.latencyMs?.median ?? "n/a"} ms |\n| p95 latency | ${metrics.latencyMs?.p95 ?? "n/a"} ms |\n\n## Failures\n\n${failures}\n\nNo local fallback is used or counted. Factual fidelity is a required/forbidden-term heuristic, not a semantic factuality guarantee. Full sanitized outputs and per-case latency are in report.json; credentials and headers are never written.\n`;
await fs.writeFile(path.join(staging, "eval", `${reportStem}.md`), md);
await fs.rm(checkpointFile, { force: true });
console.log(JSON.stringify(metrics, null, 2));
