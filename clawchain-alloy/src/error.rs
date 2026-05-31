//! Error type for the ClawChain alloy-style provider.

use thiserror::Error;

/// Errors produced by the ClawChain provider and its pure parsing functions.
#[derive(Debug, Error)]
pub enum ClawError {
    /// The HTTP transport (reqwest) failed.
    #[error("http transport error: {0}")]
    Http(String),

    /// A response body could not be parsed as the expected JSON shape.
    #[error("parse error: {0}")]
    Parse(String),

    /// A field expected in the JSON response was missing or had the wrong type.
    #[error("missing or invalid field: {0}")]
    Field(String),
}

/// Convenience result alias.
pub type ClawResult<T> = Result<T, ClawError>;
