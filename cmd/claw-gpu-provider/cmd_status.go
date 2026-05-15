package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// StatusOutput holds parsed metrics for display or JSON serialization.
type StatusOutput struct {
	ActiveJobs     string `json:"active_jobs"`
	TotalCompleted string `json:"total_completed"`
	TotalFailed    string `json:"total_failed"`
	GPUUtilization string `json:"gpu_utilization"`
	GPUMemory      string `json:"gpu_memory"`
	GPUTemperature string `json:"gpu_temperature"`
	GPUPowerDraw   string `json:"gpu_power_draw"`
	GPUHealthy     string `json:"gpu_healthy"`
	Uptime         string `json:"uptime"`
	Error          string `json:"error,omitempty"`
}

// statusHTTPClient is the HTTP client used by the status command. It can be
// replaced in tests to inject a mock server.
var statusHTTPClient = &http.Client{Timeout: 5 * time.Second}

// RunStatus queries the provider's local metrics endpoint and displays key
// metrics in a human-readable table or JSON.
func RunStatus(args []string, stdout io.Writer, stderr io.Writer) int {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	fs.SetOutput(stderr)

	metricsURL := fs.String("metrics-url", "http://localhost:9090/metrics", "Metrics endpoint URL")
	jsonOut := fs.Bool("json", false, "Output in JSON format")

	if err := fs.Parse(args); err != nil {
		return 2
	}

	output := fetchStatus(*metricsURL)

	if *jsonOut {
		enc := json.NewEncoder(stdout)
		enc.SetIndent("", "  ")
		enc.Encode(output)
		return exitCodeForStatus(output)
	}

	// Human-readable table output.
	if output.Error != "" {
		fmt.Fprintf(stderr, "Error: %s\n", output.Error)
		fmt.Fprintf(stderr, "Is the provider daemon running? Check %s\n", *metricsURL)
		return 1
	}

	fmt.Fprintln(stdout, "GPU Provider Status")
	fmt.Fprintln(stdout, strings.Repeat("-", 40))
	printRow(stdout, "Active Jobs", output.ActiveJobs)
	printRow(stdout, "Total Completed", output.TotalCompleted)
	printRow(stdout, "Total Failed", output.TotalFailed)
	printRow(stdout, "GPU Utilization", output.GPUUtilization+"%")
	printRow(stdout, "GPU Memory", output.GPUMemory+"%")
	printRow(stdout, "GPU Temperature", output.GPUTemperature+"C")
	printRow(stdout, "GPU Power Draw", output.GPUPowerDraw+"W")
	printRow(stdout, "GPU Healthy", output.GPUHealthy)

	return 0
}

func printRow(w io.Writer, label, value string) {
	fmt.Fprintf(w, "  %-20s %s\n", label, value)
}

func fetchStatus(metricsURL string) StatusOutput {
	resp, err := statusHTTPClient.Get(metricsURL)
	if err != nil {
		return StatusOutput{Error: fmt.Sprintf("failed to connect: %v", err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return StatusOutput{Error: fmt.Sprintf("HTTP %d from metrics endpoint", resp.StatusCode)}
	}

	return parsePrometheusText(resp.Body)
}

// parsePrometheusText extracts known metrics from a Prometheus text-format
// response body. It reads line by line and matches metric names.
func parsePrometheusText(r io.Reader) StatusOutput {
	out := StatusOutput{
		ActiveJobs:     "0",
		TotalCompleted: "0",
		TotalFailed:    "0",
		GPUUtilization: "0",
		GPUMemory:      "0",
		GPUTemperature: "0",
		GPUPowerDraw:   "0",
		GPUHealthy:     "unknown",
	}

	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		name := parts[0]
		value := parts[1]

		switch {
		case name == "gpu_utilization":
			out.GPUUtilization = value
		case name == "gpu_memory_utilization":
			out.GPUMemory = value
		case name == "gpu_temperature":
			out.GPUTemperature = value
		case name == "gpu_power_draw":
			out.GPUPowerDraw = value
		case name == "gpu_healthy":
			if value == "1" {
				out.GPUHealthy = "yes"
			} else {
				out.GPUHealthy = "no"
			}
		case name == "claw_gpu_provider_active_jobs":
			out.ActiveJobs = value
		case strings.HasPrefix(name, "claw_gpu_provider_jobs_total"):
			// Counter vec with {status="completed"} or {status="failed"}.
			if strings.Contains(name, `status="completed"`) {
				out.TotalCompleted = value
			} else if strings.Contains(name, `status="failed"`) {
				out.TotalFailed = value
			}
		}
	}

	return out
}

func exitCodeForStatus(output StatusOutput) int {
	if output.Error != "" {
		return 1
	}
	return 0
}
