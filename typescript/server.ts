import express from "express";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || "20", 10);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Per-item attempt counts (used for transient-error items). */
const attemptCounts = new Map<number, number>();

/** Timestamps of recent /item requests (sliding window rate limiter). */
const requestTimestamps: number[] = [];

/** Concurrency tracking. */
let inFlight = 0;
let peakConcurrency = 0;

/** Rate pressure tracking — peak requests in any 1-second window. */
let peakWindowRequests = 0;

function resetState(): void {
  attemptCounts.clear();
  requestTimestamps.length = 0;
  inFlight = 0;
  peakConcurrency = 0;
  peakWindowRequests = 0;
}

// ---------------------------------------------------------------------------
// Item data — 100 items with deterministic payloads
// ---------------------------------------------------------------------------

const items = Array.from({ length: 100 }, (_, i) => ({
  id: i,
  name: `Item ${i}`,
  value: i * 7 + 13,
}));

// ---------------------------------------------------------------------------
// Sliding-window rate limiter
// ---------------------------------------------------------------------------

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  // Evict timestamps older than 1 second.
  while (requestTimestamps.length > 0 && requestTimestamps[0]! <= now - 1000) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= RATE_LIMIT) {
    const oldestInWindow = requestTimestamps[0]!;
    const retryAfter = (oldestInWindow + 1000 - now) / 1000;
    return { allowed: false, retryAfter: Math.max(0.05, retryAfter) };
  }

  requestTimestamps.push(now);
  if (requestTimestamps.length > peakWindowRequests) {
    peakWindowRequests = requestTimestamps.length;
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** Returns the full list of item URLs. */
app.get("/urls", (_req, res) => {
  const urls = items.map((_, i) => `http://localhost:${PORT}/item/${i}`);
  res.json(urls);
});

/** Returns current rate-limiter pressure and per-item attempt counts. */
app.get("/stats", (_req, res) => {
  const now = Date.now();
  const recentCount = requestTimestamps.filter((t) => t > now - 1000).length;
  const attempts: Record<number, number> = {};
  attemptCounts.forEach((v, k) => {
    attempts[k] = v;
  });
  res.json({
    rateLimit: RATE_LIMIT,
    currentWindowRequests: recentCount,
    peakConcurrency,
    peakWindowRequests,
    attemptCounts: attempts,
  });
});

/** Clears all server state between test runs. */
app.post("/reset", (_req, res) => {
  resetState();
  res.json({ ok: true });
});

/** Serves a single item with mixed behaviour depending on the ID range. */
app.get("/item/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id) || id < 0 || id >= 100) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // --- Rate-limit gate (does NOT count as an attempt) ---
  const rateCheck = checkRateLimit();
  if (!rateCheck.allowed) {
    res.set("Retry-After", String(rateCheck.retryAfter));
    res.status(429).json({ error: "Too Many Requests" });
    return;
  }

  // --- Track concurrency ---
  inFlight++;
  if (inFlight > peakConcurrency) peakConcurrency = inFlight;
  res.on("close", () => { inFlight--; });

  // --- Track attempts ---
  const attempts = (attemptCounts.get(id) || 0) + 1;
  attemptCounts.set(id, attempts);

  // IDs 95-99 → permanent 404
  if (id >= 95) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // IDs 90-94 → transient 500 (succeed on 2nd+ attempt)
  if (id >= 90) {
    if (attempts < 2) {
      res.status(500).json({ error: "Internal server error" });
      return;
    }
    res.json(items[id]);
    return;
  }

  // IDs 80-89 → slow responses (1–3 s random delay)
  if (id >= 80) {
    const delay = 1000 + Math.random() * 2000;
    setTimeout(() => res.json(items[id]), delay);
    return;
  }

  // IDs 0-79 → fast normal responses
  res.json(items[id]);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log(`Rate limit: ${RATE_LIMIT} req/s`);
  console.log(`Endpoints: GET /urls · GET /stats · POST /reset · GET /item/:id`);
});
