package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestParseCommand verifies subcommand parsing for all known commands, flags
// as first arg (backward compat), and unknown commands.
func TestParseCommand(t *testing.T) {
	tests := []struct {
		name     string
		args     []string
		wantName string
		wantArgs int
	}{
		{
			name:     "no args defaults to start",
			args:     []string{"claw-gpu-provider"},
			wantName: "start",
			wantArgs: 0,
		},
		{
			name:     "explicit start",
			args:     []string{"claw-gpu-provider", "start"},
			wantName: "start",
			wantArgs: 0,
		},
		{
			name:     "start with flags",
			args:     []string{"claw-gpu-provider", "start", "--debug"},
			wantName: "start",
			wantArgs: 1,
		},
		{
			name:     "status command",
			args:     []string{"claw-gpu-provider", "status"},
			wantName: "status",
			wantArgs: 0,
		},
		{
			name:     "status with flags",
			args:     []string{"claw-gpu-provider", "status", "--json"},
			wantName: "status",
			wantArgs: 1,
		},
		{
			name:     "jobs command",
			args:     []string{"claw-gpu-provider", "jobs"},
			wantName: "jobs",
			wantArgs: 0,
		},
		{
			name:     "jobs with status filter",
			args:     []string{"claw-gpu-provider", "jobs", "--status", "running"},
			wantName: "jobs",
			wantArgs: 2,
		},
		{
			name:     "config command",
			args:     []string{"claw-gpu-provider", "config"},
			wantName: "config",
			wantArgs: 0,
		},
		{
			name:     "version command",
			args:     []string{"claw-gpu-provider", "version"},
			wantName: "version",
			wantArgs: 0,
		},
		{
			name:     "unknown command",
			args:     []string{"claw-gpu-provider", "foobar"},
			wantName: "unknown",
			wantArgs: 1,
		},
		{
			name:     "flag as first arg treated as start",
			args:     []string{"claw-gpu-provider", "--debug"},
			wantName: "start",
			wantArgs: 1,
		},
		{
			name:     "empty args list",
			args:     []string{},
			wantName: "start",
			wantArgs: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmd := ParseCommand(tt.args)
			if cmd.Name != tt.wantName {
				t.Errorf("ParseCommand(%v).Name = %q, want %q", tt.args, cmd.Name, tt.wantName)
			}
			if len(cmd.Args) != tt.wantArgs {
				t.Errorf("ParseCommand(%v).Args length = %d, want %d", tt.args, len(cmd.Args), tt.wantArgs)
			}
		})
	}
}

// TestVersionOutput verifies that the version command prints the expected
// version, commit, and build date information.
func TestVersionOutput(t *testing.T) {
	// Set version vars for test.
	oldVersion := Version
	oldCommit := GitCommit
	oldDate := BuildDate
	defer func() {
		Version = oldVersion
		GitCommit = oldCommit
		BuildDate = oldDate
	}()

	Version = "1.2.3"
	GitCommit = "abc1234"
	BuildDate = "2026-03-07"

	var buf bytes.Buffer
	code := RunVersion(&buf)
	if code != 0 {
		t.Fatalf("RunVersion returned %d, want 0", code)
	}

	output := buf.String()
	if !strings.Contains(output, "1.2.3") {
		t.Errorf("version output missing version string: %s", output)
	}
	if !strings.Contains(output, "abc1234") {
		t.Errorf("version output missing commit: %s", output)
	}
	if !strings.Contains(output, "2026-03-07") {
		t.Errorf("version output missing build date: %s", output)
	}
}

