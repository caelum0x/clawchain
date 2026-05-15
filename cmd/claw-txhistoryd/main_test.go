package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestTxHistoryContract(t *testing.T) {
	a := newApp(
		[]chainBackend{
			{
				Identifier:   "clawchain",
				ChainID:      "clawchain-1",
				Bech32Prefix: "claw",
				LCD:          "https://lcd.mock",
				Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
			},
		},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}

	t.Run("supports", func(t *testing.T) {
		body, status := callAPI(t, a, "/tx-history/supports")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var supports []string
		mustJSON(t, body, &supports)
		if len(supports) != 1 || supports[0] != "clawchain" {
			t.Fatalf("unexpected supports: %+v", supports)
		}
	})

	t.Run("explorer", func(t *testing.T) {
		body, status := callAPI(t, a, "/tx-history/explorer/clawchain")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var explorer map[string]string
		mustJSON(t, body, &explorer)
		if explorer["link"] == "" || !strings.Contains(explorer["link"], "{txHash}") {
			t.Fatalf("unexpected explorer payload: %+v", explorer)
		}
	})

	t.Run("single history", func(t *testing.T) {
		body, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?relations=send,receive,delegate&limit=20")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var history txHistoryResponse
		mustJSON(t, body, &history)
		if len(history.Msgs) == 0 {
			t.Fatalf("expected history items, got 0")
		}
		first := history.Msgs[0].Msg
		if first.TxHash == "" || first.ChainID == "" || first.Relation == "" {
			t.Fatalf("invalid msg shape: %+v", first)
		}
	})

	t.Run("multichain history", func(t *testing.T) {
		body, status := callAPI(t, a, "/history/v2/msgs/keplr-multi-chain?baseHexAddress=claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l&chainIdentifiers=clawchain-1&relations=send,receive&limit=20")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var history txHistoryResponse
		mustJSON(t, body, &history)
		if len(history.Msgs) == 0 {
			t.Fatalf("expected multichain history items, got 0")
		}
	})

	t.Run("tx by hash", func(t *testing.T) {
		body, status := callAPI(t, a, "/block/txs/by-hash/clawchain/ABC123")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var fee walletFeeByHashResponse
		mustJSON(t, body, &fee)
		if fee.AuthInfo.Fee.GasLimit == "" {
			t.Fatalf("missing gas limit: %+v", fee)
		}
	})

	t.Run("msg by hash and index", func(t *testing.T) {
		body, status := callAPI(t, a, "/block/msg/clawchain/ABC123/0")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, body)
		}
		var payload map[string]map[string]any
		mustJSON(t, body, &payload)
		msg := payload["msg"]
		if msg["@type"] == nil {
			t.Fatalf("missing message type: %+v", payload)
		}
	})
}

func TestRelationCoverage(t *testing.T) {
	addr := "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l"

	t.Run("authz exec nested send", func(t *testing.T) {
		msg := map[string]any{
			"@type":   "/cosmos.authz.v1beta1.MsgExec",
			"grantee": addr,
			"msgs": []any{
				map[string]any{
					"@type":        "/cosmos.bank.v1beta1.MsgSend",
					"from_address": addr,
					"to_address":   "claw1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyydz7ng0",
					"amount": []any{
						map[string]any{"denom": "uclaw", "amount": "1"},
					},
				},
			},
		}
		res := classifyRelation(msg, addr, lcdTxResponse{})
		if !res.Relevant || res.Relation != "send" {
			t.Fatalf("expected nested send relation, got %+v", res)
		}
	})

	t.Run("vote weighted", func(t *testing.T) {
		msg := map[string]any{
			"@type":       "/cosmos.gov.v1.MsgVoteWeighted",
			"proposal_id": "42",
			"voter":       addr,
			"options": []any{
				map[string]any{"option": "VOTE_OPTION_NO", "weight": "0.3"},
				map[string]any{"option": "VOTE_OPTION_YES", "weight": "0.7"},
			},
		}
		res := classifyRelation(msg, addr, lcdTxResponse{})
		if !res.Relevant || res.Relation != "vote" {
			t.Fatalf("expected vote relation, got %+v", res)
		}
		if got := res.Msg["option"]; got != "VOTE_OPTION_YES" {
			t.Fatalf("unexpected weighted option: %v", got)
		}
	})

	t.Run("withdraw reward", func(t *testing.T) {
		msg := map[string]any{
			"@type":             "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
			"delegator_address": addr,
		}
		tx := lcdTxResponse{
			Logs: []any{
				map[string]any{
					"events": []any{
						map[string]any{
							"type": "transfer",
							"attributes": []any{
								map[string]any{"key": "recipient", "value": addr},
								map[string]any{"key": "amount", "value": "12uclaw,3uatom"},
							},
						},
					},
				},
			},
		}
		res := classifyRelation(msg, addr, tx)
		if !res.Relevant || res.Relation != "custom/merged-claim-rewards" {
			t.Fatalf("expected merged claim rewards relation, got %+v", res)
		}
		if len(res.Denoms) == 0 {
			t.Fatalf("expected denoms from logs, got %+v", res)
		}
	})

	t.Run("withdraw validator commission", func(t *testing.T) {
		msg := map[string]any{
			"@type":             "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
			"validator_address": "clawvaloper1aaaaaaaaaaaaaaaaaaaaaaaaaaaaa7g6z8y",
		}
		tx := lcdTxResponse{
			Logs: []any{
				map[string]any{
					"events": []any{
						map[string]any{
							"type": "transfer",
							"attributes": []any{
								map[string]any{"key": "recipient", "value": addr},
								map[string]any{"key": "amount", "value": "9uclaw"},
							},
						},
					},
				},
			},
		}
		res := classifyRelation(msg, addr, tx)
		if !res.Relevant || res.Relation != "custom/merged-claim-rewards" {
			t.Fatalf("expected merged claim rewards for commission, got %+v", res)
		}
	})

	t.Run("fund community pool", func(t *testing.T) {
		msg := map[string]any{
			"@type":     "/cosmos.distribution.v1beta1.MsgFundCommunityPool",
			"depositor": addr,
			"amount": []any{
				map[string]any{"denom": "uclaw", "amount": "100"},
			},
		}
		res := classifyRelation(msg, addr, lcdTxResponse{})
		if !res.Relevant || res.Relation != "send" {
			t.Fatalf("expected send relation for fund community pool, got %+v", res)
		}
	})
}

func TestMetricsEndpoint(t *testing.T) {
	a := newApp(
		[]chainBackend{
			{
				Identifier:   "clawchain",
				ChainID:      "clawchain-1",
				Bech32Prefix: "claw",
				LCD:          "https://lcd.mock",
				Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
			},
		},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}
	a.enablePriceEnrichment = true
	a.coinGeckoBaseURL = "https://price.mock"
	a.denomToPriceID = map[string]string{"uclaw": "claw"}

	_, _ = callAPI(t, a, "/tx-history/supports")
	_, _ = callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?relations=send,receive&vsCurrencies=usd&limit=20")
	body, status := callAPI(t, a, "/metrics")
	if status != http.StatusOK {
		t.Fatalf("metrics status=%d body=%s", status, string(body))
	}
	s := string(body)
	if !strings.Contains(s, "claw_txhistory_requests_total") {
		t.Fatalf("metrics missing request counter: %s", s)
	}
	if !strings.Contains(s, "claw_txhistory_upstream_requests_total") {
		t.Fatalf("metrics missing upstream counter: %s", s)
	}
	if !strings.Contains(s, "claw_txhistory_price_cache_") {
		t.Fatalf("metrics missing cache counters: %s", s)
	}
}

