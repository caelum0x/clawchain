package types

// Default parameter values for the modelregistry module.
const (
	DefaultMinDepositUclaw uint64 = 1_000_000 // 1 CLAW
	DefaultMaxModels       uint64 = 100
	DefaultPlatformFeeBps  uint64 = 500 // 5%
)

// DefaultModelRegistryParams returns the default modelregistry parameters.
func DefaultModelRegistryParams() ModelRegistryParams {
	return ModelRegistryParams{
		MinDepositUclaw: DefaultMinDepositUclaw,
		MaxModels:       DefaultMaxModels,
		PlatformFeeBps:  DefaultPlatformFeeBps,
	}
}
