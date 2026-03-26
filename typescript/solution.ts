/**
 * Concurrent Fetch with Rate Limiting
 *
 * Implement `fetchAll` to fetch a list of URLs concurrently with these constraints:
 *
 *  - Maximum `maxConcurrent` requests in-flight at once.
 *  - Maximum `maxRequestsPerSecond` requests *initiated* per second.
 * 
 * No third-party libraries.
 */

/** A successful HTTP 200 response. */
export type Success = { url: string; body: string };

/** Any non-200 outcome: HTTP error status, network error, timeout, etc. */
export type Failure = { url: string; error: string };

export type Result = Success | Failure;

export interface Options {
  /** Max requests in-flight at once. */
  maxConcurrent: number;
  /** Max requests initiated per second. */
  maxRequestsPerSecond: number;
}

export async function fetchAll(
  urls: string[],
  options: Options,
): Promise<Result[]> {
  // TODO: implement
  throw new Error("Not implemented");
}