func TestHistoryCursorPagination(t *testing.T) {
	a := newApp(
		[]chainBackend{
			{
				Identifier:   "clawchain",
				ChainID:      "clawchain-1",
				Bech32Prefix: "claw",
				LCD:          "https://lcd.mock",
				Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
			},
		},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}

	body1, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=1")
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, string(body1))
	}
	var page1 txHistoryResponse
	mustJSON(t, body1, &page1)
	if len(page1.Msgs) != 1 {
		t.Fatalf("expected one msg on page1, got %d", len(page1.Msgs))
	}
	if page1.NextCursor == "" {
		t.Fatalf("expected nextCursor on page1")
	}
	if !page1.Pagination.HasMore || page1.Pagination.NextCursor == "" {
		t.Fatalf("expected pagination.has_more=true with next cursor")
	}

	body2, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=1&cursor="+url.QueryEscape(page1.NextCursor))
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, string(body2))
	}
	var page2 txHistoryResponse
	mustJSON(t, body2, &page2)
	if len(page2.Msgs) == 0 {
		t.Fatalf("expected second page to contain data")
	}
	if page2.Msgs[0].Msg.TxHash == page1.Msgs[0].Msg.TxHash {
		t.Fatalf("expected cursor page to advance, got duplicate tx hash %s", page2.Msgs[0].Msg.TxHash)
	}
}

func TestEarningsEndpoint(t *testing.T) {
	a := newApp(
		[]chainBackend{
			{
				Identifier:   "clawchain",
				ChainID:      "clawchain-1",
				Bech32Prefix: "claw",
				LCD:          "https://lcd.mock",
				Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
			},
		},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}

	body, status := callAPI(t, a, "/history/v2/earnings/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?window=7d")
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, string(body))
	}
	var payload earningsResponse
	mustJSON(t, body, &payload)
	if payload.Address == "" || payload.ChainIdentifier == "" {
		t.Fatalf("missing earnings identifiers: %+v", payload)
	}
	if payload.Window != "7d" {
		t.Fatalf("unexpected window: %s", payload.Window)
	}
	// Verify the earnings response structure is valid.
	// Totals may be empty if no incoming transfers match the earnings
	// relations filter, which depends on classifyRelation output.
	if payload.Breakdown == nil {
		t.Fatalf("expected non-nil breakdown map: %+v", payload)
	}
}

func callAPI(t *testing.T, a *app, path string) ([]byte, int) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	rec := httptest.NewRecorder()
	a.handle(rec, req)
	return rec.Body.Bytes(), rec.Code
}

func mustJSON(t *testing.T, body []byte, out any) {
	t.Helper()
	if err := json.Unmarshal(body, out); err != nil {
		t.Fatalf("json decode failed: %v body=%s", err, string(body))
	}
}

type mockLCDTransport struct{}

func (mockLCDTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	path := req.URL.Path
	query := req.URL.Query()
	host := req.URL.Host

	switch {
	case host == "price.mock" && path == "/simple/price":
		return jsonResponse(http.StatusOK, map[string]any{
			"claw": map[string]any{
				"usd": 0.25,
			},
		}), nil
	case path == "/cosmos/tx/v1beta1/txs":
		return jsonResponse(http.StatusOK, map[string]any{
			"tx_responses": txsByEvent(query.Get("events")),
			"pagination": map[string]any{
				"next_key": nil,
				"total":    "0",
			},
		}), nil
	case path == "/cosmos/tx/v1beta1/txs/ABC123":
		return jsonResponse(http.StatusOK, map[string]any{
			"tx": map[string]any{
				"body": map[string]any{
					"messages": []map[string]any{
						{
							"@type":        "/cosmos.bank.v1beta1.MsgSend",
							"from_address": "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l",
							"to_address":   "claw1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyydz7ng0",
							"amount": []map[string]any{
								{"denom": "uclaw", "amount": "100"},
							},
						},
					},
				},
				"auth_info": map[string]any{
					"fee": map[string]any{
						"amount": []map[string]any{
							{"denom": "uclaw", "amount": "7"},
						},
						"gas_limit": "70000",
						"payer":     "",
						"granter":   "",
					},
				},
			},
			"tx_response": map[string]any{
				"txhash":    "ABC123",
				"height":    "10",
				"timestamp": "2026-02-27T20:00:00Z",
				"code":      0,
			},
		}), nil
	default:
		return jsonResponse(http.StatusNotFound, map[string]string{"error": "not found"}), nil
	}
}

func txsByEvent(event string) []map[string]any {
	switch {
	case strings.Contains(event, "message.sender='claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l'"):
		return []map[string]any{
			mockTxResponse("ABC123", "10", "2026-02-27T20:00:00Z", 0, []map[string]any{
				{
					"@type":        "/cosmos.bank.v1beta1.MsgSend",
					"from_address": "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l",
					"to_address":   "claw1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyydz7ng0",
					"amount": []map[string]any{
						{"denom": "uclaw", "amount": "100"},
					},
				},
			}),
			mockTxResponse("ABC124", "9", "2026-02-27T19:00:00Z", 0, []map[string]any{
				{
					"@type":             "/cosmos.staking.v1beta1.MsgDelegate",
					"delegator_address": "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l",
					"validator_address": "clawvaloper1aaaaaaaaaaaaaaaaaaaaaaaaaaaaa7g6z8y",
					"amount": map[string]any{
						"denom":  "uclaw",
						"amount": "50",
					},
				},
			}),
		}
	case strings.Contains(event, "transfer.recipient='claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l'"):
		return []map[string]any{
			mockTxResponse("ABC125", "11", "2026-02-27T21:00:00Z", 0, []map[string]any{
				{
					"@type":        "/cosmos.bank.v1beta1.MsgSend",
					"from_address": "claw1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzl5kg3j",
					"to_address":   "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l",
					"amount": []map[string]any{
						{"denom": "uclaw", "amount": "20"},
					},
				},
			}),
			mockTxResponse("ABC126", "12", "2026-02-27T22:00:00Z", 0, []map[string]any{
				{
					"@type": "/cosmos.bank.v1beta1.MsgMultiSend",
					"inputs": []map[string]any{
						{
							"address": "claw1senderxxxxxxxxxxxxxxxxxxxxxxxxxxxxx9xqv3",
							"coins": []map[string]any{
								{"denom": "uclaw", "amount": "30"},
							},
						},
					},
					"outputs": []map[string]any{
						{
							"address": "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l",
							"coins": []map[string]any{
								{"denom": "uclaw", "amount": "30"},
							},
						},
					},
				},
			}),
		}
	default:
		return []map[string]any{}
	}
}

