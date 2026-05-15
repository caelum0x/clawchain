package main

import (
	"net/http"
	"strings"
)

// authMiddleware returns an HTTP middleware that enforces bearer-token
// authentication. If token is empty, authentication is disabled and all
// requests are allowed through. The /health endpoint is always exempt from
// auth checks so that load balancers and liveness probes can reach it.
func authMiddleware(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Always skip auth for the health endpoint.
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// If no token is configured, auth is disabled.
		if token == "" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		const bearerPrefix = "Bearer "
		if !strings.HasPrefix(authHeader, bearerPrefix) {
			http.Error(w, `{"error":"invalid authorization format"}`, http.StatusUnauthorized)
			return
		}

		provided := strings.TrimPrefix(authHeader, bearerPrefix)
		if provided != token {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
