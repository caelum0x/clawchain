package types

import errorsmod "cosmossdk.io/errors"

var (
	ErrModelNotFound     = errorsmod.Register(ModuleName, 1300, "model not found")
	ErrModelInactive     = errorsmod.Register(ModuleName, 1301, "model is inactive")
	ErrNotModelOwner     = errorsmod.Register(ModuleName, 1302, "not model owner")
	ErrInvalidStorageUri = errorsmod.Register(ModuleName, 1303, "invalid storage URI")
	ErrNoAccess          = errorsmod.Register(ModuleName, 1304, "no access to model")
	ErrAccessExpired     = errorsmod.Register(ModuleName, 1305, "model access expired")
	ErrInvalidRating     = errorsmod.Register(ModuleName, 1306, "invalid rating")
	ErrSelfRating        = errorsmod.Register(ModuleName, 1307, "cannot rate own model")
	ErrInvalidFramework  = errorsmod.Register(ModuleName, 1308, "invalid framework")
	ErrInvalidAccessType = errorsmod.Register(ModuleName, 1309, "invalid access type")
	ErrDuplicateModel    = errorsmod.Register(ModuleName, 1310, "duplicate model name for owner")
	ErrInvalidAddress    = errorsmod.Register(ModuleName, 1311, "invalid address")

	// Inference marketplace errors
	ErrInferenceJobNotFound  = errorsmod.Register(ModuleName, 1320, "inference job not found")
	ErrProviderNotFound      = errorsmod.Register(ModuleName, 1321, "inference provider not found")
	ErrProviderOffline       = errorsmod.Register(ModuleName, 1322, "inference provider is offline")
	ErrInsufficientPayment   = errorsmod.Register(ModuleName, 1323, "insufficient payment for inference")
	ErrJobAlreadyCompleted   = errorsmod.Register(ModuleName, 1324, "inference job already completed")
	ErrJobTimeout            = errorsmod.Register(ModuleName, 1325, "inference job timed out")
	ErrNotJobProvider        = errorsmod.Register(ModuleName, 1326, "caller is not the job provider")
	ErrProviderAtCapacity    = errorsmod.Register(ModuleName, 1327, "provider at maximum concurrent jobs")
	ErrPricingNotSet         = errorsmod.Register(ModuleName, 1328, "inference pricing not set for model")
	ErrInvalidJobTransition  = errorsmod.Register(ModuleName, 1329, "invalid job status transition")
	ErrSubscriptionExpired   = errorsmod.Register(ModuleName, 1330, "subscription has expired")
	ErrNoSubscriptionPrice   = errorsmod.Register(ModuleName, 1331, "model has no subscription price configured")
)
