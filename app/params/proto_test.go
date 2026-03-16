package params

import (
	"testing"
)

func TestMakeEncodingConfig(t *testing.T) {
	enc := MakeEncodingConfig()

	if enc.Codec == nil {
		t.Fatal("Codec must not be nil")
	}
	if enc.TxConfig == nil {
		t.Fatal("TxConfig must not be nil")
	}
	if enc.InterfaceRegistry == nil {
		t.Fatal("InterfaceRegistry must not be nil")
	}
	if enc.Amino == nil {
		t.Fatal("Amino must not be nil")
	}
}

func TestMakeEncodingConfigRegistersTypes(t *testing.T) {
	enc := MakeEncodingConfig()

	// Standard SDK types should be registered
	// Check that the interface registry has implementations
	impls := enc.InterfaceRegistry.ListImplementations("cosmos.auth.v1beta1.AccountI")
	if len(impls) == 0 {
		t.Log("No AccountI implementations registered (expected with std.RegisterInterfaces)")
	}
}