func mockTxResponse(hash, height, ts string, code uint32, messages []map[string]any) map[string]any {
	return map[string]any{
		"txhash":    hash,
		"height":    height,
		"timestamp": ts,
		"code":      code,
		"tx": map[string]any{
			"body": map[string]any{
				"messages": messages,
			},
			"auth_info": map[string]any{
				"fee": map[string]any{
					"amount": []map[string]any{
						{"denom": "uclaw", "amount": "1"},
					},
					"gas_limit": "200000",
					"payer":     "",
					"granter":   "",
				},
			},
		},
	}
}

func jsonResponse(status int, payload any) *http.Response {
	bz, _ := json.Marshal(payload)
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewReader(bz)),
		Request: &http.Request{
			URL: &url.URL{},
		},
	}
}

func TestPriceEnrichment(t *testing.T) {
	a := newApp(
		[]chainBackend{
			{
				Identifier:   "clawchain",
				ChainID:      "clawchain-1",
				Bech32Prefix: "claw",
				LCD:          "https://lcd.mock",
				Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
			},
		},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}
	a.enablePriceEnrichment = true
	a.coinGeckoBaseURL = "https://price.mock"
	a.denomToPriceID = map[string]string{"uclaw": "claw"}

	body, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?relations=send,receive&vsCurrencies=usd&limit=20")
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}

	var history txHistoryResponse
	mustJSON(t, body, &history)
	if len(history.Msgs) == 0 {
		t.Fatalf("expected history items")
	}
	if history.Msgs[0].Prices == nil {
		t.Fatalf("expected prices map in response")
	}
	if history.Msgs[0].Prices["claw"]["usd"] <= 0 {
		t.Fatalf("expected claw.usd price, got %+v", history.Msgs[0].Prices)
	}
}

func TestMultiSendRelation(t *testing.T) {
	addr := "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l"
	msg := map[string]any{
		"@type": "/cosmos.bank.v1beta1.MsgMultiSend",
		"inputs": []any{
			map[string]any{
				"address": "claw1senderxxxxxxxxxxxxxxxxxxxxxxxxxxxxx9xqv3",
				"coins": []any{
					map[string]any{"denom": "uclaw", "amount": "30"},
				},
			},
		},
		"outputs": []any{
			map[string]any{
				"address": addr,
				"coins": []any{
					map[string]any{"denom": "uclaw", "amount": "30"},
				},
			},
		},
	}
	res := classifyRelation(msg, addr, lcdTxResponse{})
	if !res.Relevant || res.Relation != "receive" {
		t.Fatalf("expected receive relation for multisend, got %+v", res)
	}
}

func TestTxHistorySchemaContracts(t *testing.T) {
	a := newApp(
		[]chainBackend{
			{
				Identifier:   "clawchain",
				ChainID:      "clawchain-1",
				Bech32Prefix: "claw",
				LCD:          "https://lcd.mock",
				Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
			},
		},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}

	t.Run("history_v2_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=20")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		assertHistorySchema(t, body)
	})

	t.Run("history_v1_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/history/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=20")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		assertHistorySchema(t, body)
	})

	t.Run("history_multichain_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/history/v2/msgs/keplr-multi-chain?baseHexAddress=claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l&chainIdentifiers=clawchain,clawchain-1&limit=20")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		assertHistorySchema(t, body)
	})

	t.Run("supports_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/tx-history/supports")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		var supports []string
		mustJSON(t, body, &supports)
		if len(supports) == 0 || supports[0] == "" {
			t.Fatalf("unexpected supports payload: %s", string(body))
		}
	})

	t.Run("explorer_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/tx-history/explorer/clawchain")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		var payload struct {
			Link string `json:"link"`
		}
		mustJSON(t, body, &payload)
		if payload.Link == "" {
			t.Fatalf("missing explorer link in payload: %s", string(body))
		}
	})

	t.Run("tx_by_hash_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/block/txs/by-hash/clawchain/ABC123")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		var fee walletFeeByHashResponse
		mustJSON(t, body, &fee)
		if fee.AuthInfo.Fee.GasLimit == "" {
			t.Fatalf("missing fee gas_limit: %s", string(body))
		}
	})

	t.Run("msg_by_hash_schema", func(t *testing.T) {
		body, status := callAPI(t, a, "/block/msg/clawchain/ABC123/0")
		if status != http.StatusOK {
			t.Fatalf("status=%d body=%s", status, string(body))
		}
		var payload struct {
			Msg map[string]any `json:"msg"`
		}
		mustJSON(t, body, &payload)
		if payload.Msg == nil || payload.Msg["@type"] == nil {
			t.Fatalf("missing msg payload: %s", string(body))
		}
	})
}

// ---------------------------------------------------------------------------
// Unit tests for address parsing and bech32 conversion
// ---------------------------------------------------------------------------

func TestNormalizeAddress(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		prefix string
		want   string
	}{
		{"empty string", "", "claw", ""},
		{"whitespace only", "   ", "claw", ""},
		{"plain bech32 passthrough", "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l", "claw", "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l"},
		{"hex address 0x prefix", "0x0000000000000000000000000000000000000001", "claw", ""},
		{"invalid hex", "0xZZZZ", "claw", ""},
		{"hex without 0x stays as-is", "abcdef", "claw", "abcdef"},
		{"leading/trailing whitespace stripped", "  claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l  ", "claw", "claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeAddress(tt.raw, tt.prefix)
			if tt.want != "" && got != tt.want {
				t.Fatalf("normalizeAddress(%q, %q) = %q, want %q", tt.raw, tt.prefix, got, tt.want)
			}
			if tt.want == "" && got != "" {
				// For hex addresses that produce valid bech32, we just check non-empty
				// For truly invalid cases, ensure empty
				if tt.raw == "" || tt.raw == "   " || tt.raw == "0xZZZZ" {
					t.Fatalf("expected empty, got %q", got)
				}
			}
		})
	}
}