// TestStatusJSON verifies that the status command produces valid JSON with
// the expected fields when --json is used.
func TestStatusJSON(t *testing.T) {
	// Stand up a fake metrics endpoint.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, `# HELP gpu_utilization GPU utilization percentage`)
		fmt.Fprintln(w, `# TYPE gpu_utilization gauge`)
		fmt.Fprintln(w, `gpu_utilization 75`)
		fmt.Fprintln(w, `# HELP gpu_memory_utilization GPU memory utilization percentage`)
		fmt.Fprintln(w, `# TYPE gpu_memory_utilization gauge`)
		fmt.Fprintln(w, `gpu_memory_utilization 42`)
		fmt.Fprintln(w, `# HELP gpu_temperature GPU temperature in Celsius`)
		fmt.Fprintln(w, `# TYPE gpu_temperature gauge`)
		fmt.Fprintln(w, `gpu_temperature 68`)
		fmt.Fprintln(w, `# HELP gpu_power_draw GPU power draw in watts`)
		fmt.Fprintln(w, `# TYPE gpu_power_draw gauge`)
		fmt.Fprintln(w, `gpu_power_draw 250`)
		fmt.Fprintln(w, `# HELP gpu_healthy GPU health status`)
		fmt.Fprintln(w, `# TYPE gpu_healthy gauge`)
		fmt.Fprintln(w, `gpu_healthy 1`)
		fmt.Fprintln(w, `# HELP claw_gpu_provider_active_jobs Active jobs`)
		fmt.Fprintln(w, `# TYPE claw_gpu_provider_active_jobs gauge`)
		fmt.Fprintln(w, `claw_gpu_provider_active_jobs 3`)
		fmt.Fprintln(w, `# HELP claw_gpu_provider_jobs_total Total jobs`)
		fmt.Fprintln(w, `# TYPE claw_gpu_provider_jobs_total counter`)
		fmt.Fprintln(w, `claw_gpu_provider_jobs_total{status="completed"} 150`)
		fmt.Fprintln(w, `claw_gpu_provider_jobs_total{status="failed"} 7`)
	}))
	defer srv.Close()

	// Override the HTTP client to use test server.
	origClient := statusHTTPClient
	statusHTTPClient = srv.Client()
	defer func() { statusHTTPClient = origClient }()

	var stdout, stderr bytes.Buffer
	code := RunStatus([]string{"--json", "--metrics-url", srv.URL + "/metrics"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("RunStatus returned %d, want 0; stderr: %s", code, stderr.String())
	}

	var output StatusOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		t.Fatalf("failed to parse JSON output: %v\nraw: %s", err, stdout.String())
	}

	if output.ActiveJobs != "3" {
		t.Errorf("ActiveJobs = %q, want %q", output.ActiveJobs, "3")
	}
	if output.TotalCompleted != "150" {
		t.Errorf("TotalCompleted = %q, want %q", output.TotalCompleted, "150")
	}
	if output.TotalFailed != "7" {
		t.Errorf("TotalFailed = %q, want %q", output.TotalFailed, "7")
	}
	if output.GPUUtilization != "75" {
		t.Errorf("GPUUtilization = %q, want %q", output.GPUUtilization, "75")
	}
	if output.GPUMemory != "42" {
		t.Errorf("GPUMemory = %q, want %q", output.GPUMemory, "42")
	}
	if output.GPUTemperature != "68" {
		t.Errorf("GPUTemperature = %q, want %q", output.GPUTemperature, "68")
	}
	if output.GPUPowerDraw != "250" {
		t.Errorf("GPUPowerDraw = %q, want %q", output.GPUPowerDraw, "250")
	}
	if output.GPUHealthy != "yes" {
		t.Errorf("GPUHealthy = %q, want %q", output.GPUHealthy, "yes")
	}
	if output.Error != "" {
		t.Errorf("Error = %q, want empty", output.Error)
	}
}

// TestStatusConnectionError verifies that status returns an error when the
// metrics endpoint is unreachable.
func TestStatusConnectionError(t *testing.T) {
	// Override the HTTP client to use a client that connects to nothing.
	origClient := statusHTTPClient
	statusHTTPClient = &http.Client{}
	defer func() { statusHTTPClient = origClient }()

	var stdout, stderr bytes.Buffer
	code := RunStatus([]string{"--json", "--metrics-url", "http://127.0.0.1:1/metrics"}, &stdout, &stderr)
	if code != 1 {
		t.Fatalf("RunStatus returned %d, want 1", code)
	}

	var output StatusOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}
	if output.Error == "" {
		t.Error("expected non-empty Error field")
	}
}

// TestConfigRedaction verifies that mnemonics and API keys are properly
// redacted in the config output.
func TestConfigRedaction(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		expect string
	}{
		{
			name:   "long mnemonic",
			input:  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
			expect: "aban...",
		},
		{
			name:   "short secret",
			input:  "key1",
			expect: "key1...",
		},
		{
			name:   "api key",
			input:  "sk-1234567890abcdef",
			expect: "sk-1...",
		},
		{
			name:   "empty string",
			input:  "",
			expect: "",
		},
		{
			name:   "very short",
			input:  "ab",
			expect: "ab...",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := redactSecret(tt.input)
			if got != tt.expect {
				t.Errorf("redactSecret(%q) = %q, want %q", tt.input, got, tt.expect)
			}
		})
	}
}

