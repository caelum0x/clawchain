package main

import (
	"fmt"
	"io"
	"os"
)

// Version info, set via ldflags at build time.
var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildDate = "unknown"
)

// Command represents a parsed CLI subcommand with its remaining args.
type Command struct {
	Name string
	Args []string
}

// ParseCommand extracts the subcommand from os.Args. If no subcommand is
// given, it defaults to "start" for backward compatibility (the provider
// daemon has always started by running the binary with no arguments).
func ParseCommand(args []string) Command {
	if len(args) <= 1 {
		return Command{Name: "start"}
	}

	sub := args[1]

	// If the first arg looks like a flag, treat it as "start" with flags.
	if len(sub) > 0 && sub[0] == '-' {
		return Command{Name: "start", Args: args[1:]}
	}

	switch sub {
	case "start", "status", "jobs", "config", "version", "mock":
		return Command{Name: sub, Args: args[2:]}
	default:
		return Command{Name: "unknown", Args: args[1:]}
	}
}

// RunCLI dispatches to the appropriate subcommand handler. It returns an exit
// code (0 = success, 1 = error, 2 = usage error).
func RunCLI(cmd Command, stdout io.Writer, stderr io.Writer) int {
	switch cmd.Name {
	case "start":
		// Handled in main() — RunCLI is not called for "start".
		return 0
	case "status":
		return RunStatus(cmd.Args, stdout, stderr)
	case "jobs":
		return RunJobs(cmd.Args, stdout, stderr)
	case "config":
		return RunConfig(cmd.Args, stdout, stderr)
	case "version":
		return RunVersion(stdout)
	case "mock":
		RunMockProviderMode()
		return 0 // unreachable, RunMockProviderMode blocks
	default:
		fmt.Fprintf(stderr, "Unknown command: %s\n\n", cmd.Args[0])
		printUsage(stderr)
		return 2
	}
}

// RunVersion prints version information.
func RunVersion(w io.Writer) int {
	fmt.Fprintf(w, "claw-gpu-provider %s\n", Version)
	fmt.Fprintf(w, "  commit:  %s\n", GitCommit)
	fmt.Fprintf(w, "  built:   %s\n", BuildDate)
	return 0
}

func printUsage(w io.Writer) {
	fmt.Fprintln(w, "Usage: claw-gpu-provider <command> [flags]")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  start    Start the GPU provider daemon (default)")
	fmt.Fprintln(w, "  status   Query provider status from metrics endpoint")
	fmt.Fprintln(w, "  jobs     List active/recent jobs from the provider")
	fmt.Fprintln(w, "  config   Print current configuration")
	fmt.Fprintln(w, "  mock     Start in mock mode (no chain/GPU required)")
	fmt.Fprintln(w, "  version  Print version information")
	fmt.Fprintln(w, "")
	fmt.Fprintln(w, "Run 'claw-gpu-provider <command> --help' for command-specific flags.")
}

// PrintUsageAndExit prints usage to stderr and exits with code 2. This is
// used by main() when an unknown subcommand is provided.
func PrintUsageAndExit() {
	printUsage(os.Stderr)
	os.Exit(2)
}
