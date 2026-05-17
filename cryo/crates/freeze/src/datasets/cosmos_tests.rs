//! Unit tests for ClawChain / Cosmos SDK datasets.

#[cfg(test)]
mod tests {
    use crate::datasets::cosmos_agents::{
        agents_to_csv, AgentListResponse, CosmosAgentRow,
    };
    use crate::datasets::cosmos_blocks::{
        blocks_to_csv, CometBlockResponse, CosmosBlockRow,
    };
    use crate::datasets::cosmos_events::{
        events_to_csv, filter_events, CosmosEventFilter, CosmosEventRow,
    };
    use crate::datasets::cosmos_governance::{
        governance_to_csv, CosmosGovernanceRow, GovernanceProposalsResponse,
    };
    use crate::datasets::cosmos_marketplace::{
        marketplace_to_csv, CosmosMarketplaceRow, MarketplaceSkillsResponse,
    };
    use crate::datasets::cosmos_oracle::{
        oracle_to_csv, CosmosOracleRow, OraclePriceHistoryResponse,
        OraclePricesResponse,
    };
    use crate::datasets::cosmos_privacy::{
        privacy_to_csv, CosmosPrivacyRow, PrivacyTreeStatsResponse,
    };
    use crate::datasets::cosmos_txs::{
        txs_to_csv, CometTxSearchResponse, CosmosTxRow,
    };

    // -----------------------------------------------------------------------
    // cosmos_blocks tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_block_row_serialization_roundtrip() {
        let row = CosmosBlockRow {
            height: 42,
            time: "2026-03-09T12:00:00Z".to_string(),
            hash: "ABCDEF1234567890".to_string(),
            proposer_address: "DEADBEEF".to_string(),
            num_txs: 5,
            gas_used: 100_000,
            gas_wanted: 200_000,
            chain_id: "clawchain-1".to_string(),
            app_hash: "AABB".to_string(),
            last_commit_hash: "CCDD".to_string(),
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosBlockRow = serde_json::from_str(&json).unwrap();
        assert_eq!(row, deserialized);
    }