// TestConfigOutputJSON verifies that the config command outputs valid JSON
// with sensitive fields redacted.
func TestConfigOutputJSON(t *testing.T) {
	// Set env vars for test.
	t.Setenv("MNEMONIC", "abandon abandon abandon abandon abandon")
	t.Setenv("DANTE_API_KEY", "sk-secret-key-12345")
	t.Setenv("PROVIDER_ADDRESS", "claw1testaddr")

	var stdout, stderr bytes.Buffer
	code := RunConfig([]string{"--json"}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("RunConfig returned %d, want 0; stderr: %s", code, stderr.String())
	}

	var output ConfigOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		t.Fatalf("failed to parse JSON: %v\nraw: %s", err, stdout.String())
	}

	// Mnemonic should be redacted.
	if output.Mnemonic != "aban..." {
		t.Errorf("Mnemonic = %q, want %q", output.Mnemonic, "aban...")
	}

	// API key should be redacted.
	if output.DanteAPIKey != "sk-s..." {
		t.Errorf("DanteAPIKey = %q, want %q", output.DanteAPIKey, "sk-s...")
	}

	// Provider address should not be redacted.
	if output.ProviderAddress != "claw1testaddr" {
		t.Errorf("ProviderAddress = %q, want %q", output.ProviderAddress, "claw1testaddr")
	}
}

// TestJobsListEmpty verifies that the jobs command handles an empty jobs list
// gracefully.
func TestJobsListEmpty(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jobs": []interface{}{},
		})
	}))
	defer srv.Close()

	// Override the HTTP client.
	origClient := jobsHTTPClient
	jobsHTTPClient = srv.Client()
	defer func() { jobsHTTPClient = origClient }()

	var stdout, stderr bytes.Buffer
	code := RunJobs([]string{
		"--chain-rest", srv.URL,
		"--provider", "claw1test",
	}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("RunJobs returned %d, want 0; stderr: %s", code, stderr.String())
	}

	if !strings.Contains(stdout.String(), "No jobs found") {
		t.Errorf("expected 'No jobs found' message, got: %s", stdout.String())
	}
}

// TestJobsListJSON verifies JSON output of the jobs command with actual data.
func TestJobsListJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jobs": []map[string]interface{}{
				{
					"id":           1,
					"status":       "running",
					"job_type":     "inference",
					"submitter":    "claw1requester",
					"submitted_at": 1709800000,
					"started_at":   1709800060,
				},
				{
					"id":           2,
					"status":       "completed",
					"job_type":     "ai-training",
					"submitter":    "claw1another",
					"submitted_at": 1709790000,
					"started_at":   1709790010,
					"completed_at": 1709793600,
				},
			},
		})
	}))
	defer srv.Close()

	origClient := jobsHTTPClient
	jobsHTTPClient = srv.Client()
	defer func() { jobsHTTPClient = origClient }()

	var stdout, stderr bytes.Buffer
	code := RunJobs([]string{
		"--json",
		"--chain-rest", srv.URL,
		"--provider", "claw1test",
	}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("RunJobs returned %d, want 0; stderr: %s", code, stderr.String())
	}

	var output JobsOutput
	if err := json.Unmarshal(stdout.Bytes(), &output); err != nil {
		t.Fatalf("failed to parse JSON: %v\nraw: %s", err, stdout.String())
	}

	if output.Total != 2 {
		t.Errorf("Total = %d, want 2", output.Total)
	}
	if len(output.Jobs) != 2 {
		t.Fatalf("Jobs count = %d, want 2", len(output.Jobs))
	}
	if output.Jobs[0].Status != "running" {
		t.Errorf("Jobs[0].Status = %q, want %q", output.Jobs[0].Status, "running")
	}
	if output.Jobs[1].JobType != "ai-training" {
		t.Errorf("Jobs[1].JobType = %q, want %q", output.Jobs[1].JobType, "ai-training")
	}
}

// TestJobsMissingProvider verifies that the jobs command fails gracefully
// when no provider address is given.
func TestJobsMissingProvider(t *testing.T) {
	t.Setenv("PROVIDER_ADDRESS", "")

	var stdout, stderr bytes.Buffer
	code := RunJobs([]string{}, &stdout, &stderr)
	if code != 2 {
		t.Fatalf("RunJobs returned %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "provider address required") {
		t.Errorf("expected provider address error, got: %s", stderr.String())
	}
}

// TestRunCLIDispatch verifies that RunCLI correctly dispatches to subcommands.
func TestRunCLIDispatch(t *testing.T) {
	var stdout, stderr bytes.Buffer

	// Version should succeed.
	code := RunCLI(Command{Name: "version"}, &stdout, &stderr)
	if code != 0 {
		t.Errorf("RunCLI version returned %d, want 0", code)
	}

	// Unknown command should return 2.
	stdout.Reset()
	stderr.Reset()
	code = RunCLI(Command{Name: "unknown", Args: []string{"badcmd"}}, &stdout, &stderr)
	if code != 2 {
		t.Errorf("RunCLI unknown returned %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "Unknown command") {
		t.Errorf("expected 'Unknown command' in stderr, got: %s", stderr.String())
	}
}