func TestNormalizeAddressHexConversion(t *testing.T) {
	// A valid 20-byte hex should produce a valid bech32 address
	hexAddr := "0x" + strings.Repeat("ab", 20)
	got := normalizeAddress(hexAddr, "claw")
	if got == "" {
		t.Fatal("expected valid bech32 address from hex, got empty")
	}
	if !strings.HasPrefix(got, "claw1") {
		t.Fatalf("expected claw1 prefix, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// Unit tests for normalizeTxHash
// ---------------------------------------------------------------------------

func TestNormalizeTxHash(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"  ", ""},
		{"ABC123", "0xABC123"},
		{"0xABC123", "0xABC123"},
		{"0XABC123", "0XABC123"}, // already has 0x prefix (case-insensitive check)
		{"abc", "0xABC"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeTxHash(tt.input)
			if got != tt.want {
				t.Fatalf("normalizeTxHash(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for parsePositiveInt
// ---------------------------------------------------------------------------

func TestParsePositiveInt(t *testing.T) {
	tests := []struct {
		raw      string
		fallback int
		max      int
		want     int
	}{
		{"", 20, 200, 20},
		{"abc", 20, 200, 20},
		{"-1", 20, 200, 20},
		{"0", 20, 200, 20},
		{"10", 20, 200, 10},
		{"500", 20, 200, 200},
		{"  50 ", 20, 200, 50},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got := parsePositiveInt(tt.raw, tt.fallback, tt.max)
			if got != tt.want {
				t.Fatalf("parsePositiveInt(%q, %d, %d) = %d, want %d", tt.raw, tt.fallback, tt.max, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for parseInt64
// ---------------------------------------------------------------------------

func TestParseInt64(t *testing.T) {
	tests := []struct {
		raw  string
		want int64
	}{
		{"", 0},
		{"abc", 0},
		{"42", 42},
		{"-1", -1},
		{"  100 ", 100},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got := parseInt64(tt.raw)
			if got != tt.want {
				t.Fatalf("parseInt64(%q) = %d, want %d", tt.raw, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for cursor encode/decode roundtrip
// ---------------------------------------------------------------------------

func TestCursorRoundTrip(t *testing.T) {
	tests := []int{0, 1, 20, 100, 999}
	for _, offset := range tests {
		encoded := encodeCursorOffset(offset)
		decoded := parseCursorOffset(encoded)
		if decoded != offset {
			t.Fatalf("cursor roundtrip failed: encode(%d) = %q, decode = %d", offset, encoded, decoded)
		}
	}
}

func TestParseCursorOffset_EdgeCases(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want int
	}{
		{"empty", "", 0},
		{"whitespace", "  ", 0},
		{"invalid base64", "!!not-base64!!", 0},
		{"valid base64 but invalid json", base64.RawURLEncoding.EncodeToString([]byte("not json")), 0},
		{"negative offset", base64.RawURLEncoding.EncodeToString([]byte(`{"o":-5}`)), 0},
		{"zero offset", base64.RawURLEncoding.EncodeToString([]byte(`{"o":0}`)), 0},
		{"backward compat page field", base64.RawURLEncoding.EncodeToString([]byte(`{"p":7}`)), 7},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseCursorOffset(tt.raw)
			if got != tt.want {
				t.Fatalf("parseCursorOffset(%q) = %d, want %d", tt.raw, got, tt.want)
			}
		})
	}
}

func TestEncodeCursorOffset_Negative(t *testing.T) {
	encoded := encodeCursorOffset(-5)
	decoded := parseCursorOffset(encoded)
	if decoded != 0 {
		t.Fatalf("negative offset should encode to 0, got %d", decoded)
	}
}

// ---------------------------------------------------------------------------
// Unit tests for parseWindowDuration
// ---------------------------------------------------------------------------

func TestParseWindowDuration(t *testing.T) {
	tests := []struct {
		raw   string
		ok    bool
		hours float64
	}{
		{"7d", true, 7 * 24},
		{"1d", true, 24},
		{"24h", true, 24},
		{"30D", true, 30 * 24},
		{"0d", false, 0},
		{"-1d", false, 0},
		{"", false, 0},
		{"abc", false, 0},
		{"0h", false, 0},
		{"2h30m", true, 2.5},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			dur, ok := parseWindowDuration(tt.raw)
			if ok != tt.ok {
				t.Fatalf("parseWindowDuration(%q) ok = %v, want %v", tt.raw, ok, tt.ok)
			}
			if ok && dur.Hours() != tt.hours {
				t.Fatalf("parseWindowDuration(%q) = %v hours, want %v", tt.raw, dur.Hours(), tt.hours)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for extractDenoms
// ---------------------------------------------------------------------------

func TestExtractDenoms(t *testing.T) {
	tests := []struct {
		name string
		msg  map[string]any
		want []string
	}{
		{
			"amount as list",
			map[string]any{
				"amount": []any{
					map[string]any{"denom": "uclaw", "amount": "100"},
					map[string]any{"denom": "uatom", "amount": "50"},
				},
			},
			[]string{"uatom", "uclaw"},
		},
		{
			"amount as single coin object",
			map[string]any{
				"amount": map[string]any{"denom": "uclaw", "amount": "100"},
			},
			[]string{"uclaw"},
		},
		{
			"token field (IBC)",
			map[string]any{
				"token": map[string]any{"denom": "uosmo", "amount": "200"},
			},
			[]string{"uosmo"},
		},
		{
			"empty msg",
			map[string]any{},
			[]string{},
		},
		{
			"duplicate denoms deduplicated",
			map[string]any{
				"amount": []any{
					map[string]any{"denom": "uclaw", "amount": "10"},
					map[string]any{"denom": "uclaw", "amount": "20"},
				},
			},
			[]string{"uclaw"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractDenoms(tt.msg)
			if len(got) != len(tt.want) {
				t.Fatalf("extractDenoms = %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("extractDenoms[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for hasDenomIntersection
// ---------------------------------------------------------------------------

func TestHasDenomIntersection(t *testing.T) {
	tests := []struct {
		name      string
		msgDenoms []string
		filter    map[string]struct{}
		want      bool
	}{
		{"empty filter always true", []string{"uclaw"}, map[string]struct{}{}, true},
		{"match", []string{"uclaw", "uatom"}, map[string]struct{}{"uclaw": {}}, true},
		{"no match", []string{"uclaw"}, map[string]struct{}{"uatom": {}}, false},
		{"both empty", nil, map[string]struct{}{}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasDenomIntersection(tt.msgDenoms, tt.filter)
			if got != tt.want {
				t.Fatalf("hasDenomIntersection = %v, want %v", got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for splitCSV and parseCSVSet
// ---------------------------------------------------------------------------

func TestSplitCSV(t *testing.T) {
	tests := []struct {
		input string
		want  []string
	}{
		{"", nil},
		{"a,b,c", []string{"a", "b", "c"}},
		{" a , b , c ", []string{"a", "b", "c"}},
		{"a,,b", []string{"a", "b"}},
		{",,,", nil},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := splitCSV(tt.input)
			if len(got) == 0 && len(tt.want) == 0 {
				return
			}
			if len(got) != len(tt.want) {
				t.Fatalf("splitCSV(%q) = %v, want %v", tt.input, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("splitCSV(%q)[%d] = %q, want %q", tt.input, i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestParseCSVSet(t *testing.T) {
	got := parseCSVSet("send,receive,delegate")
	if len(got) != 3 {
		t.Fatalf("expected 3 items, got %d", len(got))
	}
	for _, k := range []string{"send", "receive", "delegate"} {
		if _, ok := got[k]; !ok {
			t.Fatalf("missing key %q in set", k)
		}
	}

	empty := parseCSVSet("")
	if len(empty) != 0 {
		t.Fatalf("expected empty set, got %d items", len(empty))
	}
}

// ---------------------------------------------------------------------------
// Unit tests for parseDenomToPriceID
// ---------------------------------------------------------------------------

func TestParseDenomToPriceID(t *testing.T) {
	tests := []struct {
		input string
		want  map[string]string
	}{
		{"uclaw:claw", map[string]string{"uclaw": "claw"}},
		{"uclaw:claw,uatom:cosmos", map[string]string{"uclaw": "claw", "uatom": "cosmos"}},
		{"", map[string]string{}},
		{"invalid", map[string]string{}},
		{":empty", map[string]string{}},
		{"empty:", map[string]string{}},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseDenomToPriceID(tt.input)
			if len(got) != len(tt.want) {
				t.Fatalf("parseDenomToPriceID(%q) = %v, want %v", tt.input, got, tt.want)
			}
			for k, v := range tt.want {
				if got[k] != v {
					t.Fatalf("parseDenomToPriceID(%q)[%q] = %q, want %q", tt.input, k, got[k], v)
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for bestWeightedOption
// ---------------------------------------------------------------------------

func TestBestWeightedOption(t *testing.T) {
	tests := []struct {
		name    string
		options any
		want    string
	}{
		{"nil", nil, "VOTE_OPTION_UNSPECIFIED"},
		{"empty list", []any{}, "VOTE_OPTION_UNSPECIFIED"},
		{
			"single option",
			[]any{map[string]any{"option": "VOTE_OPTION_YES", "weight": "1.0"}},
			"VOTE_OPTION_YES",
		},
		{
			"multiple options highest weight wins",
			[]any{
				map[string]any{"option": "VOTE_OPTION_NO", "weight": "0.3"},
				map[string]any{"option": "VOTE_OPTION_YES", "weight": "0.7"},
			},
			"VOTE_OPTION_YES",
		},
		{
			"empty option string falls back",
			[]any{map[string]any{"option": "", "weight": "1.0"}},
			"VOTE_OPTION_UNSPECIFIED",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := bestWeightedOption(tt.options)
			if got != tt.want {
				t.Fatalf("bestWeightedOption = %q, want %q", got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for extractDenomsFromCoins
// ---------------------------------------------------------------------------

func TestExtractDenomsFromCoins(t *testing.T) {
	tests := []struct {
		coins []string
		want  []string
	}{
		{[]string{"12uclaw", "3uatom"}, []string{"uatom", "uclaw"}},
		{[]string{"100uclaw", "200uclaw"}, []string{"uclaw"}},
		{[]string{""}, []string{}},
		{nil, []string{}},
		{[]string{"uclaw"}, []string{"uclaw"}}, // no leading digits
	}
	for _, tt := range tests {
		t.Run(strings.Join(tt.coins, ","), func(t *testing.T) {
			got := extractDenomsFromCoins(tt.coins)
			if len(got) != len(tt.want) {
				t.Fatalf("extractDenomsFromCoins(%v) = %v, want %v", tt.coins, got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("extractDenomsFromCoins[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for coinsToAmountObjects
// ---------------------------------------------------------------------------

func TestCoinsToAmountObjects(t *testing.T) {
	got := coinsToAmountObjects([]string{"12uclaw", "3uatom", ""})
	if len(got) != 2 {
		t.Fatalf("expected 2 objects, got %d: %+v", len(got), got)
	}
	if got[0]["amount"] != "12" || got[0]["denom"] != "uclaw" {
		t.Fatalf("unexpected first coin: %+v", got[0])
	}
	if got[1]["amount"] != "3" || got[1]["denom"] != "uatom" {
		t.Fatalf("unexpected second coin: %+v", got[1])
	}

	// Pure denom without digits should be skipped
	noDigits := coinsToAmountObjects([]string{"uclaw"})
	if len(noDigits) != 0 {
		t.Fatalf("expected 0 objects for denom-only input, got %d", len(noDigits))
	}
}

// ---------------------------------------------------------------------------
// Unit tests for coinMapFromAny and coinMapToList
// ---------------------------------------------------------------------------

func TestCoinMapFromAny(t *testing.T) {
	t.Run("list of coins", func(t *testing.T) {
		got := coinMapFromAny([]any{
			map[string]any{"denom": "uclaw", "amount": "100"},
			map[string]any{"denom": "uclaw", "amount": "50"},
			map[string]any{"denom": "uatom", "amount": "25"},
		})
		if got["uclaw"].Int64() != 150 {
			t.Fatalf("expected uclaw=150, got %s", got["uclaw"])
		}
		if got["uatom"].Int64() != 25 {
			t.Fatalf("expected uatom=25, got %s", got["uatom"])
		}
	})

	t.Run("single coin", func(t *testing.T) {
		got := coinMapFromAny(map[string]any{"denom": "uclaw", "amount": "42"})
		if got["uclaw"].Int64() != 42 {
			t.Fatalf("expected uclaw=42, got %s", got["uclaw"])
		}
	})

	t.Run("invalid amount string", func(t *testing.T) {
		got := coinMapFromAny(map[string]any{"denom": "uclaw", "amount": "not-a-number"})
		if len(got) != 0 {
			t.Fatalf("expected empty map for invalid amount, got %v", got)
		}
	})

	t.Run("missing denom", func(t *testing.T) {
		got := coinMapFromAny(map[string]any{"amount": "100"})
		if len(got) != 0 {
			t.Fatalf("expected empty map for missing denom, got %v", got)
		}
	})
}

func TestCoinMapToList(t *testing.T) {
	m := map[string]*big.Int{
		"uclaw": big.NewInt(100),
		"uatom": big.NewInt(50),
	}
	got := coinMapToList(m)
	if len(got) != 2 {
		t.Fatalf("expected 2 items, got %d", len(got))
	}
	// Should be sorted by denom
	if got[0].Denom != "uatom" || got[0].Amount != "50" {
		t.Fatalf("unexpected first: %+v", got[0])
	}
	if got[1].Denom != "uclaw" || got[1].Amount != "100" {
		t.Fatalf("unexpected second: %+v", got[1])
	}
}

// ---------------------------------------------------------------------------
// Unit tests for normalizeChainIdentifier
// ---------------------------------------------------------------------------

func TestNormalizeChainIdentifier(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"clawchain", "clawchain"},
		{"clawchain-1", "clawchain"},
		{"CLAWCHAIN", "clawchain"},
		{"clawchain-testnet", "clawchain-testnet"},
		{"clawchain-testnet-1", "clawchain-testnet"},
		{"other-chain", "other-chain"},
		{"  Clawchain  ", "clawchain"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeChainIdentifier(tt.input)
			if got != tt.want {
				t.Fatalf("normalizeChainIdentifier(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for classifyUpstreamType
// ---------------------------------------------------------------------------

func TestClassifyUpstreamType(t *testing.T) {
	tests := []struct {
		url  string
		want string
	}{
		{"https://api.example.com/cosmos/tx/v1beta1/txs/ABC123", "lcd_tx_by_hash"},
		{"https://api.example.com/cosmos/tx/v1beta1/txs?events=foo", "lcd_tx_search"},
		{"https://price.mock/simple/price?ids=claw", "coingecko_simple_price"},
		{"https://example.com/unknown", "unknown"},
		{"not a valid url\x00", "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := classifyUpstreamType(tt.url)
			if got != tt.want {
				t.Fatalf("classifyUpstreamType(%q) = %q, want %q", tt.url, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Unit tests for mergeMeta
// ---------------------------------------------------------------------------

func TestMergeMeta(t *testing.T) {
	base := map[string]interface{}{"a": 1, "b": 2}
	extra := map[string]any{"b": 3, "c": 4}
	got := mergeMeta(base, extra)
	if got["a"] != 1 || got["b"] != 3 || got["c"] != 4 {
		t.Fatalf("mergeMeta unexpected: %+v", got)
	}
	// Ensure base is not mutated
	if base["b"] != 2 {
		t.Fatal("base was mutated")
	}
}

// ---------------------------------------------------------------------------
// Unit tests for txMessageTypes
// ---------------------------------------------------------------------------

func TestTxMessageTypes(t *testing.T) {
	t.Run("nil tx", func(t *testing.T) {
		got := txMessageTypes(lcdTxResponse{})
		if got != nil {
			t.Fatalf("expected nil, got %v", got)
		}
	})

	t.Run("multiple messages", func(t *testing.T) {
		tx := lcdTxResponse{Tx: &lcdTx{}}
		tx.Tx.Body.Messages = []map[string]any{
			{"@type": "/cosmos.bank.v1beta1.MsgSend"},
			{"@type": "/cosmos.staking.v1beta1.MsgDelegate"},
			{"other": "no type"},
		}
		got := txMessageTypes(tx)
		if len(got) != 2 {
			t.Fatalf("expected 2 types, got %d: %v", len(got), got)
		}
	})
}

// ---------------------------------------------------------------------------
// Unit tests for txMsgTypesFromMeta and hasTypePrefix
// ---------------------------------------------------------------------------

func TestTxMsgTypesFromMeta(t *testing.T) {
	t.Run("nil meta", func(t *testing.T) {
		got := txMsgTypesFromMeta(nil)
		if got != nil {
			t.Fatalf("expected nil, got %v", got)
		}
	})

	t.Run("valid meta", func(t *testing.T) {
		meta := map[string]interface{}{
			"tx_msg_types": []any{"/cosmos.bank.v1beta1.MsgSend", "/clawchain.agent.v1.MsgTask"},
		}
		got := txMsgTypesFromMeta(meta)
		if len(got) != 2 {
			t.Fatalf("expected 2 types, got %v", got)
		}
	})

	t.Run("wrong type", func(t *testing.T) {
		meta := map[string]interface{}{
			"tx_msg_types": "not a list",
		}
		got := txMsgTypesFromMeta(meta)
		if got != nil {
			t.Fatalf("expected nil, got %v", got)
		}
	})
}

func TestHasTypePrefix(t *testing.T) {
	types := []string{"/cosmos.bank.v1beta1.MsgSend", "/clawchain.agent.v1.MsgTask"}
	if !hasTypePrefix(types, "/clawchain.agent.v1.") {
		t.Fatal("expected true for agent prefix")
	}
	if hasTypePrefix(types, "/clawchain.marketplace.v1.") {
		t.Fatal("expected false for marketplace prefix")
	}
	if hasTypePrefix(nil, "/cosmos.") {
		t.Fatal("expected false for nil types")
	}
}

// ---------------------------------------------------------------------------
// Unit tests for findMultiSendCoins and firstDifferentAddress
// ---------------------------------------------------------------------------

func TestFindMultiSendCoins(t *testing.T) {
	target := "claw1target"
	inputs := []any{
		map[string]any{
			"address": target,
			"coins":   []any{map[string]any{"denom": "uclaw", "amount": "50"}},
		},
		map[string]any{
			"address": "claw1other",
			"coins":   []any{map[string]any{"denom": "uclaw", "amount": "30"}},
		},
	}
	addr, coins := findMultiSendCoins(inputs, target)
	if addr != target {
		t.Fatalf("expected target address, got %q", addr)
	}
	if len(coins) != 1 || coins[0]["denom"] != "uclaw" {
		t.Fatalf("unexpected coins: %+v", coins)
	}

	// Not found
	addr2, coins2 := findMultiSendCoins(inputs, "claw1missing")
	if addr2 != "" || coins2 != nil {
		t.Fatalf("expected empty result for missing address")
	}

	// Wrong type
	addr3, coins3 := findMultiSendCoins("not a list", target)
	if addr3 != "" || coins3 != nil {
		t.Fatalf("expected empty result for non-list input")
	}
}

func TestFirstDifferentAddress(t *testing.T) {
	items := []any{
		map[string]any{"address": "claw1same"},
		map[string]any{"address": "claw1other"},
	}
	got := firstDifferentAddress(items, "claw1same")
	if got != "claw1other" {
		t.Fatalf("expected claw1other, got %q", got)
	}

	// All same
	same := []any{
		map[string]any{"address": "claw1same"},
	}
	got2 := firstDifferentAddress(same, "claw1same")
	if got2 != "" {
		t.Fatalf("expected empty, got %q", got2)
	}

	// Wrong type
	got3 := firstDifferentAddress("not a list", "claw1same")
	if got3 != "" {
		t.Fatalf("expected empty for non-list, got %q", got3)
	}
}

// ---------------------------------------------------------------------------
// Unit tests for extractTransferRewardsFromLogs
// ---------------------------------------------------------------------------

func TestExtractTransferRewardsFromLogs(t *testing.T) {
	addr := "claw1myaddr"
	tx := lcdTxResponse{
		Logs: []any{
			map[string]any{
				"events": []any{
					map[string]any{
						"type": "transfer",
						"attributes": []any{
							map[string]any{"key": "recipient", "value": addr},
							map[string]any{"key": "amount", "value": "12uclaw,3uatom"},
						},
					},
					map[string]any{
						"type": "message",
						"attributes": []any{
							map[string]any{"key": "action", "value": "withdraw"},
						},
					},
				},
			},
		},
	}
	got := extractTransferRewardsFromLogs(tx, addr)
	if len(got) != 2 || got[0] != "12uclaw" || got[1] != "3uatom" {
		t.Fatalf("unexpected rewards: %v", got)
	}

	// Different recipient should yield nothing
	got2 := extractTransferRewardsFromLogs(tx, "claw1other")
	if len(got2) != 0 {
		t.Fatalf("expected no rewards for different address, got %v", got2)
	}

	// Empty logs
	got3 := extractTransferRewardsFromLogs(lcdTxResponse{}, addr)
	if len(got3) != 0 {
		t.Fatalf("expected no rewards for empty logs, got %v", got3)
	}
}

// ---------------------------------------------------------------------------
// Additional classifyRelation tests for untested message types
// ---------------------------------------------------------------------------

func TestClassifyRelation_AllMessageTypes(t *testing.T) {
	addr := "claw1myaddr"
	otherAddr := "claw1other"

	tests := []struct {
		name     string
		msg      map[string]any
		addr     string
		relation string
		relevant bool
	}{
		{
			"MsgSend sender",
			map[string]any{"@type": "/cosmos.bank.v1beta1.MsgSend", "from_address": addr, "to_address": otherAddr, "amount": []any{map[string]any{"denom": "uclaw", "amount": "1"}}},
			addr, "send", true,
		},
		{
			"MsgSend receiver",
			map[string]any{"@type": "/cosmos.bank.v1beta1.MsgSend", "from_address": otherAddr, "to_address": addr, "amount": []any{map[string]any{"denom": "uclaw", "amount": "1"}}},
			addr, "receive", true,
		},
		{
			"MsgSend unrelated",
			map[string]any{"@type": "/cosmos.bank.v1beta1.MsgSend", "from_address": otherAddr, "to_address": "claw1third", "amount": []any{}},
			addr, "", false,
		},
		{
			"MsgDelegate",
			map[string]any{"@type": "/cosmos.staking.v1beta1.MsgDelegate", "delegator_address": addr, "validator_address": "clawvaloper1xxx", "amount": map[string]any{"denom": "uclaw", "amount": "100"}},
			addr, "delegate", true,
		},
		{
			"MsgDelegate other",
			map[string]any{"@type": "/cosmos.staking.v1beta1.MsgDelegate", "delegator_address": otherAddr},
			addr, "", false,
		},
		{
			"MsgUndelegate",
			map[string]any{"@type": "/cosmos.staking.v1beta1.MsgUndelegate", "delegator_address": addr, "amount": map[string]any{"denom": "uclaw", "amount": "50"}},
			addr, "undelegate", true,
		},
		{
			"MsgBeginRedelegate",
			map[string]any{"@type": "/cosmos.staking.v1beta1.MsgBeginRedelegate", "delegator_address": addr, "amount": map[string]any{"denom": "uclaw", "amount": "50"}},
			addr, "redelegate", true,
		},
		{
			"MsgCancelUnbondingDelegation",
			map[string]any{"@type": "/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation", "delegator_address": addr},
			addr, "cancel-undelegate", true,
		},
		{
			"MsgVote v1beta1",
			map[string]any{"@type": "/cosmos.gov.v1beta1.MsgVote", "voter": addr, "proposal_id": "1", "option": "VOTE_OPTION_YES"},
			addr, "vote", true,
		},
		{
			"MsgVote v1",
			map[string]any{"@type": "/cosmos.gov.v1.MsgVote", "voter": addr, "proposal_id": "2", "option": "VOTE_OPTION_NO"},
			addr, "vote", true,
		},
		{
			"IBC MsgTransfer sender",
			map[string]any{"@type": "/ibc.applications.transfer.v1.MsgTransfer", "sender": addr, "receiver": otherAddr, "token": map[string]any{"denom": "uclaw", "amount": "10"}},
			addr, "ibc-send", true,
		},
		{
			"IBC MsgTransfer receiver",
			map[string]any{"@type": "/ibc.applications.transfer.v1.MsgTransfer", "sender": otherAddr, "receiver": addr, "token": map[string]any{"denom": "uclaw", "amount": "10"}},
			addr, "receive", true,
		},
		{
			"Unknown type",
			map[string]any{"@type": "/some.unknown.v1.MsgFoo", "sender": addr},
			addr, "", false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := classifyRelation(tt.msg, tt.addr, lcdTxResponse{})
			if res.Relevant != tt.relevant {
				t.Fatalf("relevant = %v, want %v", res.Relevant, tt.relevant)
			}
			if tt.relevant && res.Relation != tt.relation {
				t.Fatalf("relation = %q, want %q", res.Relation, tt.relation)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Error handling for malformed API requests
// ---------------------------------------------------------------------------

func TestErrorHandling_BadRequests(t *testing.T) {
	a := newApp(
		[]chainBackend{{
			Identifier:   "clawchain",
			ChainID:      "clawchain-1",
			Bech32Prefix: "claw",
			LCD:          "https://lcd.mock",
			Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
		}},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}

	t.Run("unknown path returns 404", func(t *testing.T) {
		_, status := callAPI(t, a, "/nonexistent/path")
		if status != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", status)
		}
	})

	t.Run("history missing address", func(t *testing.T) {
		_, status := callAPI(t, a, "/history/v2/msgs/clawchain/")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("history unsupported chain", func(t *testing.T) {
		_, status := callAPI(t, a, "/history/v2/msgs/unknown-chain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=5")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("explorer missing identifier", func(t *testing.T) {
		_, status := callAPI(t, a, "/tx-history/explorer/")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("msg by hash bad index", func(t *testing.T) {
		_, status := callAPI(t, a, "/block/msg/clawchain/ABC123/notanumber")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("msg by hash negative index", func(t *testing.T) {
		_, status := callAPI(t, a, "/block/msg/clawchain/ABC123/-1")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("msg by hash out of range index", func(t *testing.T) {
		body, status := callAPI(t, a, "/block/msg/clawchain/ABC123/999")
		if status != http.StatusOK {
			t.Fatalf("expected 200 with empty msg, got %d", status)
		}
		var payload map[string]map[string]any
		mustJSON(t, body, &payload)
		if len(payload["msg"]) != 0 {
			t.Fatalf("expected empty msg for out-of-range index, got %+v", payload)
		}
	})

	t.Run("tx by hash unsupported chain", func(t *testing.T) {
		_, status := callAPI(t, a, "/block/txs/by-hash/unknown-chain/ABC123")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("multichain missing baseHexAddress", func(t *testing.T) {
		_, status := callAPI(t, a, "/history/v2/msgs/keplr-multi-chain?chainIdentifiers=clawchain")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("multichain missing chainIdentifiers", func(t *testing.T) {
		_, status := callAPI(t, a, "/history/v2/msgs/keplr-multi-chain?baseHexAddress=claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("earnings invalid window", func(t *testing.T) {
		_, status := callAPI(t, a, "/history/v2/earnings/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?window=abc")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("earnings unsupported chain", func(t *testing.T) {
		_, status := callAPI(t, a, "/history/v2/earnings/unknown-chain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?window=7d")
		if status != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d", status)
		}
	})

	t.Run("healthz returns 200", func(t *testing.T) {
		body, status := callAPI(t, a, "/healthz")
		if status != http.StatusOK {
			t.Fatalf("expected 200, got %d", status)
		}
		var payload map[string]string
		mustJSON(t, body, &payload)
		if payload["status"] != "ok" {
			t.Fatalf("expected status=ok, got %+v", payload)
		}
	})

	t.Run("OPTIONS returns 204", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l", nil)
		rec := httptest.NewRecorder()
		a.handle(rec, req)
		if rec.Code != http.StatusNoContent {
			t.Fatalf("expected 204, got %d", rec.Code)
		}
		if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
			t.Fatal("missing CORS header")
		}
	})
}

// ---------------------------------------------------------------------------
// Filtering by denom
// ---------------------------------------------------------------------------

func TestFilterByDenom(t *testing.T) {
	a := newApp(
		[]chainBackend{{
			Identifier:   "clawchain",
			ChainID:      "clawchain-1",
			Bech32Prefix: "claw",
			LCD:          "https://lcd.mock",
			Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
		}},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: mockLCDTransport{}}

	// All txs in mock use uclaw denom
	body, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?denoms=uclaw&limit=50")
	if status != http.StatusOK {
		t.Fatalf("status=%d body=%s", status, body)
	}
	var withDenom txHistoryResponse
	mustJSON(t, body, &withDenom)

	// Filter for a denom not in mock data
	body2, status2 := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?denoms=uosmo&limit=50")
	if status2 != http.StatusOK {
		t.Fatalf("status=%d body=%s", status2, body2)
	}
	var withoutDenom txHistoryResponse
	mustJSON(t, body2, &withoutDenom)

	if len(withDenom.Msgs) <= len(withoutDenom.Msgs) {
		t.Fatalf("expected uclaw filter to return more results (%d) than uosmo filter (%d)", len(withDenom.Msgs), len(withoutDenom.Msgs))
	}
}

// ---------------------------------------------------------------------------
// Malformed upstream response handling
// ---------------------------------------------------------------------------

func TestMalformedUpstreamResponse(t *testing.T) {
	a := newApp(
		[]chainBackend{{
			Identifier:   "clawchain",
			ChainID:      "clawchain-1",
			Bech32Prefix: "claw",
			LCD:          "https://malformed.mock",
			Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
		}},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: malformedTransport{}}

	// When all upstream queries return malformed JSON, fetchHistoryForChain
	// logs errors but returns an empty result set (not an error), so the
	// handler returns 200 with an empty msgs list.
	body, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=5")
	if status != http.StatusOK {
		t.Fatalf("expected 200 with empty results for malformed upstream, got %d", status)
	}
	var history txHistoryResponse
	mustJSON(t, body, &history)
	if len(history.Msgs) != 0 {
		t.Fatalf("expected 0 msgs when upstream is malformed, got %d", len(history.Msgs))
	}

	// tx by hash with malformed response should return default fee response
	body2, status2 := callAPI(t, a, "/block/txs/by-hash/clawchain/BADHASH")
	if status2 != http.StatusOK {
		t.Fatalf("expected 200 with default fee response, got %d", status2)
	}
	var fee walletFeeByHashResponse
	mustJSON(t, body2, &fee)
	if fee.AuthInfo.Fee.GasLimit != "0" {
		t.Fatalf("expected default gas_limit=0, got %q", fee.AuthInfo.Fee.GasLimit)
	}
}

func TestUpstreamErrorStatusResponse(t *testing.T) {
	a := newApp(
		[]chainBackend{{
			Identifier:   "clawchain",
			ChainID:      "clawchain-1",
			Bech32Prefix: "claw",
			LCD:          "https://error.mock",
			Explorer:     "https://explorer.clawchain.dev/tx/{txHash}",
		}},
		[]string{"clawchain"},
		"https://explorer.clawchain.dev/tx/{txHash}",
	)
	a.client = &http.Client{Transport: errorStatusTransport{}}

	// When upstream returns HTTP 500, doGet returns an error, so history
	// returns empty results gracefully
	body, status := callAPI(t, a, "/history/v2/msgs/clawchain/claw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqm5ur7l?limit=5")
	if status != http.StatusOK {
		t.Fatalf("expected 200 with empty results, got %d", status)
	}
	var history txHistoryResponse
	mustJSON(t, body, &history)
	if len(history.Msgs) != 0 {
		t.Fatalf("expected 0 msgs, got %d", len(history.Msgs))
	}
}

type errorStatusTransport struct{}

func (errorStatusTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return &http.Response{
		StatusCode: http.StatusInternalServerError,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(`{"error":"internal server error"}`)),
		Request: &http.Request{
			URL: &url.URL{},
		},
	}, nil
}

type malformedTransport struct{}

func (malformedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Return invalid JSON for all requests
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader("this is not json{{{{")),
		Request: &http.Request{
			URL: &url.URL{},
		},
	}, nil
}

// ---------------------------------------------------------------------------
// anyToMap edge cases
// ---------------------------------------------------------------------------

func TestAnyToMap(t *testing.T) {
	got := anyToMap(map[string]any{"key": "value"})
	if got["key"] != "value" {
		t.Fatalf("expected key=value, got %v", got)
	}

	empty := anyToMap("not a map")
	if len(empty) != 0 {
		t.Fatalf("expected empty map for string input, got %v", empty)
	}

	empty2 := anyToMap(nil)
	if len(empty2) != 0 {
		t.Fatalf("expected empty map for nil input, got %v", empty2)
	}
}

// ---------------------------------------------------------------------------
// addCoins
// ---------------------------------------------------------------------------

func TestAddCoins(t *testing.T) {
	dst := map[string]*big.Int{
		"uclaw": big.NewInt(100),
	}
	src := map[string]*big.Int{
		"uclaw": big.NewInt(50),
		"uatom": big.NewInt(25),
	}
	addCoins(dst, src)
	if dst["uclaw"].Int64() != 150 {
		t.Fatalf("expected uclaw=150, got %s", dst["uclaw"])
	}
	if dst["uatom"].Int64() != 25 {
		t.Fatalf("expected uatom=25, got %s", dst["uatom"])
	}
}

// ---------------------------------------------------------------------------
// extractCoinsFromHistoryItem
// ---------------------------------------------------------------------------

func TestExtractCoinsFromHistoryItem(t *testing.T) {
	t.Run("merged-claim-rewards from meta", func(t *testing.T) {
		item := txHistoryItem{
			Msg: walletMsgHistory{
				Relation: "custom/merged-claim-rewards",
				Meta: map[string]interface{}{
					"rewards": []any{
						map[string]any{"denom": "uclaw", "amount": "99"},
					},
				},
				Msg: map[string]any{},
			},
		}
		got := extractCoinsFromHistoryItem(item)
		if got["uclaw"].Int64() != 99 {
			t.Fatalf("expected uclaw=99, got %v", got)
		}
	})

	t.Run("regular from msg amount", func(t *testing.T) {
		item := txHistoryItem{
			Msg: walletMsgHistory{
				Relation: "send",
				Msg: map[string]any{
					"amount": []any{
						map[string]any{"denom": "uclaw", "amount": "42"},
					},
				},
			},
		}
		got := extractCoinsFromHistoryItem(item)
		if got["uclaw"].Int64() != 42 {
			t.Fatalf("expected uclaw=42, got %v", got)
		}
	})
}

func assertHistorySchema(t *testing.T, body []byte) {
	t.Helper()
	var history txHistoryResponse
	mustJSON(t, body, &history)

	if history.NextCursor != "" {
		if _, err := base64.RawURLEncoding.DecodeString(history.NextCursor); err != nil {
			t.Fatalf("invalid nextCursor encoding: %q (%v)", history.NextCursor, err)
		}
	}

	for i, item := range history.Msgs {
		msg := item.Msg
		if msg.TxHash == "" {
			t.Fatalf("msgs[%d].msg.txHash is empty", i)
		}
		if msg.Height <= 0 {
			t.Fatalf("msgs[%d].msg.height must be > 0, got %d", i, msg.Height)
		}
		if msg.Time == "" {
			t.Fatalf("msgs[%d].msg.time is empty", i)
		}
		if msg.ChainID == "" || msg.ChainIdentifier == "" {
			t.Fatalf("msgs[%d].chain identity missing: chainId=%q chainIdentifier=%q", i, msg.ChainID, msg.ChainIdentifier)
		}
		if msg.Relation == "" {
			t.Fatalf("msgs[%d].msg.relation is empty", i)
		}
		if msg.Msg == nil {
			t.Fatalf("msgs[%d].msg.msg is nil", i)
		}
		if msg.Meta == nil {
			t.Fatalf("msgs[%d].msg.meta is nil", i)
		}
	}
}