    #[test]
    fn test_blocks_to_csv_header_and_rows() {
        let rows = vec![
            CosmosBlockRow {
                height: 1,
                time: "2026-01-01T00:00:00Z".to_string(),
                hash: "AAA".to_string(),
                proposer_address: "P1".to_string(),
                num_txs: 0,
                gas_used: 0,
                gas_wanted: 0,
                chain_id: "clawchain-1".to_string(),
                app_hash: "AH1".to_string(),
                last_commit_hash: "".to_string(),
            },
            CosmosBlockRow {
                height: 2,
                time: "2026-01-01T00:00:01Z".to_string(),
                hash: "BBB".to_string(),
                proposer_address: "P2".to_string(),
                num_txs: 3,
                gas_used: 500,
                gas_wanted: 1000,
                chain_id: "clawchain-1".to_string(),
                app_hash: "AH2".to_string(),
                last_commit_hash: "AAA".to_string(),
            },
        ];

        let csv = blocks_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 3); // header + 2 data rows
        assert!(lines[0].starts_with("height,time,hash,"));
        assert!(lines[1].starts_with("1,"));
        assert!(lines[2].starts_with("2,"));
    }

    #[test]
    fn test_comet_block_response_deserialization() {
        let json = r#"{
            "result": {
                "block_id": {
                    "hash": "ABC123"
                },
                "block": {
                    "header": {
                        "chain_id": "clawchain-1",
                        "height": "100",
                        "time": "2026-03-09T12:00:00.000Z",
                        "proposer_address": "DEADBEEF",
                        "app_hash": "AABB",
                        "last_commit_hash": "CCDD"
                    },
                    "data": {
                        "txs": ["dHgx", "dHgy"]
                    },
                    "last_commit": null
                }
            }
        }"#;

        let resp: CometBlockResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.result.block.header.chain_id, "clawchain-1");
        assert_eq!(resp.result.block.header.height, "100");
        assert_eq!(resp.result.block_id.hash, "ABC123");
        assert_eq!(resp.result.block.data.txs.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn test_comet_block_response_no_txs() {
        let json = r#"{
            "result": {
                "block_id": { "hash": "EMPTY" },
                "block": {
                    "header": {
                        "chain_id": "clawchain-1",
                        "height": "1",
                        "time": "2026-01-01T00:00:00Z",
                        "proposer_address": "VAL1",
                        "app_hash": "",
                        "last_commit_hash": null
                    },
                    "data": { "txs": null },
                    "last_commit": null
                }
            }
        }"#;

        let resp: CometBlockResponse = serde_json::from_str(json).unwrap();
        assert!(resp.result.block.data.txs.is_none());
        assert!(resp.result.block.header.last_commit_hash.is_none());
    }

    // -----------------------------------------------------------------------
    // cosmos_events tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_event_filter_agent() {
        let filter = CosmosEventFilter::Agent;
        assert!(filter.matches("register_agent"));
        assert!(filter.matches("delegate_task"));
        assert!(filter.matches("complete_task"));
        assert!(!filter.matches("shield"));
        assert!(!filter.matches("transfer"));
    }

    #[test]
    fn test_event_filter_privacy() {
        let filter = CosmosEventFilter::Privacy;
        assert!(filter.matches("shield"));
        assert!(filter.matches("unshield"));
        assert!(filter.matches("private_transfer"));
        assert!(!filter.matches("register_agent"));
        assert!(!filter.matches("vote"));
    }

    #[test]
    fn test_event_filter_all_passes_everything() {
        let filter = CosmosEventFilter::All;
        assert!(filter.matches("anything"));
        assert!(filter.matches("register_agent"));
        assert!(filter.matches("shield"));
        assert!(filter.matches(""));
    }

    #[test]
    fn test_filter_events_function() {
        let rows = vec![
            CosmosEventRow {
                height: 10,
                tx_hash: "tx1".to_string(),
                event_type: "register_agent".to_string(),
                module: "agent".to_string(),
                attributes: "[]".to_string(),
            },
            CosmosEventRow {
                height: 10,
                tx_hash: "tx2".to_string(),
                event_type: "shield".to_string(),
                module: "privacy".to_string(),
                attributes: "[]".to_string(),
            },
            CosmosEventRow {
                height: 10,
                tx_hash: "tx3".to_string(),
                event_type: "transfer".to_string(),
                module: "bank".to_string(),
                attributes: "[]".to_string(),
            },
        ];

        let agent_events = filter_events(&rows, CosmosEventFilter::Agent);
        assert_eq!(agent_events.len(), 1);
        assert_eq!(agent_events[0].event_type, "register_agent");

        let privacy_events = filter_events(&rows, CosmosEventFilter::Privacy);
        assert_eq!(privacy_events.len(), 1);
        assert_eq!(privacy_events[0].event_type, "shield");

        let all_events = filter_events(&rows, CosmosEventFilter::All);
        assert_eq!(all_events.len(), 3);
    }

    #[test]
    fn test_event_attribute_json_encoding() {
        let row = CosmosEventRow {
            height: 5,
            tx_hash: "abc".to_string(),
            event_type: "register_agent".to_string(),
            module: "agent".to_string(),
            attributes: serde_json::to_string(&vec![
                ("agent_id", "agent-001"),
                ("owner", "claw1abc"),
            ])
            .unwrap(),
        };

        let parsed: Vec<(String, String)> =
            serde_json::from_str(&row.attributes).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].0, "agent_id");
        assert_eq!(parsed[0].1, "agent-001");
        assert_eq!(parsed[1].0, "owner");
        assert_eq!(parsed[1].1, "claw1abc");
    }

    #[test]
    fn test_events_to_csv() {
        let rows = vec![CosmosEventRow {
            height: 7,
            tx_hash: "hash1".to_string(),
            event_type: "shield".to_string(),
            module: "privacy".to_string(),
            attributes: r#"[["amount","100uclaw"]]"#.to_string(),
        }];

        let csv = events_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("height,tx_hash,event_type,"));
        assert!(lines[1].starts_with("7,hash1,shield,privacy,"));
    }

    // -----------------------------------------------------------------------
    // cosmos_txs tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_tx_row_field_parsing() {
        let row = CosmosTxRow {
            height: 50,
            tx_hash: "AABBCC".to_string(),
            msg_type: "/cosmos.bank.v1beta1.MsgSend".to_string(),
            sender: "claw1sender".to_string(),
            gas_used: 80_000,
            gas_wanted: 200_000,
            fee_amount: "1000".to_string(),
            fee_denom: "uclaw".to_string(),
            success: true,
            memo: "test memo".to_string(),
            raw_log: "[{\"events\":[]}]".to_string(),
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosTxRow = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.height, 50);
        assert_eq!(deserialized.tx_hash, "AABBCC");
        assert_eq!(deserialized.msg_type, "/cosmos.bank.v1beta1.MsgSend");
        assert!(deserialized.success);
        assert_eq!(deserialized.fee_denom, "uclaw");
    }

    #[test]
    fn test_comet_tx_search_response_deserialization() {
        let json = r#"{
            "result": {
                "txs": [
                    {
                        "hash": "TX_HASH_1",
                        "height": "42",
                        "tx_result": {
                            "code": 0,
                            "gas_used": "50000",
                            "gas_wanted": "200000",
                            "log": "[{\"events\":[]}]",
                            "events": [
                                {
                                    "type": "message",
                                    "attributes": [
                                        {"key": "action", "value": "/cosmos.bank.v1beta1.MsgSend"},
                                        {"key": "sender", "value": "claw1abc"}
                                    ]
                                },
                                {
                                    "type": "tx",
                                    "attributes": [
                                        {"key": "fee", "value": "5000uclaw"}
                                    ]
                                }
                            ]
                        },
                        "tx": "base64encodedtx"
                    }
                ],
                "total_count": "1"
            }
        }"#;

        let resp: CometTxSearchResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.result.txs.len(), 1);
        assert_eq!(resp.result.txs[0].hash, "TX_HASH_1");
        assert_eq!(resp.result.txs[0].height, "42");
        assert_eq!(resp.result.txs[0].tx_result.code, 0);
        assert_eq!(resp.result.txs[0].tx_result.gas_used, "50000");
        assert_eq!(resp.result.txs[0].tx_result.events.len(), 2);
        assert_eq!(resp.result.txs[0].tx_result.events[0].event_type, "message");
    }

    #[test]
    fn test_txs_to_csv() {
        let rows = vec![CosmosTxRow {
            height: 100,
            tx_hash: "HASH1".to_string(),
            msg_type: "/cosmos.bank.v1beta1.MsgSend".to_string(),
            sender: "claw1sender".to_string(),
            gas_used: 50_000,
            gas_wanted: 200_000,
            fee_amount: "5000".to_string(),
            fee_denom: "uclaw".to_string(),
            success: true,
            memo: "".to_string(),
            raw_log: "[]".to_string(),
        }];

        let csv = txs_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("height,tx_hash,msg_type,"));
        assert!(lines[1].starts_with("100,HASH1,"));
    }

    // -----------------------------------------------------------------------
    // Filter category coverage
    // -----------------------------------------------------------------------

    #[test]
    fn test_all_filter_categories_have_event_types() {
        let filters = [
            CosmosEventFilter::Agent,
            CosmosEventFilter::Privacy,
            CosmosEventFilter::Marketplace,
            CosmosEventFilter::Staking,
            CosmosEventFilter::Governance,
            CosmosEventFilter::Dex,
        ];
        for filter in &filters {
            assert!(
                !filter.event_types().is_empty(),
                "{} should have at least one event type",
                filter
            );
        }
        // All returns empty (matches everything)
        assert!(CosmosEventFilter::All.event_types().is_empty());
    }

    #[test]
    fn test_event_filter_display() {
        assert_eq!(format!("{}", CosmosEventFilter::All), "all");
        assert_eq!(format!("{}", CosmosEventFilter::Agent), "agent");
        assert_eq!(format!("{}", CosmosEventFilter::Privacy), "privacy");
        assert_eq!(format!("{}", CosmosEventFilter::Marketplace), "marketplace");
        assert_eq!(format!("{}", CosmosEventFilter::Staking), "staking");
        assert_eq!(format!("{}", CosmosEventFilter::Governance), "governance");
        assert_eq!(format!("{}", CosmosEventFilter::Dex), "dex");
    }

    // -----------------------------------------------------------------------
    // cosmos_agents tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_agent_row_serialization_roundtrip() {
        let row = CosmosAgentRow {
            address: "claw1agent123".to_string(),
            name: "test-agent".to_string(),
            status: "ACTIVE".to_string(),
            endpoint: "https://agent.example.com".to_string(),
            capabilities: "inference,code-review".to_string(),
            reputation_score: 950,
            tasks_completed: 42,
            deposit_amount: "1000000uclaw".to_string(),
            last_heartbeat: "2026-03-15T10:30:00Z".to_string(),
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosAgentRow = serde_json::from_str(&json).unwrap();
        assert_eq!(row, deserialized);
    }

    #[test]
    fn test_agent_list_response_deserialization() {
        let json = r#"{
            "agents": [
                {
                    "address": "claw1abc",
                    "name": "alpha-agent",
                    "status": "ACTIVE",
                    "endpoint": "https://alpha.example.com",
                    "capabilities": ["inference", "data-analysis"],
                    "reputation_score": "850",
                    "tasks_completed": "15",
                    "deposit": {
                        "amount": "500000",
                        "denom": "uclaw"
                    },
                    "last_heartbeat": "2026-03-15T12:00:00Z"
                },
                {
                    "address": "claw1def",
                    "name": "beta-agent",
                    "status": "INACTIVE",
                    "endpoint": "",
                    "capabilities": [],
                    "reputation_score": "0",
                    "tasks_completed": "0",
                    "deposit": null,
                    "last_heartbeat": ""
                }
            ],
            "pagination": {
                "next_key": null,
                "total": "2"
            }
        }"#;

        let resp: AgentListResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.agents.len(), 2);
        assert_eq!(resp.agents[0].address, "claw1abc");
        assert_eq!(resp.agents[0].name, "alpha-agent");
        assert_eq!(resp.agents[0].capabilities.len(), 2);
        assert_eq!(resp.agents[1].status, "INACTIVE");
        assert!(resp.agents[1].deposit.is_none());
    }

    #[test]
    fn test_agents_to_csv_header_and_rows() {
        let rows = vec![CosmosAgentRow {
            address: "claw1abc".to_string(),
            name: "test-agent".to_string(),
            status: "ACTIVE".to_string(),
            endpoint: "https://example.com".to_string(),
            capabilities: "inference".to_string(),
            reputation_score: 100,
            tasks_completed: 5,
            deposit_amount: "1000uclaw".to_string(),
            last_heartbeat: "2026-03-15T12:00:00Z".to_string(),
        }];

        let csv = agents_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2); // header + 1 data row
        assert!(lines[0].starts_with("address,name,status,"));
        assert!(lines[1].starts_with("claw1abc,"));
    }

    #[test]
    fn test_agent_empty_deposit_defaults() {
        let json = r#"{
            "agents": [
                {
                    "address": "claw1xyz",
                    "name": "no-deposit",
                    "status": "ACTIVE",
                    "endpoint": "",
                    "capabilities": [],
                    "reputation_score": "",
                    "tasks_completed": "",
                    "deposit": null,
                    "last_heartbeat": ""
                }
            ],
            "pagination": null
        }"#;

        let resp: AgentListResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.agents.len(), 1);
        assert_eq!(resp.agents[0].reputation_score, "");
        assert!(resp.agents[0].deposit.is_none());
    }

    // -----------------------------------------------------------------------
    // cosmos_oracle tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_oracle_row_serialization_roundtrip() {
        let row = CosmosOracleRow {
            denom_pair: "CLAW/USD".to_string(),
            price: "0.0125".to_string(),
            block_height: 1000,
            timestamp: "2026-03-15T12:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosOracleRow = serde_json::from_str(&json).unwrap();
        assert_eq!(row, deserialized);
    }

    #[test]
    fn test_oracle_prices_response_deserialization() {
        let json = r#"{
            "prices": [
                {
                    "denom_pair": "CLAW/USD",
                    "price": "0.0125",
                    "block_height": "500",
                    "timestamp": "2026-03-15T10:00:00Z"
                },
                {
                    "denom_pair": "ATOM/CLAW",
                    "price": "800.50",
                    "block_height": "500",
                    "timestamp": "2026-03-15T10:00:00Z"
                }
            ]
        }"#;

        let resp: OraclePricesResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.prices.len(), 2);
        assert_eq!(resp.prices[0].denom_pair, "CLAW/USD");
        assert_eq!(resp.prices[0].price, "0.0125");
        assert_eq!(resp.prices[1].denom_pair, "ATOM/CLAW");
    }

    #[test]
    fn test_oracle_price_history_response_deserialization() {
        let json = r#"{
            "history": [
                {
                    "denom_pair": "CLAW/USD",
                    "price": "0.0100",
                    "block_height": "100",
                    "timestamp": "2026-03-10T12:00:00Z"
                },
                {
                    "denom_pair": "CLAW/USD",
                    "price": "0.0125",
                    "block_height": "500",
                    "timestamp": "2026-03-15T12:00:00Z"
                }
            ],
            "pagination": {
                "next_key": null,
                "total": "2"
            }
        }"#;

        let resp: OraclePriceHistoryResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.history.len(), 2);
        assert_eq!(resp.history[0].block_height, "100");
        assert_eq!(resp.history[1].price, "0.0125");
    }

    #[test]
    fn test_oracle_to_csv() {
        let rows = vec![CosmosOracleRow {
            denom_pair: "CLAW/USD".to_string(),
            price: "0.05".to_string(),
            block_height: 200,
            timestamp: "2026-03-15T12:00:00Z".to_string(),
        }];

        let csv = oracle_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("denom_pair,price,"));
        assert!(lines[1].starts_with("CLAW/USD,0.05,200,"));
    }

    #[test]
    fn test_oracle_empty_prices_response() {
        let json = r#"{ "prices": [] }"#;
        let resp: OraclePricesResponse = serde_json::from_str(json).unwrap();
        assert!(resp.prices.is_empty());
    }

    // -----------------------------------------------------------------------
    // cosmos_privacy tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_privacy_row_serialization_roundtrip() {
        let row = CosmosPrivacyRow {
            commitment_count: 1500,
            nullifier_count: 300,
            merkle_root: "aabbccdd".to_string(),
            tree_depth: 20,
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosPrivacyRow = serde_json::from_str(&json).unwrap();
        assert_eq!(row, deserialized);
    }

    #[test]
    fn test_privacy_tree_stats_response_deserialization() {
        let json = r#"{
            "stats": {
                "commitment_count": "1500",
                "nullifier_count": "300",
                "merkle_root": "aabbccddee",
                "tree_depth": "20"
            }
        }"#;

        let resp: PrivacyTreeStatsResponse = serde_json::from_str(json).unwrap();
        let stats = resp.stats.unwrap();
        assert_eq!(stats.commitment_count, "1500");
        assert_eq!(stats.nullifier_count, "300");
        assert_eq!(stats.merkle_root, "aabbccddee");
        assert_eq!(stats.tree_depth, "20");
    }

    #[test]
    fn test_privacy_tree_stats_null_stats() {
        let json = r#"{ "stats": null }"#;
        let resp: PrivacyTreeStatsResponse = serde_json::from_str(json).unwrap();
        assert!(resp.stats.is_none());
    }

    #[test]
    fn test_privacy_to_csv() {
        let rows = vec![CosmosPrivacyRow {
            commitment_count: 100,
            nullifier_count: 25,
            merkle_root: "abcdef".to_string(),
            tree_depth: 20,
        }];

        let csv = privacy_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("commitment_count,nullifier_count,"));
        assert!(lines[1].starts_with("100,25,abcdef,20"));
    }

    #[test]
    fn test_privacy_empty_fields_default() {
        let json = r#"{
            "stats": {
                "commitment_count": "",
                "nullifier_count": "",
                "merkle_root": "",
                "tree_depth": ""
            }
        }"#;

        let resp: PrivacyTreeStatsResponse = serde_json::from_str(json).unwrap();
        let stats = resp.stats.unwrap();
        assert_eq!(stats.commitment_count, "");
        assert_eq!(stats.tree_depth, "");
    }

    // -----------------------------------------------------------------------
    // cosmos_marketplace tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_marketplace_row_serialization_roundtrip() {
        let row = CosmosMarketplaceRow {
            id: 1,
            name: "image-classifier".to_string(),
            owner: "claw1owner".to_string(),
            price: "5000uclaw".to_string(),
            category: "ai".to_string(),
            purchase_count: 42,
            rating: "4.5".to_string(),
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosMarketplaceRow = serde_json::from_str(&json).unwrap();
        assert_eq!(row, deserialized);
    }

    #[test]
    fn test_marketplace_skills_response_deserialization() {
        let json = r#"{
            "skills": [
                {
                    "id": "1",
                    "name": "image-classifier",
                    "owner": "claw1abc",
                    "price": {
                        "amount": "5000",
                        "denom": "uclaw"
                    },
                    "category": "ai",
                    "purchase_count": "42",
                    "rating": "4.5"
                },
                {
                    "id": "2",
                    "name": "code-reviewer",
                    "owner": "claw1def",
                    "price": {
                        "amount": "10000",
                        "denom": "uclaw"
                    },
                    "category": "dev",
                    "purchase_count": "100",
                    "rating": "4.8"
                }
            ],
            "pagination": {
                "next_key": null,
                "total": "2"
            }
        }"#;

        let resp: MarketplaceSkillsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.skills.len(), 2);
        assert_eq!(resp.skills[0].name, "image-classifier");
        assert_eq!(resp.skills[0].price.as_ref().unwrap().amount, "5000");
        assert_eq!(resp.skills[1].category, "dev");
    }

    #[test]
    fn test_marketplace_to_csv() {
        let rows = vec![CosmosMarketplaceRow {
            id: 1,
            name: "test-skill".to_string(),
            owner: "claw1abc".to_string(),
            price: "1000uclaw".to_string(),
            category: "ai".to_string(),
            purchase_count: 10,
            rating: "4.0".to_string(),
        }];

        let csv = marketplace_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("id,name,owner,"));
        assert!(lines[1].starts_with("1,"));
    }

    #[test]
    fn test_marketplace_null_price_defaults() {
        let json = r#"{
            "skills": [
                {
                    "id": "3",
                    "name": "free-skill",
                    "owner": "claw1xyz",
                    "price": null,
                    "category": "misc",
                    "purchase_count": "0",
                    "rating": "0.0"
                }
            ],
            "pagination": null
        }"#;

        let resp: MarketplaceSkillsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.skills.len(), 1);
        assert!(resp.skills[0].price.is_none());
    }

    // -----------------------------------------------------------------------
    // cosmos_governance tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_cosmos_governance_row_serialization_roundtrip() {
        let row = CosmosGovernanceRow {
            id: 1,
            title: "Increase agent deposit minimum".to_string(),
            status: "PROPOSAL_STATUS_PASSED".to_string(),
            proposer: "claw1proposer".to_string(),
            yes_votes: "1000000".to_string(),
            no_votes: "50000".to_string(),
            veto_votes: "10000".to_string(),
        };

        let json = serde_json::to_string(&row).unwrap();
        let deserialized: CosmosGovernanceRow = serde_json::from_str(&json).unwrap();
        assert_eq!(row, deserialized);
    }

    #[test]
    fn test_governance_proposals_response_deserialization() {
        let json = r#"{
            "proposals": [
                {
                    "id": "1",
                    "title": "Increase agent deposit minimum",
                    "status": "PROPOSAL_STATUS_PASSED",
                    "proposer": "claw1abc",
                    "final_tally_result": {
                        "yes_count": "1000000",
                        "no_count": "50000",
                        "no_with_veto_count": "10000",
                        "abstain_count": "25000"
                    }
                },
                {
                    "id": "2",
                    "title": "Update privacy pool depth",
                    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
                    "proposer": "claw1def",
                    "final_tally_result": null
                }
            ],
            "pagination": {
                "next_key": null,
                "total": "2"
            }
        }"#;

        let resp: GovernanceProposalsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.proposals.len(), 2);
        assert_eq!(resp.proposals[0].title, "Increase agent deposit minimum");
        assert_eq!(resp.proposals[0].status, "PROPOSAL_STATUS_PASSED");
        let tally = resp.proposals[0].final_tally_result.as_ref().unwrap();
        assert_eq!(tally.yes_count, "1000000");
        assert_eq!(tally.no_with_veto_count, "10000");
        assert!(resp.proposals[1].final_tally_result.is_none());
    }

    #[test]
    fn test_governance_to_csv() {
        let rows = vec![CosmosGovernanceRow {
            id: 1,
            title: "Test Proposal".to_string(),
            status: "PROPOSAL_STATUS_PASSED".to_string(),
            proposer: "claw1abc".to_string(),
            yes_votes: "100".to_string(),
            no_votes: "10".to_string(),
            veto_votes: "5".to_string(),
        }];

        let csv = governance_to_csv(&rows);
        let lines: Vec<&str> = csv.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("id,title,status,"));
        assert!(lines[1].starts_with("1,"));
    }

    #[test]
    fn test_governance_null_tally_defaults_to_zero() {
        let json = r#"{
            "proposals": [
                {
                    "id": "5",
                    "title": "Active proposal",
                    "status": "PROPOSAL_STATUS_VOTING_PERIOD",
                    "proposer": "claw1xyz",
                    "final_tally_result": null
                }
            ],
            "pagination": null
        }"#;

        let resp: GovernanceProposalsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.proposals.len(), 1);
        assert!(resp.proposals[0].final_tally_result.is_none());
    }

    #[test]
    fn test_governance_empty_list() {
        let json = r#"{
            "proposals": [],
            "pagination": {
                "next_key": null,
                "total": "0"
            }
        }"#;

        let resp: GovernanceProposalsResponse = serde_json::from_str(json).unwrap();
        assert!(resp.proposals.is_empty());
    }
}
