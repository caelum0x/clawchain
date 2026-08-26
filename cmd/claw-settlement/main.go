// Package main implements claw-settlement: the ClawChain off-chain
// inference-settlement dispute/slash SaaS surface.
//
// It exposes the deterministic inference-settlement + dispute/slash/resolution
// lifecycle (the same domain logic the chain runs in x/modelregistry and
// x/reputation) as a chain-independent HTTP service. A caller can submit a
// settlement claim, open a dispute, run the deterministic slash/resolution
// lifecycle, and receive an ed25519-signed, independently verifiable outcome —
// without a chain, validators, keys, or funds. Every settlement and dispute is
// metered against a per-account fee ledger so the surface is billable.
//
// Configuration (environment):
//
//	SETTLEMENT_LISTEN        HTTP listen address (default ":8099")
//	SETTLEMENT_DB            bbolt database path (default "settlement.db")
//	SETTLEMENT_SIGNER_SEED   hex-encoded 32-byte ed25519 seed (default: derived, dev only)
//	SETTLEMENT_FEE_DENOM     fee denomination (default "ufee")
//	SETTLEMENT_FEE_SETTLE    per-settlement fee, integer base units (default 1000)
//	SETTLEMENT_FEE_DISPUTE   per-dispute fee, integer base units (default 5000)
//	SETTLEMENT_DISPUTE_PENALTY reputation slash per dispute (default 1)
package main

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"cosmossdk.io/math"

	"clawchain/offchain/settlement"
)

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)

	listen := envDefault("SETTLEMENT_LISTEN", ":8099")
	dbPath := envDefault("SETTLEMENT_DB", "settlement.db")

	store, err := settlement.NewBoltStore(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer store.Close()

	seed, dev := signerSeed()
	signer, err := settlement.NewSigner(seed)
	if err != nil {
		log.Fatalf("build signer: %v", err)
	}
	if dev {
		log.Printf("WARNING: using a derived dev signer seed; set SETTLEMENT_SIGNER_SEED for production")
	}

	cfg := settlement.Config{
		DisputePenalty: uint64(envInt("SETTLEMENT_DISPUTE_PENALTY", int64(settlement.DefaultDisputePenalty))),
		Fees: settlement.FeeConfig{
			Denom:         envDefault("SETTLEMENT_FEE_DENOM", "ufee"),
			PerSettlement: math.NewInt(envInt("SETTLEMENT_FEE_SETTLE", 1000)),
			PerDispute:    math.NewInt(envInt("SETTLEMENT_FEE_DISPUTE", 5000)),
		},
	}
	engine := settlement.NewEngine(store, signer, settlement.NewLedgerFeeHook(store), cfg)
	svc := settlement.NewService(engine)

	srv := &http.Server{
		Addr:              listen,
		Handler:           svc.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("claw-settlement listening on %s (db=%s, signer=%s)", listen, dbPath, engine.PublicKeyB64())
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Printf("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// signerSeed resolves the ed25519 signer seed. If SETTLEMENT_SIGNER_SEED is a
// valid hex 32-byte value it is used; otherwise a deterministic dev seed is
// derived from the hostname (returns dev=true).
func signerSeed() (seed []byte, dev bool) {
	if raw := os.Getenv("SETTLEMENT_SIGNER_SEED"); raw != "" {
		if b, err := hex.DecodeString(raw); err == nil && len(b) == ed25519.SeedSize {
			return b, false
		}
		log.Printf("WARNING: SETTLEMENT_SIGNER_SEED invalid (need %d-byte hex); falling back to dev seed", ed25519.SeedSize)
	}
	host, _ := os.Hostname()
	sum := sha256.Sum256([]byte("claw-settlement-dev-seed:" + host))
	return sum[:], true
}

func envDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
		log.Printf("WARNING: %s=%q not an integer; using default %d", key, v, def)
	}
	return def
}
