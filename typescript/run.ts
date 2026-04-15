/**
 * Runner — calls your fetchAll with the server's URL list and prints results.
 * Use this to experiment before running the test harness.
 *
 * Usage:  npx tsx run.ts [path/to/solution.ts]
 */

import { resolve } from "node:path";

const solutionPath = resolve(process.argv[2] || "./solution.ts");
const { fetchAll } = await import(solutionPath);

const SERVER = process.env.SERVER_URL || "http://localhost:3000";

const urlsRes = await fetch(`${SERVER}/urls`);
if (!urlsRes.ok) {
  console.error("Could not reach server at", SERVER);
  process.exit(1);
}
const urls: string[] = await urlsRes.json() as string[];

const limitsRes = await fetch(`${SERVER}/limits`);
const limits = await limitsRes.json() as { maxConcurrent: number; maxRequestsPerSecond: number };
const { maxConcurrent, maxRequestsPerSecond } = limits;

await fetch(`${SERVER}/reset`, { method: "POST" });

console.log(`Solution: ${solutionPath}`);
console.log(`Fetching ${urls.length} URLs...\n`);

const start = performance.now();
try {
  const results = await fetchAll(urls, {
    maxConcurrent,
    maxRequestsPerSecond,
  });

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);

  if (!Array.isArray(results)) {
    console.error(`fetchAll returned ${typeof results}, expected array`);
    process.exit(1);
  }

  console.log(`Got ${results.length} results in ${elapsed}s\n`);

  for (const [i, r] of results.entries()) {
    if (r == null) {
      console.log(`  [${i}] undefined`);
    } else if ("error" in r) {
      console.log(`  [${i}] FAIL   ${r.url} — ${r.error}`);
    } else if ("body" in r) {
      console.log(`  [${i}] OK     ${r.url}`);
    } else {
      console.log(`  [${i}] ???    ${JSON.stringify(r)}`);
    }
  }
} catch (err) {
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.error(`\nfetchAll threw after ${elapsed}s:`, err);
  process.exit(1);
}

const statsRes = await fetch(`${SERVER}/stats`);
const stats = await statsRes.json() as Record<string, any>;
const { attemptCounts: _, ...printStats } = stats;
console.log(`\nServer stats: ${JSON.stringify(printStats, null, 2)}`);

let failed = false;
if (stats.rateLimitViolations > 0) {
  failed = true;
  console.log(`FAIL: rate limit violated (${stats.rateLimitViolations} requests rejected with 429)`);
}
if (stats.concurrencyViolations > 0) {
  failed = true;
  console.log(`FAIL: concurrency limit violated (${stats.concurrencyViolations} requests exceeded max ${maxConcurrent} in-flight)`);
}
if (failed) {
  process.exit(1);
}
