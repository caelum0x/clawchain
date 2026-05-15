package main

import (
	"context"
	"fmt"
	"math"
	"math/rand"
	"time"
)

// retryWithBackoff retries fn up to maxRetries times with exponential backoff
// plus jitter. If fn returns nil, retryWithBackoff returns nil immediately.
// If ctx is cancelled the context error is returned. If all retries are
// exhausted the last error from fn is returned, wrapped with retry count info.
//
// The delay between retries follows:
//
//	delay = baseDelay * 2^attempt + rand(0, baseDelay)
//
// This is used for chain REST queries, tx broadcasts, and runtime calls.
func retryWithBackoff(ctx context.Context, maxRetries int, baseDelay time.Duration, fn func() error) error {
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		lastErr = fn()
		if lastErr == nil {
			return nil
		}

		// Don't sleep after the final attempt.
		if attempt == maxRetries {
			break
		}

		// Check context before sleeping.
		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Exponential backoff with jitter.
		backoff := baseDelay * time.Duration(math.Pow(2, float64(attempt)))
		jitter := time.Duration(rand.Int63n(int64(baseDelay)))
		delay := backoff + jitter

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}
	}
	return fmt.Errorf("failed after %d retries: %w", maxRetries+1, lastErr)
}
