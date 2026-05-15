FROM golang:1.24-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    make gcc git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /usr/local/bin/clawchaind ./cmd/clawchaind
RUN go build -o /usr/local/bin/clawproof ./cmd/clawproof
RUN go build -o /usr/local/bin/claw-txhistoryd ./cmd/claw-txhistoryd

# -------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates bash curl jq sed && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/bin/clawchaind /usr/local/bin/clawchaind
COPY --from=builder /usr/local/bin/clawproof /usr/local/bin/clawproof
COPY --from=builder /usr/local/bin/claw-txhistoryd /usr/local/bin/claw-txhistoryd
# wasmvm shared library — required at runtime for CosmWasm execution
COPY --from=builder /go/pkg/mod/github.com/\!cosm\!wasm/wasmvm/v3@v3.0.3/internal/api/libwasmvm.aarch64.so /usr/local/lib/libwasmvm.aarch64.so
RUN ldconfig
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 26656 26657 1317 9090 26660

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["clawchaind", "start"]
