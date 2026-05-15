package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// JobsOutput holds the list of jobs for display or JSON serialization.
type JobsOutput struct {
	Jobs  []JobRow `json:"jobs"`
	Total int      `json:"total"`
	Error string   `json:"error,omitempty"`
}

// JobRow is a single row in the jobs table.
type JobRow struct {
	ID        uint64 `json:"id"`
	Status    string `json:"status"`
	JobType   string `json:"job_type"`
	Submitter string `json:"submitter"`
	Created   string `json:"created"`
	Duration  string `json:"duration"`
}

// jobsHTTPClient is the HTTP client used by the jobs command. It can be
// replaced in tests to inject a mock server.
var jobsHTTPClient = &http.Client{Timeout: 10 * time.Second}

// RunJobs queries the chain REST API for jobs assigned to this provider and
// displays them as a table or JSON.
func RunJobs(args []string, stdout io.Writer, stderr io.Writer) int {
	fs := flag.NewFlagSet("jobs", flag.ContinueOnError)
	fs.SetOutput(stderr)

	chainREST := fs.String("chain-rest", "", "Chain REST endpoint (default: from env CHAIN_REST or http://localhost:1317)")
	providerAddr := fs.String("provider", "", "Provider address (default: from env PROVIDER_ADDRESS)")
	statusFilter := fs.String("status", "", "Filter by status (pending/running/completed/failed)")
	limit := fs.Int("limit", 20, "Maximum number of jobs to display")
	jsonOut := fs.Bool("json", false, "Output in JSON format")

	if err := fs.Parse(args); err != nil {
		return 2
	}

	// Resolve defaults from environment.
	rest := *chainREST
	if rest == "" {
		if v := envOrDefault("CHAIN_REST", ""); v != "" {
			rest = v
		} else {
			rest = "http://localhost:1317"
		}
	}

	addr := *providerAddr
	if addr == "" {
		addr = envOrDefault("PROVIDER_ADDRESS", "")
	}
	if addr == "" {
		fmt.Fprintln(stderr, "Error: provider address required (--provider flag or PROVIDER_ADDRESS env)")
		return 2
	}

	output := fetchJobs(rest, addr, *statusFilter, *limit)

	if *jsonOut {
		enc := json.NewEncoder(stdout)
		enc.SetIndent("", "  ")
		enc.Encode(output)
		return exitCodeForJobs(output)
	}

	// Human-readable table output.
	if output.Error != "" {
		fmt.Fprintf(stderr, "Error: %s\n", output.Error)
		return 1
	}

	if len(output.Jobs) == 0 {
		fmt.Fprintln(stdout, "No jobs found.")
		return 0
	}

	// Print table header.
	fmt.Fprintf(stdout, "%-8s %-12s %-16s %-20s %-22s %-12s\n",
		"Job ID", "Status", "Type", "Requester", "Created", "Duration")
	fmt.Fprintln(stdout, strings.Repeat("-", 92))

	for _, job := range output.Jobs {
		requester := truncateString(job.Submitter, 18)
		fmt.Fprintf(stdout, "%-8d %-12s %-16s %-20s %-22s %-12s\n",
			job.ID, job.Status, job.JobType, requester, job.Created, job.Duration)
	}

	fmt.Fprintf(stdout, "\nShowing %d of %d jobs\n", len(output.Jobs), output.Total)
	return 0
}

func fetchJobs(chainREST, providerAddr, statusFilter string, limit int) JobsOutput {
	queryURL := fmt.Sprintf("%s/clawchain/marketplace/v1/compute/jobs?address=%s", chainREST, providerAddr)
	if statusFilter != "" {
		queryURL += "&status=" + statusFilter
	}

	resp, err := jobsHTTPClient.Get(queryURL)
	if err != nil {
		return JobsOutput{Error: fmt.Sprintf("failed to query chain: %v", err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return JobsOutput{Error: fmt.Sprintf("chain REST returned HTTP %d", resp.StatusCode)}
	}

	var result struct {
		Jobs []ComputeJob `json:"jobs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return JobsOutput{Error: fmt.Sprintf("failed to decode response: %v", err)}
	}

	total := len(result.Jobs)
	if limit > 0 && len(result.Jobs) > limit {
		result.Jobs = result.Jobs[:limit]
	}

	rows := make([]JobRow, 0, len(result.Jobs))
	for _, job := range result.Jobs {
		rows = append(rows, jobToRow(job))
	}

	return JobsOutput{
		Jobs:  rows,
		Total: total,
	}
}

func jobToRow(job ComputeJob) JobRow {
	created := "N/A"
	if job.SubmittedAt > 0 {
		created = time.Unix(job.SubmittedAt, 0).UTC().Format("2006-01-02 15:04:05")
	}

	duration := "N/A"
	if job.StartedAt > 0 {
		end := job.CompletedAt
		if end == 0 {
			end = time.Now().Unix()
		}
		d := time.Duration(end-job.StartedAt) * time.Second
		duration = formatDuration(d)
	}

	return JobRow{
		ID:        job.Id,
		Status:    job.Status,
		JobType:   job.JobType,
		Submitter: job.Submitter,
		Created:   created,
		Duration:  duration,
	}
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm%ds", int(d.Minutes()), int(d.Seconds())%60)
	}
	return fmt.Sprintf("%dh%dm", int(d.Hours()), int(d.Minutes())%60)
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

func exitCodeForJobs(output JobsOutput) int {
	if output.Error != "" {
		return 1
	}
	return 0
}
