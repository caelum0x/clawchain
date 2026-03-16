package types

import (
	"testing"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
)

func TestRegisterInterfaces_DoesNotPanic(t *testing.T) {
	t.Helper()

	registry := codectypes.NewInterfaceRegistry()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("RegisterInterfaces panicked: %v", r)
		}
	}()

	RegisterInterfaces(registry)
}
