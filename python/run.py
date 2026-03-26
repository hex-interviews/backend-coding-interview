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

    _post("/reset")

    print(f"Solution: {solution_path}")
    print(f"Fetching {len(urls)} URLs...\n")

    start = time.perf_counter()
    try:
        results = await fetch_all(
            urls,
            max_concurrent=10,
            max_requests_per_second=15,
        )

        elapsed = time.perf_counter() - start

        if not isinstance(results, list):
            print(f"fetch_all returned {type(results).__name__}, expected list")
            sys.exit(1)

        print(f"Got {len(results)} results in {elapsed:.2f}s\n")

        for i, r in enumerate(results):
            if r is None:
                print(f"  [{i}] None")
            elif isinstance(r, Failure):
                print(f"  [{i}] FAIL   {r.url} — {r.error}")
            elif isinstance(r, Success):
                print(f"  [{i}] OK     {r.url}")
            else:
                print(f"  [{i}] ???    {r!r}")

        stats = _get("/stats")
        print(f"\nServer stats: {json.dumps(stats, indent=2)}")

    except Exception as exc:
        elapsed = time.perf_counter() - start
        print(f"\nfetch_all raised after {elapsed:.2f}s: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
