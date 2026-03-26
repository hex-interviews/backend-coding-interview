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
await fetch(`${SERVER}/reset`, { method: "POST" });

console.log(`Solution: ${solutionPath}`);
console.log(`Fetching ${urls.length} URLs...\n`);

const start = performance.now();
try {
  const results = await fetchAll(urls, {
    maxConcurrent: 10,
    maxRequestsPerSecond: 15,
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

  const statsRes = await fetch(`${SERVER}/stats`);
  const stats = await statsRes.json();
  console.log("\nServer stats:", JSON.stringify(stats, null, 2));
} catch (err) {
  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.error(`\nfetchAll threw after ${elapsed}s:`, err);
  process.exit(1);
}
