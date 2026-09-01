// Runner — calls your FetchAll with the server's URL list and prints results.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

func serverURL() string {
	if s := os.Getenv("SERVER_URL"); s != "" {
		return s
	}
	return "http://localhost:3000"
}

// getJSON performs a GET and decodes the JSON body into v.
func getJSON(url string, v any) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}

// post issues a POST and discards the body.
func post(url string) error {
	resp, err := http.Post(url, "application/json", nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, err = io.Copy(io.Discard, resp.Body)
	return err
}

type limits struct {
	MaxConcurrent        int `json:"maxConcurrent"`
	MaxRequestsPerSecond int `json:"maxRequestsPerSecond"`
}

type stats struct {
	RateLimitViolations   int `json:"rateLimitViolations"`
	ConcurrencyViolations int `json:"concurrencyViolations"`
	PeakConcurrency       int `json:"peakConcurrency"`
	PeakWindowRequests    int `json:"peakWindowRequests"`
}

func main() {
	server := serverURL()

	var urls []string
	if err := getJSON(server+"/urls", &urls); err != nil {
		fmt.Printf("Could not reach server at %s: %v\n", server, err)
		os.Exit(1)
	}

	var lim limits
	if err := getJSON(server+"/limits", &lim); err != nil {
		fmt.Printf("Could not read /limits from %s: %v\n", server, err)
		os.Exit(1)
	}

	if err := post(server + "/reset"); err != nil {
		fmt.Printf("Could not reset server at %s: %v\n", server, err)
		os.Exit(1)
	}

	fmt.Printf("Fetching %d URLs...\n\n", len(urls))

	start := time.Now()
	results := FetchAll(context.Background(), urls, Options{
		MaxConcurrent:        lim.MaxConcurrent,
		MaxRequestsPerSecond: lim.MaxRequestsPerSecond,
	})
	elapsed := time.Since(start)

	fmt.Printf("Got %d results in %.2fs\n\n", len(results), elapsed.Seconds())

	for i, r := range results {
		if r.Err != nil {
			fmt.Printf("  [%d] FAIL   %s — %v\n", i, r.URL, r.Err)
		} else {
			fmt.Printf("  [%d] OK     %s\n", i, r.URL)
		}
	}

	var st stats
	if err := getJSON(server+"/stats", &st); err != nil {
		fmt.Printf("\nCould not read /stats from %s: %v\n", server, err)
		os.Exit(1)
	}

	failed := false
	if st.RateLimitViolations > 0 {
		failed = true
		fmt.Printf("FAIL: rate limit violated (%d requests rejected with 429)\n", st.RateLimitViolations)
	}
	if st.ConcurrencyViolations > 0 {
		failed = true
		fmt.Printf("FAIL: concurrency limit violated (%d requests exceeded max %d in-flight)\n",
			st.ConcurrencyViolations, lim.MaxConcurrent)
	}
	if failed {
		os.Exit(1)
	}
}
