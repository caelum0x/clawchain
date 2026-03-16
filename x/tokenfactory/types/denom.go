package types

// IsValidSubdenom returns true if the subdenom is valid (alphanumeric, /, _).
func IsValidSubdenom(subdenom string) bool {
	return validSubdenom.MatchString(subdenom)
}
