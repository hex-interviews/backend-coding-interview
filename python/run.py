"""
Runner — calls your fetch_all with the server's URL list and prints results.
Use this to experiment before running the test harness.

Usage:  uv run run.py [path/to/solution.py]
"""

import asyncio
import importlib.util
import json
import sys
import time
import os
import urllib.request
from pathlib import Path

solution_path = Path(sys.argv[1] if len(sys.argv) > 1 else "solution.py").resolve()
spec = importlib.util.spec_from_file_location("solution", solution_path)
assert spec and spec.loader, f"Could not load {solution_path}"
_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mod)
fetch_all = _mod.fetch_all  # type: ignore[attr-defined]
Success = _mod.Success  # type: ignore[attr-defined]
Failure = _mod.Failure  # type: ignore[attr-defined]

SERVER = os.environ.get("SERVER_URL", "http://localhost:3000")


def _get(path: str):
    with urllib.request.urlopen(f"{SERVER}{path}") as resp:
        return json.loads(resp.read())


def _post(path: str):
    req = urllib.request.Request(f"{SERVER}{path}", method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


async def main() -> None:
    try:
        urls: list[str] = _get("/urls")
    except Exception as exc:
        print(f"Could not reach server at {SERVER}: {exc}")
        sys.exit(1)

    limits = _get("/limits")
    max_concurrent: int = limits["maxConcurrent"]
    max_requests_per_second: int = limits["maxRequestsPerSecond"]

    _post("/reset")

    print(f"Solution: {solution_path}")
    print(f"Fetching {len(urls)} URLs...\n")

    start = time.perf_counter()
    count = 0
    try:
        async for r in fetch_all(
            urls,
            max_concurrent=max_concurrent,
            max_requests_per_second=max_requests_per_second,
        ):
            count += 1
            if isinstance(r, Failure):
                print(f"  [{count}] FAIL   {r.url} — {r.error}")
            elif isinstance(r, Success):
                print(f"  [{count}] OK     {r.url}")
            else:
                print(f"  [{count}] ???    {r!r}")
    except Exception as exc:
        elapsed = time.perf_counter() - start
        print(f"\nfetch_all raised after {elapsed:.2f}s: {exc}")
        sys.exit(1)

    elapsed = time.perf_counter() - start
    print(f"\nGot {count} results in {elapsed:.2f}s")

    stats = _get("/stats")
    failed = False
    if stats["rateLimitViolations"] > 0:
        failed = True
        print(f"FAIL: rate limit violated ({stats['rateLimitViolations']} requests rejected with 429)")
    if stats["concurrencyViolations"] > 0:
        failed = True
        print(f"FAIL: concurrency limit violated ({stats['concurrencyViolations']} requests exceeded max {max_concurrent} in-flight)")

    if failed:
        sys.exit(1)
    else:
        print(stats)


if __name__ == "__main__":
    asyncio.run(main())
