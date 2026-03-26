"""
Test harness — runs the candidate's fetch_all against the test server and
validates correctness.

Start the server first (from the typescript directory):
    cd ../typescript && npm run server

Usage:  uv run test_harness.py [path/to/solution.py]
"""

import asyncio
import importlib.util
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

solution_path = Path(sys.argv[1] if len(sys.argv) > 1 else "solution.py").resolve()
spec = importlib.util.spec_from_file_location("solution", solution_path)
assert spec and spec.loader, f"Could not load {solution_path}"
_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mod)
Success = _mod.Success  # type: ignore[attr-defined]
Failure = _mod.Failure  # type: ignore[attr-defined]
fetch_all = _mod.fetch_all  # type: ignore[attr-defined]

SERVER = os.environ.get("SERVER_URL", "http://localhost:3000")


def _get(path: str):
    with urllib.request.urlopen(f"{SERVER}{path}") as resp:
        return json.loads(resp.read())


def _post(path: str):
    req = urllib.request.Request(f"{SERVER}{path}", method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


async def main() -> None:
    # ------------------------------------------------------------------
    # Setup
    # ------------------------------------------------------------------
    try:
        urls: list[str] = _get("/urls")
    except Exception as exc:
        print(f"Could not reach server at {SERVER}: {exc}")
        sys.exit(1)

    print(f"Solution: {solution_path}")
    print(f"Fetched {len(urls)} URLs from server\n")
    _post("/reset")

    # ------------------------------------------------------------------
    # Run candidate solution
    # ------------------------------------------------------------------
    start = time.perf_counter()
    try:
        results = await fetch_all(
            urls,
            max_concurrent=10,
            max_requests_per_second=15,
        )
    except Exception as exc:
        print(f"FAIL — fetch_all raised an exception: {exc}")
        sys.exit(1)
    elapsed = time.perf_counter() - start

    # ------------------------------------------------------------------
    # Validate return value
    # ------------------------------------------------------------------
    if not isinstance(results, list):
        print(
            f"FAIL — fetch_all must return a list, got {type(results).__name__}: {results!r}"
        )
        sys.exit(1)

    # ------------------------------------------------------------------
    # Validate result shape
    # ------------------------------------------------------------------
    invalid = [
        (i, r)
        for i, r in enumerate(results)
        if not (isinstance(r, Success) or isinstance(r, Failure))
    ]
    if invalid:
        print(
            f"FAIL — {len(invalid)} result(s) have an invalid type."
            " Each result must be a Success or Failure instance."
        )
        for i, r in invalid[:5]:
            print(f"  [{i}]: {r!r}")
        if len(invalid) > 5:
            print(f"  ... and {len(invalid) - 5} more")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Checks
    # ------------------------------------------------------------------
    passed = 0
    failed = 0

    def check(name: str, ok: bool, detail: str = "") -> None:
        nonlocal passed, failed
        if ok:
            print(f"  PASS  {name}")
            passed += 1
        else:
            msg = f"  FAIL  {name}"
            if detail:
                msg += f" — {detail}"
            print(msg)
            failed += 1

    def get(i: int):
        """Safe index access — returns None for out-of-bounds."""
        return results[i] if i < len(results) else None

    def describe(r) -> str:
        """Human-readable description of a result or missing value."""
        if r is None:
            return "missing"
        if isinstance(r, Failure):
            return r.error
        if isinstance(r, Success):
            return "success"
        return repr(r)

    print("Results:")

    # 1. Coverage
    check(
        "All URLs covered",
        len(results) == len(urls),
        f"expected {len(urls)}, got {len(results)}",
    )

    # 2. Ordering preserved
    ordered = all(
        getattr(get(i), "url", None) == urls[i] for i in range(len(urls))
    )
    check("Ordering preserved", ordered)

    # 3. Transient errors recovered (IDs 90-94 → should end up as Success)
    transient_ids = range(90, 95)
    transient_ok = all(isinstance(get(i), Success) for i in transient_ids)
    bad_t = [
        f"item {i}: {describe(get(i))}"
        for i in transient_ids
        if not isinstance(get(i), Success)
    ]
    check("Transient 5xx errors retried and recovered", transient_ok, ", ".join(bad_t))

    # 4. Permanent errors captured as Failure (IDs 95-99 → Failure, not thrown)
    perm_ids = range(95, 100)
    perm_ok = all(isinstance(get(i), Failure) for i in perm_ids)
    bad_p = [
        f"item {i}: {describe(get(i))}"
        for i in perm_ids
        if not isinstance(get(i), Failure)
    ]
    check("Permanent errors captured (not thrown)", perm_ok, ", ".join(bad_p))

    # 5. Fast items (0-79)
    fast_ok = len(results) >= 80 and all(isinstance(get(i), Success) for i in range(80))
    check("Fast items (0-79) succeeded", fast_ok)

    # 6. Slow items (80-89)
    slow_ok = len(results) >= 90 and all(isinstance(get(i), Success) for i in range(80, 90))
    check("Slow items (80-89) succeeded", slow_ok)

    # 7. Concurrency — server tracked peak in-flight requests
    stats = _get("/stats")
    peak = stats.get("peakConcurrency", 0)
    check(
        "Used concurrency",
        peak > 1,
        f"peak was {peak} (sequential)",
    )
    check(
        "Respected concurrency limit",
        peak <= 10,
        f"peak was {peak}, limit is 10",
    )

    # 8. Rate limiting — server tracked peak requests in any 1-second window
    peak_rps = stats.get("peakWindowRequests", 0)
    check(
        "Respected rate limit",
        peak_rps <= 15,
        f"peak was {peak_rps} req/s, limit is 15",
    )

    # 9. Server confirms retries actually happened (IDs 90-94 need >= 2 attempts)
    attempt_counts = stats.get("attemptCounts", {})
    retried_on_server = all(
        attempt_counts.get(str(i), 0) >= 2 for i in range(90, 95)
    )
    bad_r = [
        f"item {i}: {attempt_counts.get(str(i), 0)} attempt(s)"
        for i in range(90, 95)
        if attempt_counts.get(str(i), 0) < 2
    ]
    check("Transient items retried (server-side)", retried_on_server, ", ".join(bad_r))

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print(f"\n{passed} passed, {failed} failed — {elapsed:.2f}s elapsed")
    print(f"\nServer stats: {json.dumps(stats, indent=2)}")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    asyncio.run(main())
