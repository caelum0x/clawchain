package settlement

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

// APIResponse is the consistent envelope for all responses.
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// Service is the HTTP adapter over an Engine. It is a thin translation layer:
// decode -> engine call -> envelope, with no business logic of its own.
type Service struct {
	engine *Engine
}

// NewService builds a Service over an Engine.
func NewService(engine *Engine) *Service { return &Service{engine: engine} }

// Handler returns an http.Handler with all routes registered.
func (s *Service) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/v1/pubkey", s.handlePubKey)
	mux.HandleFunc("/v1/claims", s.handleClaims)       // POST submit
	mux.HandleFunc("/v1/claims/", s.handleGetClaim)    // GET /v1/claims/{id}
	mux.HandleFunc("/v1/disputes", s.handleDispute)    // POST open dispute
	mux.HandleFunc("/v1/resolutions", s.handleResolve) // POST resolve
	mux.HandleFunc("/v1/fees/", s.handleFees)          // GET /v1/fees/{account}
	return mux
}

func (s *Service) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: map[string]string{"status": "ok"}})
}

func (s *Service) handlePubKey(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: map[string]string{"public_key": s.engine.PublicKeyB64()}})
}

func (s *Service) handleClaims(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var req SubmitRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	applyIdemHeader(r, &req.IdempotencyKey)
	out, err := s.engine.SubmitClaim(r.Context(), req)
	if err != nil {
		writeErr(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusCreated, APIResponse{Success: true, Data: out})
}

func (s *Service) handleGetClaim(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/v1/claims/")
	if id == "" {
		writeErr(w, http.StatusBadRequest, errors.New("claim id required"))
		return
	}
	claim, err := s.engine.GetClaim(r.Context(), id)
	if err != nil {
		writeErr(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: claim})
}

func (s *Service) handleDispute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var req DisputeRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	applyIdemHeader(r, &req.IdempotencyKey)
	out, err := s.engine.OpenDispute(r.Context(), req)
	if err != nil {
		writeErr(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: out})
}

func (s *Service) handleResolve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	var req ResolveRequest
	if err := decode(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	applyIdemHeader(r, &req.IdempotencyKey)
	out, err := s.engine.ResolveDispute(r.Context(), req)
	if err != nil {
		writeErr(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: out})
}

func (s *Service) handleFees(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
		return
	}
	account := strings.TrimPrefix(r.URL.Path, "/v1/fees/")
	if account == "" {
		writeErr(w, http.StatusBadRequest, errors.New("account required"))
		return
	}
	ledger, err := s.engine.Fees(r.Context(), account)
	if err != nil {
		writeErr(w, statusFor(err), err)
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: ledger})
}

// --- helpers ---------------------------------------------------------------

func decode(r *http.Request, v interface{}) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return errors.New("invalid JSON body: " + err.Error())
	}
	return nil
}

func applyIdemHeader(r *http.Request, target *string) {
	if *target == "" {
		if h := r.Header.Get("Idempotency-Key"); h != "" {
			*target = h
		}
	}
}

func writeJSON(w http.ResponseWriter, code int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(body)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, APIResponse{Success: false, Error: err.Error()})
}

// statusFor maps domain errors to HTTP status codes.
func statusFor(err error) int {
	switch {
	case errors.Is(err, ErrClaimNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNotRequester), errors.Is(err, ErrNotOwner):
		return http.StatusForbidden
	case errors.Is(err, ErrAlreadyDisputed), errors.Is(err, ErrAlreadyResolved),
		errors.Is(err, ErrNotSettled), errors.Is(err, ErrNotDisputed):
		return http.StatusConflict
	case errors.Is(err, ErrInvalidRequest), errors.Is(err, ErrInsufficientPayment):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}
