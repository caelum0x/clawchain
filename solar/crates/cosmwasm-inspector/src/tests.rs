use crate::*;

#[test]
fn test_checksum_deterministic() {
    let data = b"test wasm bytes";
    let c1 = checksum(data);
    let c2 = checksum(data);
    assert_eq!(c1, c2);
    assert_eq!(c1.len(), 64); // SHA-256 hex = 64 chars
}

#[test]
fn test_checksum_different_inputs() {
    let c1 = checksum(b"input1");
    let c2 = checksum(b"input2");
    assert_ne!(c1, c2);
}

#[test]
fn test_format_size_bytes() {
    assert_eq!(format_size(512), "512 B");
}

#[test]
fn test_format_size_kb() {
    assert_eq!(format_size(2048), "2.0 KB");
}

#[test]
fn test_format_size_mb() {
    assert_eq!(format_size(1_500_000), "1.4 MB");
}

#[test]
fn test_analyze_wasm_with_exports() {
    // Create fake WASM bytes that contain export strings
    let wasm = b"fake wasm header instantiate execute query ".to_vec();
    let metadata = analyze_wasm(&wasm);
    assert!(metadata.has_instantiate);
    assert!(metadata.has_execute);
    assert!(metadata.has_query);
    assert!(!metadata.has_migrate);
}

#[test]
fn test_analyze_wasm_missing_instantiate() {
    let wasm = b"fake wasm with only execute query";
    let metadata = analyze_wasm(wasm);
    assert!(!metadata.has_instantiate);
    assert!(metadata.warnings.iter().any(|w| w.contains("instantiate")));
}

#[test]
fn test_analyze_wasm_large_warning() {
    let wasm = vec![0u8; 900_000]; // 900KB
    let metadata = analyze_wasm(&wasm);
    assert!(metadata.warnings.iter().any(|w| w.contains("large")));
}

#[test]
fn test_verify_deployment_match() {
    assert!(verify_deployment("abc123", "ABC123"));
    assert!(verify_deployment("abc123", "abc123"));
}

#[test]
fn test_verify_deployment_mismatch() {
    assert!(!verify_deployment("abc123", "def456"));
}

#[test]
fn test_parse_interface() {
    let schema = r#"{
        "instantiate": {"type": "object", "properties": {"owner": {"type": "string"}}},
        "execute": {"oneOf": [{"type": "object"}]},
        "query": {"oneOf": [{"type": "object"}]}
    }"#;
    let iface = parse_interface(schema).unwrap();
    assert!(iface.instantiate_msg.is_some());
    assert!(iface.execute_msg.is_some());
    assert!(iface.query_msg.is_some());
    assert!(iface.migrate_msg.is_none());
}

#[test]
fn test_deployment_summary_format() {
    let metadata = ContractMetadata {
        checksum: "abc123".to_string(),
        size_bytes: 250_000,
        size_formatted: "244.1 KB".to_string(),
        exports: vec![
            "instantiate".to_string(),
            "execute".to_string(),
            "query".to_string(),
        ],
        has_instantiate: true,
        has_execute: true,
        has_query: true,
        has_migrate: false,
        has_sudo: false,
        has_reply: false,
        has_ibc_channel_open: false,
        has_ibc_channel_connect: false,
        has_ibc_channel_close: false,
        has_ibc_packet_receive: false,
        has_ibc_packet_ack: false,
        has_ibc_packet_timeout: false,
        memory_pages: 0,
        is_optimized: true,
        warnings: vec![],
    };
    let summary = deployment_summary(&metadata);
    assert!(summary.contains("abc123"));
    assert!(summary.contains("244.1 KB"));
    assert!(summary.contains("Yes")); // optimized
}

#[test]
fn test_deployment_summary_with_ibc() {
    let metadata = ContractMetadata {
        checksum: "def456".to_string(),
        size_bytes: 100_000,
        size_formatted: "97.7 KB".to_string(),
        exports: vec![
            "instantiate".to_string(),
            "execute".to_string(),
            "query".to_string(),
            "ibc_channel_open".to_string(),
            "ibc_packet_receive".to_string(),
        ],
        has_instantiate: true,
        has_execute: true,
        has_query: true,
        has_migrate: false,
        has_sudo: false,
        has_reply: false,
        has_ibc_channel_open: true,
        has_ibc_channel_connect: false,
        has_ibc_channel_close: false,
        has_ibc_packet_receive: true,
        has_ibc_packet_ack: false,
        has_ibc_packet_timeout: false,
        memory_pages: 0,
        is_optimized: false,
        warnings: vec!["Test warning".to_string()],
    };
    let summary = deployment_summary(&metadata);
    assert!(summary.contains("IBC Exports"));
    assert!(summary.contains("ibc_channel_open"));
    assert!(summary.contains("ibc_packet_receive"));
    assert!(summary.contains("Test warning"));
}
