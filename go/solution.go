// Concurrent Fetch with Rate Limiting
// ===================================
//
// Implement FetchAll to fetch a list of URLs concurrently with these
// constraints:
//
//   - At most Options.MaxConcurrent requests in-flight at once.
//   - At most Options.MaxRequestsPerSecond requests *initiated* per second.
package main

import "context"

type Result struct {
	URL  string
	Body string
	Err  error
}

type Options struct {
	// MaxConcurrent is the max number of requests in-flight at once.
	MaxConcurrent int
	// MaxRequestsPerSecond is the max number of requests initiated per second.
	MaxRequestsPerSecond int
}

// FetchAll fetches all URLs concurrently and returns a Result for each,
// preserving input order. The goal is to do it as fast as possible without violating the server constraints (in opts).
func FetchAll(ctx context.Context, urls []string, opts Options) []Result {
	// TODO: implement
	panic("not implemented")
}
