/**
 * Test harness — runs the candidate's fetchAll against the test server and
 * validates correctness.  Start the server first:  npm run server
 *
 * Usage:  npx tsx test-harness.ts [path/to/solution.ts]
 */

import { resolve } from "node:path";

const solutionPath = resolve(process.argv[2] || "./solution.ts");
const { fetchAll } = await import(solutionPath);

type Result =
  | { url: string; body: string }
  | { url: string; error: string };

const SERVER = process.env.SERVER_URL || "http://localhost:3000";

function isSuccess(r: Result | undefined): r is { url: string; body: string } {
  return r != null && typeof r === "object" && "body" in r && !("error" in r);
}

function isFailure(r: Result | undefined): r is { url: string; error: string } {
  return r != null && typeof r === "object" && "error" in r;
}

function describeResult(r: Result | undefined): string {
  if (r == null) return "undefined";
  if ("error" in r) return r.error;
  if ("body" in r) return "success";
  return JSON.stringify(r);
}

async function main(): Promise<void> {
  console.log(`Solution: ${solutionPath}\n`);
  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  const urlsRes = await fetch(`${SERVER}/urls`);
  if (!urlsRes.ok) {
    console.error("Could not reach server at", SERVER);
    process.exit(1);
  }
  const urls: string[] = await urlsRes.json() as string[];
  console.log(`Fetched ${urls.length} URLs from server\n`);

  await fetch(`${SERVER}/reset`, { method: "POST" });

  // ------------------------------------------------------------------
  // Run candidate solution
  // ------------------------------------------------------------------
  const start = performance.now();
  let results: Result[];
  try {
    results = await fetchAll(urls, {
      maxConcurrent: 10,
      maxRequestsPerSecond: 15,
    });
  } catch (err) {
    console.error("FAIL — fetchAll threw an exception:", err);
    process.exit(1);
  }
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);

  // ------------------------------------------------------------------
  // Validate return value
  // ------------------------------------------------------------------
  if (!Array.isArray(results)) {
    console.error(
      `FAIL — fetchAll must return an array, got ${typeof results}: ${JSON.stringify(results)}`,
    );
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Validate result shape
  // ------------------------------------------------------------------
  function isValidResult(r: unknown): r is Result {
    if (r == null || typeof r !== "object") return false;
    if (!("url" in r) || typeof (r as any).url !== "string") return false;
    // Must be either a success (has body) or a failure (has error)
    if ("body" in r && typeof (r as any).body === "string") return true;
    if ("error" in r && typeof (r as any).error === "string") return true;
    return false;
  }

  const invalid = results
    .map((r, i) => [i, r] as const)
    .filter(([, r]) => !isValidResult(r));

  if (invalid.length > 0) {
    console.error(
      `FAIL — ${invalid.length} result(s) have an invalid shape.` +
      ` Each result must have { url, status, body } or { url, error }.`,
    );
    for (const [i, r] of invalid.slice(0, 5)) {
      console.error(`  [${i}]:`, JSON.stringify(r));
    }
    if (invalid.length > 5) {
      console.error(`  ... and ${invalid.length - 5} more`);
    }
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Checks
  // ------------------------------------------------------------------
  let passed = 0;
  let failed = 0;

  function check(name: string, ok: boolean, detail?: string): void {
    if (ok) {
      console.log(`  PASS  ${name}`);
      passed++;
    } else {
      console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  }

  console.log("Results:");

  // 1. Coverage
  check(
    "All URLs covered",
    results.length === urls.length,
    `expected ${urls.length}, got ${results.length}`,
  );

  // 2. Ordering preserved
  const ordered = results.every((r, i) => r?.url === urls[i]);
  check("Ordering preserved", ordered);

  // 3. Transient errors recovered (IDs 90-94 → should end up as Success)
  const transientOk = [90, 91, 92, 93, 94].every(
    (id) => isSuccess(results[id]),
  );
  check(
    "Transient 5xx errors retried and recovered",
    transientOk,
    [90, 91, 92, 93, 94]
      .filter((id) => !isSuccess(results[id]))
      .map((id) => `item ${id}: ${describeResult(results[id])}`)
      .join(", "),
  );

  // 4. Permanent errors captured as Failure (IDs 95-99 → Failure, not thrown)
  const permanentOk = [95, 96, 97, 98, 99].every(
    (id) => isFailure(results[id]),
  );
  check(
    "Permanent errors captured (not thrown)",
    permanentOk,
    [95, 96, 97, 98, 99]
      .filter((id) => !isFailure(results[id]))
      .map((id) => `item ${id}: ${describeResult(results[id])}`)
      .join(", "),
  );

  // 5. Fast items (0-79)
  const fastOk =
    results.length >= 80 &&
    results.slice(0, 80).every((r) => isSuccess(r));
  check("Fast items (0-79) succeeded", fastOk);

  // 6. Slow items (80-89)
  const slowOk =
    results.length >= 90 &&
    results.slice(80, 90).every((r) => isSuccess(r));
  check("Slow items (80-89) succeeded", slowOk);

  // 7. Concurrency — server tracked peak in-flight requests
  const statsRes = await fetch(`${SERVER}/stats`);
  const stats = (await statsRes.json()) as {
    rateLimit: number;
    currentWindowRequests: number;
    peakConcurrency: number;
    peakWindowRequests: number;
    attemptCounts: Record<string, number>;
  };
  check(
    "Used concurrency",
    stats.peakConcurrency > 1,
    `peak was ${stats.peakConcurrency} (sequential)`,
  );
  check(
    "Respected concurrency limit",
    stats.peakConcurrency <= 10,
    `peak was ${stats.peakConcurrency}, limit is 10`,
  );

  // 8. Rate limiting — server tracked peak requests in any 1-second window
  check(
    "Respected rate limit",
    stats.peakWindowRequests <= 15,
    `peak was ${stats.peakWindowRequests} req/s, limit is 15`,
  );

  // 9. Server confirms retries actually happened (IDs 90-94 need >= 2 attempts)
  const retriedOnServer = [90, 91, 92, 93, 94].every(
    (id) => (stats.attemptCounts[id] ?? 0) >= 2,
  );
  check(
    "Transient items retried (server-side)",
    retriedOnServer,
    [90, 91, 92, 93, 94]
      .filter((id) => (stats.attemptCounts[id] ?? 0) < 2)
      .map((id) => `item ${id}: ${stats.attemptCounts[id] ?? 0} attempt(s)`)
      .join(", "),
  );

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed — ${elapsed}s elapsed`);
  console.log("\nServer stats:", JSON.stringify(stats, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

main();
