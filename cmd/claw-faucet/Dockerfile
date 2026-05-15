FROM golang:1.24-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends make gcc git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /claw-faucet ./cmd/claw-faucet/

# -------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /claw-faucet /usr/local/bin/claw-faucet

EXPOSE 8888

ENTRYPOINT ["claw-faucet"]
