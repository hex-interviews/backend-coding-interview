"""
Concurrent Fetch with Rate Limiting
====================================

Implement ``fetch_all`` to fetch a list of URLs concurrently with these
constraints:

  - Maximum ``max_concurrent`` requests in-flight at once.
  - Maximum ``max_requests_per_second`` requests *initiated* per second.
  - Retry transient failures (HTTP 5xx) up to 3 times.
    Do NOT retry client errors (4xx).
  - Return a ``Result`` for every input URL — the function must never raise.
  - Preserve input ordering: ``results[i]`` corresponds to ``urls[i]``.

You may use ``aiohttp`` and the Python standard library.
"""

from dataclasses import dataclass
from typing import Union


@dataclass
class Success:
    """A successful HTTP 200 response."""

    url: str
    body: str


@dataclass
class Failure:
    """Any non-200 outcome: HTTP error status, network error, timeout, etc."""

    url: str
    error: str


Result = Union[Success, Failure]


async def fetch_all(
    urls: list[str],
    *,
    max_concurrent: int,
    max_requests_per_second: int,
) -> list[Result]:
    """Fetch all URLs concurrently and return a Result for each, preserving order."""
    # TODO: implement
    raise NotImplementedError
