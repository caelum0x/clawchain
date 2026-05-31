package app_test

import (
	"os"
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"

	"clawchain/app"
)

// TestAppConstructionNeverSkips is the regression guard for the original
// chain-boot defect: app construction USED to panic during depinject wiring, and
// app/test_helpers.go recover()ed + t.Skip()ed it, so ~2,450 tests passed while
// the chain could not boot. This test converts any construction panic into a loud
// FAIL (never a skip), so a future module/depinject misconfig that breaks boot
// cannot hide behind a skip again.
func TestAppConstructionNeverSkips(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("app construction panicked — the chain would not boot: %v", r)
		}
	}()

	application := app.Setup(t, false)
	require.NotNil(t, application, "app construction returned nil")
	require.Equal(t, "clawchain", application.Name())
}

// TestNoConstructionMasking asserts the masking pattern is not reintroduced into
// newTestApp: it must not recover() a construction panic or t.Skip() on it.
// (A real boot failure must fail loudly — see TestAppConstructionNeverSkips.)
func TestNoConstructionMasking(t *testing.T) {
	// app_test runs with CWD = the app/ package directory.
	src, err := os.ReadFile("test_helpers.go")
	require.NoError(t, err)

	body := newTestAppBody(t, string(src))
	require.NotContains(t, body, "recover()",
		"newTestApp must not recover() a construction panic — construction must fail loudly")
	require.NotContains(t, body, "t.Skip",
		"newTestApp must not t.Skip() on construction failure — construction must fail loudly")
}

// newTestAppBody extracts the source of the newTestApp function (from its `func`
// keyword to the matching closing brace) so we can assert on its contents.
func newTestAppBody(t *testing.T, src string) string {
	t.Helper()
	start := regexp.MustCompile(`(?m)^func newTestApp\(`).FindStringIndex(src)
	require.NotNil(t, start, "could not locate func newTestApp in test_helpers.go")

	depth := 0
	seenBrace := false
	for i := start[0]; i < len(src); i++ {
		switch src[i] {
		case '{':
			depth++
			seenBrace = true
		case '}':
			depth--
			if seenBrace && depth == 0 {
				return src[start[0] : i+1]
			}
		}
	}
	t.Fatal("could not find end of func newTestApp")
	return ""
}
