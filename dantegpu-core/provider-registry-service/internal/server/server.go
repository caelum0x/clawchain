package server

import (
	"net/http"
	"time"

	"go.uber.org/zap"
)

// ServerConfig holds configurable HTTP server timeouts.
type ServerConfig struct {
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

// DefaultServerConfig returns sensible default timeouts.
func DefaultServerConfig() ServerConfig {
	return ServerConfig{
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
}

// NewServer creates and configures an http.Server.
// It takes the port (e.g., ":8002"), the main router, a logger, and optional config.
func NewServer(port string, handler http.Handler, logger *zap.Logger, cfgs ...ServerConfig) *http.Server {
	sc := DefaultServerConfig()
	if len(cfgs) > 0 {
		sc = cfgs[0]
	}
	srv := &http.Server{
		Addr:              port,
		Handler:           handler,
		ReadTimeout:       sc.ReadTimeout,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      sc.WriteTimeout,
		IdleTimeout:       sc.IdleTimeout,
	}
	logger.Info("HTTP server configured", zap.String("address", port))
	return srv
}
