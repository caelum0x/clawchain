package main

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cosmos/cosmos-sdk/types/bech32"
)

type chainBackend struct {
	Identifier   string
	ChainID      string
	Bech32Prefix string
	LCD          string
	Explorer     string
}

type txHistoryResponse struct {
	Msgs       []txHistoryItem     `json:"msgs"`
	NextCursor string              `json:"nextCursor"`
	Pagination txHistoryPagination `json:"pagination"`
}

type txHistoryPagination struct {
	Limit      int    `json:"limit"`
	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`
}

type txHistoryItem struct {
	Msg    walletMsgHistory              `json:"msg"`
	Prices map[string]map[string]float64 `json:"prices,omitempty"`
}

type walletMsgHistory struct {
	TxHash          string                 `json:"txHash"`
	Code            uint32                 `json:"code,omitempty"`
	Height          int64                  `json:"height"`
	Time            string                 `json:"time"`
	ChainID         string                 `json:"chainId"`
	ChainIdentifier string                 `json:"chainIdentifier"`
	Relation        string                 `json:"relation"`
	MsgIndex        int                    `json:"msgIndex"`
	Msg             map[string]any         `json:"msg"`
	EventStartIndex int                    `json:"eventStartIndex"`
	EventEndIndex   int                    `json:"eventEndIndex"`
	Search          string                 `json:"search"`
	Denoms          []string               `json:"denoms,omitempty"`
	Meta            map[string]interface{} `json:"meta"`
}

type txSearchResponse struct {
	TxResponses []lcdTxResponse `json:"tx_responses"`
	Pagination  struct {
		NextKey string `json:"next_key"`
		Total   string `json:"total"`
	} `json:"pagination"`
}

type lcdTxResponse struct {
	TxHash    string   `json:"txhash"`
	Height    string   `json:"height"`
	Code      uint32   `json:"code"`
	TimeStamp string   `json:"timestamp"`
	Tx        *lcdTx   `json:"tx"`
	RawLog    string   `json:"raw_log"`
	Logs      []any    `json:"logs"`
	Events    []any    `json:"events"`
	GasWanted string   `json:"gas_wanted"`
	GasUsed   string   `json:"gas_used"`
	TxResult  any      `json:"tx_result"`
	Info      string   `json:"info"`
	Msgs      []string `json:"-"`
}

type lcdTx struct {
	Body struct {
		Messages []map[string]any `json:"messages"`
	} `json:"body"`
	AuthInfo struct {
		Fee struct {
			Amount []struct {
				Denom  string `json:"denom"`
				Amount string `json:"amount"`
			} `json:"amount"`
			GasLimit string `json:"gas_limit"`
			Payer    string `json:"payer"`
			Granter  string `json:"granter"`
		} `json:"fee"`
	} `json:"auth_info"`
}

type txByHashResponse struct {
	Tx         *lcdTx        `json:"tx"`
	TxResponse lcdTxResponse `json:"tx_response"`
}

type walletFeeByHashResponse struct {
	AuthInfo struct {
		Fee struct {
			Amount []struct {
				Denom  string `json:"denom"`
				Amount string `json:"amount"`
			} `json:"amount"`
			GasLimit string `json:"gas_limit"`
			Payer    string `json:"payer"`
			Granter  string `json:"granter"`
		} `json:"fee"`
	} `json:"authInfo"`
}

type cursor struct {
	Offset int `json:"o"`
	Page   int `json:"p,omitempty"` // backward-compat decode support
}

type earningsResponse struct {
	Address         string                  `json:"address"`
	ChainID         string                  `json:"chainId"`
	ChainIdentifier string                  `json:"chainIdentifier"`
	Window          string                  `json:"window"`
	Since           string                  `json:"since"`
	ScannedItems    int                     `json:"scannedItems"`
	Totals          []coinAmount            `json:"totals"`
	Breakdown       map[string][]coinAmount `json:"breakdown"`
}

type coinAmount struct {
	Denom  string `json:"denom"`
	Amount string `json:"amount"`
}

type app struct {
	client                *http.Client
	backendsByID          map[string]chainBackend
	supports              []string
	defaultExplorer       string
	enablePriceEnrichment bool
	coinGeckoBaseURL      string
	denomToPriceID        map[string]string
	priceCacheTTL         time.Duration
	priceCacheMu          sync.RWMutex
	priceCache            map[string]priceCacheEntry
	metrics               metrics
}

type priceCacheEntry struct {
	ExpiresAt time.Time
	Data      map[string]map[string]float64
}

type metrics struct {
	mu sync.Mutex

	requestCountByPath         map[string]uint64
	upstreamRequestCountByType map[string]uint64
	upstreamLatencySecByType   map[string]float64
	priceCacheHits             uint64
	priceCacheMisses           uint64
}

type relationResult struct {
	Relation string
	Msg      map[string]any
	Denoms   []string
	Meta     map[string]interface{}
	Relevant bool
}

func main() {
	port := getenv("PORT", "17171")

	backends := []chainBackend{
		{
			Identifier:   "clawchain",
			ChainID:      getenv("CLAW_CHAIN_ID_MAINNET", "clawchain-1"),
			Bech32Prefix: getenv("CLAW_BECH32_PREFIX", "claw"),
			LCD:          strings.TrimRight(getenv("CLAW_LCD_MAINNET", "https://api.mainnet.clawchain.dev"), "/"),
			Explorer:     getenv("CLAW_EXPLORER_MAINNET_TEMPLATE", "https://explorer.clawchain.dev/tx/{txHash}"),
		},
		{
			Identifier:   "clawchain-testnet",
			ChainID:      getenv("CLAW_CHAIN_ID_TESTNET", "clawchain-testnet-1"),
			Bech32Prefix: getenv("CLAW_BECH32_PREFIX", "claw"),
			LCD:          strings.TrimRight(getenv("CLAW_LCD_TESTNET", "https://rest.testnet.clawchain.dev"), "/"),
			Explorer:     getenv("CLAW_EXPLORER_TESTNET_TEMPLATE", "https://explorer.testnet.clawchain.dev/tx/{txHash}"),
		},
	}

	supports := splitCSV(getenv("CLAW_TX_HISTORY_SUPPORTS", "clawchain,clawchain-testnet"))
	defaultExplorer := getenv("CLAW_EXPLORER_DEFAULT_TEMPLATE", backends[0].Explorer)

	a := newApp(backends, supports, defaultExplorer)
	mux := http.NewServeMux()
	mux.HandleFunc("/", a.handle)

	log.Printf("claw-txhistoryd listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func newApp(backends []chainBackend, supports []string, defaultExplorer string) *app {
	backendsByID := make(map[string]chainBackend)
	for _, b := range backends {
		backendsByID[b.Identifier] = b
		backendsByID[b.ChainID] = b
	}

	return &app{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		backendsByID:          backendsByID,
		supports:              supports,
		defaultExplorer:       defaultExplorer,
		enablePriceEnrichment: strings.EqualFold(getenv("CLAW_ENABLE_PRICE_ENRICHMENT", "false"), "true"),
		coinGeckoBaseURL:      strings.TrimRight(getenv("CLAW_COINGECKO_BASE_URL", "https://api.coingecko.com/api/v3"), "/"),
		denomToPriceID:        parseDenomToPriceID(getenv("CLAW_DENOM_PRICE_IDS", "uclaw:claw")),
		priceCacheTTL:         time.Duration(parsePositiveInt(getenv("CLAW_PRICE_CACHE_TTL_SECONDS", "30"), 30, 3600)) * time.Second,
		priceCache:            map[string]priceCacheEntry{},
		metrics: metrics{
			requestCountByPath:         map[string]uint64{},
			upstreamRequestCountByType: map[string]uint64{},
			upstreamLatencySecByType:   map[string]float64{},
		},
	}
}

func (a *app) handle(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	a.recordRequest(r.URL.Path)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch {
	case r.URL.Path == "/healthz":
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	case r.URL.Path == "/metrics":
		a.handleMetrics(w)
		return
	case r.URL.Path == "/tx-history/supports":
		writeJSON(w, http.StatusOK, a.supports)
		return
	case strings.HasPrefix(r.URL.Path, "/tx-history/explorer/"):
		a.handleExplorer(w, r)
		return
	case strings.HasPrefix(r.URL.Path, "/history/v2/msgs/keplr-multi-chain"):
		a.handleHistoryMultiChain(w, r)
		return
	case strings.HasPrefix(r.URL.Path, "/history/v2/msgs/"):
		a.handleHistorySingleChain(w, r, true)
		return
	case strings.HasPrefix(r.URL.Path, "/history/v2/earnings/"):
		a.handleEarningsSingleChain(w, r)
		return
	case strings.HasPrefix(r.URL.Path, "/history/msgs/"):
		a.handleHistorySingleChain(w, r, false)
		return
	case strings.HasPrefix(r.URL.Path, "/block/txs/by-hash/"):
		a.handleTxByHash(w, r)
		return
	case strings.HasPrefix(r.URL.Path, "/block/msg/"):
		a.handleMsgByHashAndIndex(w, r)
		return
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
}

func (a *app) handleExplorer(w http.ResponseWriter, r *http.Request) {
	identifier := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/tx-history/explorer/"))
	if identifier == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing chain identifier"})
		return
	}

	link := a.defaultExplorer
	if backend, ok := a.findBackend(identifier); ok && backend.Explorer != "" {
		link = backend.Explorer
	}
	writeJSON(w, http.StatusOK, map[string]string{"link": link})
}

func (a *app) handleHistoryMultiChain(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	limit := parsePositiveInt(query.Get("limit"), 20, 200)
	offset := parseCursorOffset(query.Get("cursor"))
	address := strings.TrimSpace(query.Get("baseHexAddress"))
	if address == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing baseHexAddress"})
		return
	}

	chainIdentifiersRaw := strings.TrimSpace(query.Get("chainIdentifiers"))
	if chainIdentifiersRaw == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing chainIdentifiers"})
		return
	}

	relations := parseCSVSet(query.Get("relations"))
	denoms := parseCSVSet(query.Get("denoms"))

	var all []txHistoryItem
	for _, id := range splitCSV(chainIdentifiersRaw) {
		backend, ok := a.findBackend(id)
		if !ok {
			continue
		}
		items, _, err := a.fetchHistoryForChain(r.Context(), backend, address, limit, offset, relations, denoms)
		if err != nil {
			log.Printf("history multi fetch failed for %s: %v", backend.Identifier, err)
			continue
		}
		all = append(all, items...)
	}

	sort.Slice(all, func(i, j int) bool {
		ti := all[i].Msg.Time
		tj := all[j].Msg.Time
		if ti == tj {
			return all[i].Msg.Height > all[j].Msg.Height
		}
		return ti > tj
	})

	next := ""
	hasMore := len(all) > offset+limit
	if offset < len(all) {
		end := offset + limit
		if end > len(all) {
			end = len(all)
		}
		all = all[offset:end]
	} else {
		all = []txHistoryItem{}
	}
	if hasMore {
		next = encodeCursorOffset(offset + len(all))
	}

	writeJSON(w, http.StatusOK, txHistoryResponse{
		Msgs:       a.attachPrices(r.Context(), all, query.Get("vsCurrencies")),
		NextCursor: next,
		Pagination: txHistoryPagination{
			Limit:      limit,
			NextCursor: next,
			HasMore:    hasMore,
		},
	})
}

func (a *app) handleHistorySingleChain(w http.ResponseWriter, r *http.Request, v2 bool) {
	trimPrefix := "/history/msgs/"
	if v2 {
		trimPrefix = "/history/v2/msgs/"
	}

	rest := strings.TrimPrefix(r.URL.Path, trimPrefix)
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid history path"})
		return
	}

	chainIdentifier := strings.TrimSpace(parts[0])
	address := strings.TrimSpace(parts[1])
	if address == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing address"})
		return
	}

	backend, ok := a.findBackend(chainIdentifier)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported chain"})
		return
	}

	query := r.URL.Query()
	limit := parsePositiveInt(query.Get("limit"), 20, 200)
	offset := parseCursorOffset(query.Get("cursor"))
	relations := parseCSVSet(query.Get("relations"))
	denoms := parseCSVSet(query.Get("denoms"))

	items, hasMore, err := a.fetchHistoryForChain(r.Context(), backend, address, limit, offset, relations, denoms)
	if err != nil {
		log.Printf("history fetch failed: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "failed to query chain history"})
		return
	}

	next := ""
	if hasMore {
		next = encodeCursorOffset(offset + len(items))
	}

	writeJSON(w, http.StatusOK, txHistoryResponse{
		Msgs:       a.attachPrices(r.Context(), items, query.Get("vsCurrencies")),
		NextCursor: next,
		Pagination: txHistoryPagination{
			Limit:      limit,
			NextCursor: next,
			HasMore:    hasMore,
		},
	})
}

func (a *app) handleEarningsSingleChain(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/history/v2/earnings/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid earnings path"})
		return
	}

	chainIdentifier := strings.TrimSpace(parts[0])
	address := strings.TrimSpace(parts[1])
	if address == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing address"})
		return
	}

	backend, ok := a.findBackend(chainIdentifier)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported chain"})
		return
	}

	windowText := strings.TrimSpace(r.URL.Query().Get("window"))
	if windowText == "" {
		windowText = "7d"
	}
	windowDur, ok := parseWindowDuration(windowText)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid window; use forms like 24h or 7d"})
		return
	}
	since := time.Now().Add(-windowDur)

	relations := map[string]struct{}{
		"receive":                     {},
		"custom/merged-claim-rewards": {},
	}

	cursorOffset := 0
	limit := 100
	maxScan := 1000
	scanned := 0

	stakingRewards := map[string]*big.Int{}
	taskFees := map[string]*big.Int{}
	skillSales := map[string]*big.Int{}
	incomingTransfers := map[string]*big.Int{}
	totals := map[string]*big.Int{}

	for scanned < maxScan {
		items, hasMore, err := a.fetchHistoryForChain(r.Context(), backend, address, limit, cursorOffset, relations, nil)
		if err != nil {
			log.Printf("earnings fetch failed: %v", err)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "failed to query chain history"})
			return
		}
		if len(items) == 0 {
			break
		}

		stop := false
		for _, item := range items {
			scanned++
			ts, err := time.Parse(time.RFC3339, item.Msg.Time)
			if err == nil && ts.Before(since) {
				stop = true
				break
			}
			coins := extractCoinsFromHistoryItem(item)
			if len(coins) == 0 {
				continue
			}

			switch item.Msg.Relation {
			case "custom/merged-claim-rewards":
				addCoins(stakingRewards, coins)
				addCoins(totals, coins)
			case "receive":
				txTypes := txMsgTypesFromMeta(item.Msg.Meta)
				if hasTypePrefix(txTypes, "/clawchain.marketplace.v1.") {
					addCoins(skillSales, coins)
				} else if hasTypePrefix(txTypes, "/clawchain.agent.v1.") {
					addCoins(taskFees, coins)
				} else {
					addCoins(incomingTransfers, coins)
				}
				addCoins(totals, coins)
			}
		}

		if stop || !hasMore {
			break
		}
		cursorOffset += len(items)
	}

	writeJSON(w, http.StatusOK, earningsResponse{
		Address:         address,
		ChainID:         backend.ChainID,
		ChainIdentifier: backend.Identifier,
		Window:          windowText,
		Since:           since.UTC().Format(time.RFC3339),
		ScannedItems:    scanned,
		Totals:          coinMapToList(totals),
		Breakdown: map[string][]coinAmount{
			"staking_rewards":    coinMapToList(stakingRewards),
			"task_fees":          coinMapToList(taskFees),
			"skill_sales":        coinMapToList(skillSales),
			"incoming_transfers": coinMapToList(incomingTransfers),
		},
	})
}

func (a *app) handleTxByHash(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/block/txs/by-hash/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid tx by hash path"})
		return
	}
	chainIdentifier := strings.TrimSpace(parts[0])
	txHash := strings.TrimSpace(parts[1])

	backend, ok := a.findBackend(chainIdentifier)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported chain"})
		return
	}

	tx, err := a.fetchTxByHash(r.Context(), backend, txHash)
	if err != nil || tx.Tx == nil {
		writeJSON(w, http.StatusOK, defaultFeeByHashResponse())
		return
	}

	res := defaultFeeByHashResponse()
	res.AuthInfo.Fee.Amount = tx.Tx.AuthInfo.Fee.Amount
	res.AuthInfo.Fee.GasLimit = tx.Tx.AuthInfo.Fee.GasLimit
	res.AuthInfo.Fee.Payer = tx.Tx.AuthInfo.Fee.Payer
	res.AuthInfo.Fee.Granter = tx.Tx.AuthInfo.Fee.Granter
	writeJSON(w, http.StatusOK, res)
}

func (a *app) handleMsgByHashAndIndex(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/block/msg/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) < 3 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid block msg path"})
		return
	}

	chainIdentifier := strings.TrimSpace(parts[0])
	txHash := strings.TrimSpace(parts[1])
	msgIndex, err := strconv.Atoi(strings.TrimSpace(parts[2]))
	if err != nil || msgIndex < 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid msg index"})
		return
	}

	backend, ok := a.findBackend(chainIdentifier)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported chain"})
		return
	}

	tx, err := a.fetchTxByHash(r.Context(), backend, txHash)
	if err != nil || tx.Tx == nil {
		writeJSON(w, http.StatusOK, map[string]any{"msg": map[string]any{}})
		return
	}

	if msgIndex >= len(tx.Tx.Body.Messages) {
		writeJSON(w, http.StatusOK, map[string]any{"msg": map[string]any{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"msg": tx.Tx.Body.Messages[msgIndex]})
}

func (a *app) fetchHistoryForChain(
	ctx context.Context,
	backend chainBackend,
	rawAddress string,
	limit int,
	offset int,
	relations map[string]struct{},
	denoms map[string]struct{},
) ([]txHistoryItem, bool, error) {
	addr := normalizeAddress(rawAddress, backend.Bech32Prefix)
	if addr == "" {
		return nil, false, fmt.Errorf("invalid address")
	}

	fetchLimit := (offset + limit) * 3
	if fetchLimit < 60 {
		fetchLimit = 60
	}
	if fetchLimit > 600 {
		fetchLimit = 600
	}

	queries := []string{
		fmt.Sprintf("message.sender='%s'", addr),
		fmt.Sprintf("transfer.sender='%s'", addr),
		fmt.Sprintf("transfer.recipient='%s'", addr),
	}

	seen := make(map[string]lcdTxResponse)
	hasMore := false
	for _, eventQuery := range queries {
		res, err := a.fetchTxSearch(ctx, backend, eventQuery, 0, fetchLimit)
		if err != nil {
			log.Printf("tx search failed (%s): %v", eventQuery, err)
			continue
		}
		if len(res.TxResponses) >= fetchLimit {
			hasMore = true
		}
		for _, tx := range res.TxResponses {
			if tx.TxHash == "" {
				continue
			}
			seen[tx.TxHash] = tx
		}
	}

	if len(seen) == 0 {
		return []txHistoryItem{}, false, nil
	}

	txs := make([]lcdTxResponse, 0, len(seen))
	for _, tx := range seen {
		txs = append(txs, tx)
	}
	sort.Slice(txs, func(i, j int) bool {
		if txs[i].TimeStamp == txs[j].TimeStamp {
			hi := parseInt64(txs[i].Height)
			hj := parseInt64(txs[j].Height)
			return hi > hj
		}
		return txs[i].TimeStamp > txs[j].TimeStamp
	})

	items := make([]txHistoryItem, 0, limit)
	for _, tx := range txs {
		if tx.Tx == nil {
			continue
		}

		height := parseInt64(tx.Height)
		timestamp := tx.TimeStamp
		if timestamp == "" {
			timestamp = time.Now().UTC().Format(time.RFC3339)
		}

		for msgIndex, msg := range tx.Tx.Body.Messages {
			rel := classifyRelation(msg, addr, tx)
			if !rel.Relevant {
				continue
			}
			if len(relations) > 0 {
				if _, ok := relations[rel.Relation]; !ok {
					continue
				}
			}

			msgDenoms := rel.Denoms
			if len(msgDenoms) == 0 {
				msgDenoms = extractDenoms(rel.Msg)
			}
			if len(denoms) > 0 && !hasDenomIntersection(msgDenoms, denoms) {
				continue
			}

			items = append(items, txHistoryItem{
				Msg: walletMsgHistory{
					TxHash:          normalizeTxHash(tx.TxHash),
					Code:            tx.Code,
					Height:          height,
					Time:            timestamp,
					ChainID:         backend.ChainID,
					ChainIdentifier: backend.Identifier,
					Relation:        rel.Relation,
					MsgIndex:        msgIndex,
					Msg:             rel.Msg,
					EventStartIndex: 0,
					EventEndIndex:   0,
					Search:          rel.Relation,
					Denoms:          msgDenoms,
					Meta:            mergeMeta(rel.Meta, map[string]any{"tx_msg_types": txMessageTypes(tx)}),
				},
			})
		}
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Msg.Time == items[j].Msg.Time {
			if items[i].Msg.Height == items[j].Msg.Height {
				return items[i].Msg.MsgIndex > items[j].Msg.MsgIndex
			}
			return items[i].Msg.Height > items[j].Msg.Height
		}
		return items[i].Msg.Time > items[j].Msg.Time
	})

	if offset >= len(items) {
		return []txHistoryItem{}, false, nil
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	if len(items) > end {
		hasMore = true
	}

	return items[offset:end], hasMore, nil
}

func (a *app) fetchTxSearch(ctx context.Context, backend chainBackend, eventQuery string, offset, limit int) (*txSearchResponse, error) {
	params := url.Values{}
	params.Set("events", eventQuery)
	params.Set("pagination.offset", strconv.Itoa(offset))
	params.Set("pagination.limit", strconv.Itoa(limit))
	params.Set("order_by", "ORDER_BY_DESC")

	u := backend.LCD + "/cosmos/tx/v1beta1/txs?" + params.Encode()
	body, err := a.doGet(ctx, u)
	if err != nil {
		return nil, err
	}

	var res txSearchResponse
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (a *app) fetchTxByHash(ctx context.Context, backend chainBackend, txHash string) (*txByHashResponse, error) {
	u := backend.LCD + "/cosmos/tx/v1beta1/txs/" + url.PathEscape(strings.TrimPrefix(txHash, "0x"))
	body, err := a.doGet(ctx, u)
	if err != nil {
		return nil, err
	}

	var res txByHashResponse
	if err := json.Unmarshal(body, &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (a *app) doGet(ctx context.Context, u string) ([]byte, error) {
	start := time.Now()
	upstreamType := classifyUpstreamType(u)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.client.Do(req)
	a.recordUpstream(upstreamType, time.Since(start))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("upstream status %d: %s", resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}

func (a *app) findBackend(identifierOrChainID string) (chainBackend, bool) {
	key := strings.TrimSpace(identifierOrChainID)
	if key == "" {
		return chainBackend{}, false
	}
	if backend, ok := a.backendsByID[key]; ok {
		return backend, true
	}

	normalized := normalizeChainIdentifier(key)
	backend, ok := a.backendsByID[normalized]
	return backend, ok
}

func normalizeChainIdentifier(id string) string {
	id = strings.TrimSpace(strings.ToLower(id))
	switch {
	case strings.HasPrefix(id, "clawchain-testnet"):
		return "clawchain-testnet"
	case strings.HasPrefix(id, "clawchain"):
		return "clawchain"
	default:
		return id
	}
}

func normalizeAddress(raw, bech32Prefix string) string {
	addr := strings.TrimSpace(raw)
	if addr == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(addr), "0x") {
		bz, err := hex.DecodeString(strings.TrimPrefix(strings.ToLower(addr), "0x"))
		if err != nil || len(bz) == 0 {
			return ""
		}
		bech32Addr, err := bech32.ConvertAndEncode(bech32Prefix, bz)
		if err != nil {
			return ""
		}
		return bech32Addr
	}
	return addr
}

func classifyRelation(msg map[string]any, address string, tx lcdTxResponse) relationResult {
	typ, _ := msg["@type"].(string)
	switch typ {
	case "/cosmos.bank.v1beta1.MsgSend":
		from, _ := msg["from_address"].(string)
		to, _ := msg["to_address"].(string)
		if from == address {
			return relationResult{Relation: "send", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
		if to == address {
			return relationResult{Relation: "receive", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.bank.v1beta1.MsgMultiSend":
		inAddr, inCoins := findMultiSendCoins(msg["inputs"], address)
		outAddr, outCoins := findMultiSendCoins(msg["outputs"], address)
		if inAddr != "" {
			synthetic := map[string]any{
				"@type":        "/cosmos.bank.v1beta1.MsgSend",
				"from_address": inAddr,
				"to_address":   firstDifferentAddress(msg["outputs"], inAddr),
				"amount":       inCoins,
			}
			return relationResult{Relation: "send", Msg: synthetic, Denoms: extractDenoms(synthetic), Meta: map[string]interface{}{}, Relevant: true}
		}
		if outAddr != "" {
			synthetic := map[string]any{
				"@type":        "/cosmos.bank.v1beta1.MsgSend",
				"from_address": firstDifferentAddress(msg["inputs"], outAddr),
				"to_address":   outAddr,
				"amount":       outCoins,
			}
			return relationResult{Relation: "receive", Msg: synthetic, Denoms: extractDenoms(synthetic), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/ibc.applications.transfer.v1.MsgTransfer":
		sender, _ := msg["sender"].(string)
		receiver, _ := msg["receiver"].(string)
		if sender == address {
			return relationResult{Relation: "ibc-send", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
		if receiver == address {
			synthetic := map[string]any{
				"@type":        "/cosmos.bank.v1beta1.MsgSend",
				"from_address": sender,
				"to_address":   receiver,
				"amount": []map[string]any{
					anyToMap(msg["token"]),
				},
			}
			return relationResult{Relation: "receive", Msg: synthetic, Denoms: extractDenoms(synthetic), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.staking.v1beta1.MsgDelegate":
		delegator, _ := msg["delegator_address"].(string)
		if delegator == address {
			return relationResult{Relation: "delegate", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.staking.v1beta1.MsgUndelegate":
		delegator, _ := msg["delegator_address"].(string)
		if delegator == address {
			return relationResult{Relation: "undelegate", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.staking.v1beta1.MsgBeginRedelegate":
		delegator, _ := msg["delegator_address"].(string)
		if delegator == address {
			return relationResult{Relation: "redelegate", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation":
		delegator, _ := msg["delegator_address"].(string)
		if delegator == address {
			return relationResult{Relation: "cancel-undelegate", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.gov.v1beta1.MsgVote", "/cosmos.gov.v1.MsgVote":
		voter, _ := msg["voter"].(string)
		if voter == address {
			return relationResult{Relation: "vote", Msg: msg, Denoms: extractDenoms(msg), Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.gov.v1beta1.MsgVoteWeighted", "/cosmos.gov.v1.MsgVoteWeighted":
		voter, _ := msg["voter"].(string)
		if voter == address {
			synthetic := map[string]any{
				"@type":       "/cosmos.gov.v1.MsgVote",
				"proposal_id": msg["proposal_id"],
				"voter":       voter,
				"option":      bestWeightedOption(msg["options"]),
			}
			return relationResult{Relation: "vote", Msg: synthetic, Denoms: nil, Meta: map[string]interface{}{}, Relevant: true}
		}
	case "/cosmos.authz.v1beta1.MsgExec":
		grantee, _ := msg["grantee"].(string)
		if grantee == address {
			if innerMsgs, ok := msg["msgs"].([]any); ok {
				for _, im := range innerMsgs {
					inner := anyToMap(im)
					if len(inner) == 0 {
						continue
					}
					res := classifyRelation(inner, address, tx)
					if res.Relevant {
						return res
					}
				}
			}
		}
	case "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward":
		delegator, _ := msg["delegator_address"].(string)
		if delegator == address {
			rewards := extractTransferRewardsFromLogs(tx, address)
			meta := map[string]interface{}{"rewards": rewards}
			return relationResult{
				Relation: "custom/merged-claim-rewards",
				Msg:      msg,
				Denoms:   extractDenomsFromCoins(rewards),
				Meta:     meta,
				Relevant: true,
			}
		}
	case "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission":
		rewards := extractTransferRewardsFromLogs(tx, address)
		validatorAddr, _ := msg["validator_address"].(string)
		meta := map[string]interface{}{
			"rewards": rewards,
		}
		synthetic := map[string]any{
			"@type":        "/cosmos.bank.v1beta1.MsgSend",
			"from_address": validatorAddr,
			"to_address":   address,
			"amount":       coinsToAmountObjects(rewards),
		}
		return relationResult{
			Relation: "custom/merged-claim-rewards",
			Msg:      synthetic,
			Denoms:   extractDenomsFromCoins(rewards),
			Meta:     meta,
			Relevant: true,
		}
	case "/cosmos.distribution.v1beta1.MsgFundCommunityPool":
		depositor, _ := msg["depositor"].(string)
		if depositor == address {
			synthetic := map[string]any{
				"@type":        "/cosmos.bank.v1beta1.MsgSend",
				"from_address": depositor,
				"to_address":   "community-pool",
				"amount":       msg["amount"],
			}
			return relationResult{
				Relation: "send",
				Msg:      synthetic,
				Denoms:   extractDenoms(synthetic),
				Meta:     map[string]interface{}{},
				Relevant: true,
			}
		}
	}
	return relationResult{Relevant: false}
}

func extractDenoms(msg map[string]any) []string {
	denoms := make(map[string]struct{})
	add := func(v string) {
		if strings.TrimSpace(v) == "" {
			return
		}
		denoms[v] = struct{}{}
	}

	if token, ok := msg["token"].(map[string]any); ok {
		if d, ok := token["denom"].(string); ok {
			add(d)
		}
	}
	if amount, ok := msg["amount"].(map[string]any); ok {
		if d, ok := amount["denom"].(string); ok {
			add(d)
		}
	}
	if amounts, ok := msg["amount"].([]any); ok {
		for _, it := range amounts {
			if coin, ok := it.(map[string]any); ok {
				if d, ok := coin["denom"].(string); ok {
					add(d)
				}
			}
		}
	}

	out := make([]string, 0, len(denoms))
	for d := range denoms {
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

func hasDenomIntersection(msgDenoms []string, filter map[string]struct{}) bool {
	if len(filter) == 0 {
		return true
	}
	for _, d := range msgDenoms {
		if _, ok := filter[d]; ok {
			return true
		}
	}
	return false
}

func parseCSVSet(v string) map[string]struct{} {
	s := make(map[string]struct{})
	for _, p := range splitCSV(v) {
		s[p] = struct{}{}
	}
	return s
}

func parseCursorOffset(raw string) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}

	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return 0
	}
	var c cursor
	if err := json.Unmarshal(decoded, &c); err != nil {
		return 0
	}
	if c.Offset > 0 {
		return c.Offset
	}
	if c.Page > 0 {
		return c.Page
	}
	if c.Offset < 0 || c.Page < 0 {
		return 0
	}
	return 0
}

func encodeCursorOffset(offset int) string {
	if offset < 0 {
		offset = 0
	}
	bz, _ := json.Marshal(cursor{Offset: offset})
	return base64.RawURLEncoding.EncodeToString(bz)
}

func txMessageTypes(tx lcdTxResponse) []string {
	if tx.Tx == nil {
		return nil
	}
	out := make([]string, 0, len(tx.Tx.Body.Messages))
	for _, m := range tx.Tx.Body.Messages {
		if t, _ := m["@type"].(string); strings.TrimSpace(t) != "" {
			out = append(out, t)
		}
	}
	return out
}

func mergeMeta(base map[string]interface{}, extra map[string]any) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func parseWindowDuration(raw string) (time.Duration, bool) {
	v := strings.TrimSpace(strings.ToLower(raw))
	if strings.HasSuffix(v, "d") {
		n, err := strconv.Atoi(strings.TrimSuffix(v, "d"))
		if err != nil || n <= 0 {
			return 0, false
		}
		return time.Duration(n) * 24 * time.Hour, true
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return 0, false
	}
	return d, true
}

func extractCoinsFromHistoryItem(item txHistoryItem) map[string]*big.Int {
	switch item.Msg.Relation {
	case "custom/merged-claim-rewards":
		if rewards, ok := item.Msg.Meta["rewards"]; ok {
			return coinMapFromAny(rewards)
		}
	}
	return coinMapFromAny(item.Msg.Msg["amount"])
}

func txMsgTypesFromMeta(meta map[string]interface{}) []string {
	if meta == nil {
		return nil
	}
	raw, ok := meta["tx_msg_types"]
	if !ok {
		return nil
	}
	list, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, x := range list {
		if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func hasTypePrefix(types []string, prefix string) bool {
	for _, t := range types {
		if strings.HasPrefix(t, prefix) {
			return true
		}
	}
	return false
}

func addCoins(dst map[string]*big.Int, coins map[string]*big.Int) {
	for denom, amount := range coins {
		if _, ok := dst[denom]; !ok {
			dst[denom] = new(big.Int)
		}
		dst[denom].Add(dst[denom], amount)
	}
}

func coinMapFromAny(v any) map[string]*big.Int {
	out := map[string]*big.Int{}
	switch c := v.(type) {
	case []any:
		for _, item := range c {
			addCoinAny(out, item)
		}
	case []map[string]any:
		for _, item := range c {
			addCoinAny(out, item)
		}
	case map[string]any:
		addCoinAny(out, c)
	}
	return out
}

func addCoinAny(dst map[string]*big.Int, v any) {
	m := anyToMap(v)
	if len(m) == 0 {
		return
	}
	denom, _ := m["denom"].(string)
	amountRaw, _ := m["amount"].(string)
	denom = strings.TrimSpace(denom)
	amountRaw = strings.TrimSpace(amountRaw)
	if denom == "" || amountRaw == "" {
		return
	}
	amt, ok := new(big.Int).SetString(amountRaw, 10)
	if !ok {
		return
	}
	if _, ok := dst[denom]; !ok {
		dst[denom] = new(big.Int)
	}
	dst[denom].Add(dst[denom], amt)
}

func coinMapToList(m map[string]*big.Int) []coinAmount {
	out := make([]coinAmount, 0, len(m))
	for denom, amount := range m {
		out = append(out, coinAmount{
			Denom:  denom,
			Amount: amount.String(),
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Denom < out[j].Denom })
	return out
}

func defaultFeeByHashResponse() walletFeeByHashResponse {
	res := walletFeeByHashResponse{}
	res.AuthInfo.Fee.GasLimit = "0"
	res.AuthInfo.Fee.Payer = ""
	res.AuthInfo.Fee.Granter = ""
	res.AuthInfo.Fee.Amount = []struct {
		Denom  string `json:"denom"`
		Amount string `json:"amount"`
	}{}
	return res
}

func normalizeTxHash(txHash string) string {
	h := strings.TrimSpace(txHash)
	if h == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(h), "0x") {
		return h
	}
	return "0x" + strings.ToUpper(h)
}

func parsePositiveInt(raw string, fallback, max int) int {
	v, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || v <= 0 {
		return fallback
	}
	if v > max {
		return max
	}
	return v
}

func parseInt64(raw string) int64 {
	v, _ := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	return v
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode json error: %v", err)
	}
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func splitCSV(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		out = append(out, p)
	}
	return out
}

func anyToMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func findMultiSendCoins(v any, targetAddress string) (string, []map[string]any) {
	items, ok := v.([]any)
	if !ok {
		return "", nil
	}
	for _, item := range items {
		m := anyToMap(item)
		addr, _ := m["address"].(string)
		if addr != targetAddress {
			continue
		}
		coinsAny, _ := m["coins"].([]any)
		out := make([]map[string]any, 0, len(coinsAny))
		for _, c := range coinsAny {
			coin := anyToMap(c)
			if len(coin) > 0 {
				out = append(out, coin)
			}
		}
		return addr, out
	}
	return "", nil
}

func firstDifferentAddress(v any, excluded string) string {
	items, ok := v.([]any)
	if !ok {
		return ""
	}
	for _, item := range items {
		m := anyToMap(item)
		addr, _ := m["address"].(string)
		if addr != "" && addr != excluded {
			return addr
		}
	}
	return ""
}

func bestWeightedOption(v any) string {
	options, ok := v.([]any)
	if !ok || len(options) == 0 {
		return "VOTE_OPTION_UNSPECIFIED"
	}
	bestOpt := "VOTE_OPTION_UNSPECIFIED"
	bestWeight := -1.0
	for _, optAny := range options {
		opt := anyToMap(optAny)
		ov, _ := opt["option"].(string)
		wv, _ := opt["weight"].(string)
		w, _ := strconv.ParseFloat(wv, 64)
		if w > bestWeight {
			bestWeight = w
			bestOpt = ov
		}
	}
	if bestOpt == "" {
		return "VOTE_OPTION_UNSPECIFIED"
	}
	return bestOpt
}

func extractTransferRewardsFromLogs(tx lcdTxResponse, address string) []string {
	var rewards []string
	for _, logAny := range tx.Logs {
		logMap := anyToMap(logAny)
		events, _ := logMap["events"].([]any)
		for _, evAny := range events {
			ev := anyToMap(evAny)
			evType, _ := ev["type"].(string)
			if evType != "transfer" {
				continue
			}
			attrs, _ := ev["attributes"].([]any)
			var recipient, amount string
			for _, attrAny := range attrs {
				attr := anyToMap(attrAny)
				k, _ := attr["key"].(string)
				v, _ := attr["value"].(string)
				if k == "recipient" {
					recipient = v
				}
				if k == "amount" {
					amount = v
				}
			}
			if recipient == address && amount != "" {
				for _, coin := range strings.Split(amount, ",") {
					coin = strings.TrimSpace(coin)
					if coin != "" {
						rewards = append(rewards, coin)
					}
				}
			}
		}
	}
	return rewards
}

func extractDenomsFromCoins(coins []string) []string {
	set := map[string]struct{}{}
	for _, c := range coins {
		i := 0
		for i < len(c) && c[i] >= '0' && c[i] <= '9' {
			i++
		}
		if i < len(c) {
			denom := strings.TrimSpace(c[i:])
			if denom != "" {
				set[denom] = struct{}{}
			}
		}
	}
	out := make([]string, 0, len(set))
	for d := range set {
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

func coinsToAmountObjects(coins []string) []map[string]any {
	out := make([]map[string]any, 0, len(coins))
	for _, c := range coins {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		i := 0
		for i < len(c) && c[i] >= '0' && c[i] <= '9' {
			i++
		}
		if i == 0 || i >= len(c) {
			continue
		}
		out = append(out, map[string]any{
			"amount": c[:i],
			"denom":  c[i:],
		})
	}
	return out
}

func parseDenomToPriceID(v string) map[string]string {
	out := map[string]string{}
	for _, part := range splitCSV(v) {
		kv := strings.SplitN(part, ":", 2)
		if len(kv) != 2 {
			continue
		}
		denom := strings.TrimSpace(kv[0])
		id := strings.TrimSpace(kv[1])
		if denom != "" && id != "" {
			out[denom] = id
		}
	}
	return out
}

func (a *app) attachPrices(ctx context.Context, items []txHistoryItem, vsCurrenciesRaw string) []txHistoryItem {
	if !a.enablePriceEnrichment || len(items) == 0 || len(a.denomToPriceID) == 0 {
		return items
	}
	vsList := splitCSV(vsCurrenciesRaw)
	if len(vsList) == 0 {
		vsList = []string{"usd"}
	}

	idSet := map[string]struct{}{}
	for _, item := range items {
		for _, denom := range item.Msg.Denoms {
			if id, ok := a.denomToPriceID[denom]; ok {
				idSet[id] = struct{}{}
			}
		}
	}
	if len(idSet) == 0 {
		return items
	}

	ids := make([]string, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	params := url.Values{}
	params.Set("ids", strings.Join(ids, ","))
	params.Set("vs_currencies", strings.Join(vsList, ","))
	cacheKey := params.Encode()
	prices, ok := a.getPriceCache(cacheKey)
	if !ok {
		u := a.coinGeckoBaseURL + "/simple/price?" + cacheKey
		body, err := a.doGet(ctx, u)
		if err != nil {
			log.Printf("price enrichment failed: %v", err)
			return items
		}

		if err := json.Unmarshal(body, &prices); err != nil {
			log.Printf("price decode failed: %v", err)
			return items
		}
		a.setPriceCache(cacheKey, prices)
	}

	for i := range items {
		items[i].Prices = prices
	}
	return items
}

func (a *app) getPriceCache(key string) (map[string]map[string]float64, bool) {
	a.priceCacheMu.RLock()
	entry, ok := a.priceCache[key]
	a.priceCacheMu.RUnlock()
	if !ok || time.Now().After(entry.ExpiresAt) {
		a.recordCache(false)
		return nil, false
	}
	a.recordCache(true)
	return entry.Data, true
}

func (a *app) setPriceCache(key string, data map[string]map[string]float64) {
	a.priceCacheMu.Lock()
	a.priceCache[key] = priceCacheEntry{
		ExpiresAt: time.Now().Add(a.priceCacheTTL),
		Data:      data,
	}
	a.priceCacheMu.Unlock()
}

func (a *app) handleMetrics(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

	a.metrics.mu.Lock()
	defer a.metrics.mu.Unlock()

	fmt.Fprintln(w, "# HELP claw_txhistory_requests_total Total HTTP requests received by path.")
	fmt.Fprintln(w, "# TYPE claw_txhistory_requests_total counter")
	for path, v := range a.metrics.requestCountByPath {
		fmt.Fprintf(w, "claw_txhistory_requests_total{path=%q} %d\n", path, v)
	}

	fmt.Fprintln(w, "# HELP claw_txhistory_upstream_requests_total Total upstream HTTP requests by type.")
	fmt.Fprintln(w, "# TYPE claw_txhistory_upstream_requests_total counter")
	for typ, v := range a.metrics.upstreamRequestCountByType {
		fmt.Fprintf(w, "claw_txhistory_upstream_requests_total{type=%q} %d\n", typ, v)
	}

	fmt.Fprintln(w, "# HELP claw_txhistory_upstream_latency_seconds_sum Sum of upstream request latency by type.")
	fmt.Fprintln(w, "# TYPE claw_txhistory_upstream_latency_seconds_sum counter")
	for typ, v := range a.metrics.upstreamLatencySecByType {
		fmt.Fprintf(w, "claw_txhistory_upstream_latency_seconds_sum{type=%q} %.6f\n", typ, v)
	}

	fmt.Fprintln(w, "# HELP claw_txhistory_price_cache_hits_total Price cache hits.")
	fmt.Fprintln(w, "# TYPE claw_txhistory_price_cache_hits_total counter")
	fmt.Fprintf(w, "claw_txhistory_price_cache_hits_total %d\n", a.metrics.priceCacheHits)

	fmt.Fprintln(w, "# HELP claw_txhistory_price_cache_misses_total Price cache misses.")
	fmt.Fprintln(w, "# TYPE claw_txhistory_price_cache_misses_total counter")
	fmt.Fprintf(w, "claw_txhistory_price_cache_misses_total %d\n", a.metrics.priceCacheMisses)
}

func (a *app) recordRequest(path string) {
	a.metrics.mu.Lock()
	a.metrics.requestCountByPath[path]++
	a.metrics.mu.Unlock()
}

func (a *app) recordUpstream(typ string, dur time.Duration) {
	a.metrics.mu.Lock()
	a.metrics.upstreamRequestCountByType[typ]++
	a.metrics.upstreamLatencySecByType[typ] += dur.Seconds()
	a.metrics.mu.Unlock()
}

func (a *app) recordCache(hit bool) {
	a.metrics.mu.Lock()
	if hit {
		a.metrics.priceCacheHits++
	} else {
		a.metrics.priceCacheMisses++
	}
	a.metrics.mu.Unlock()
}

func classifyUpstreamType(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "unknown"
	}
	switch {
	case strings.Contains(u.Path, "/cosmos/tx/v1beta1/txs/"):
		return "lcd_tx_by_hash"
	case strings.Contains(u.Path, "/cosmos/tx/v1beta1/txs"):
		return "lcd_tx_search"
	case strings.Contains(u.Path, "/simple/price"):
		return "coingecko_simple_price"
	default:
		return "unknown"
	}
}
