"""
Concurrent Fetch with Rate Limiting
====================================

Implement ``fetch_all`` to fetch a list of URLs concurrently with these
constraints:

  - Maximum ``max_concurrent`` requests in-flight at once.
  - Maximum ``max_requests_per_second`` requests *initiated* per second.
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
):
    """Fetch all URLs concurrently, yielding a Result for each."""
    # TODO: implement
    raise NotImplementedError
    yield  # makes this an async generator
