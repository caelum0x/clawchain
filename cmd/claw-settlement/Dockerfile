FROM golang:1.24-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends make gcc git ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /claw-settlement ./cmd/claw-settlement/

# -------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /claw-settlement /usr/local/bin/claw-settlement

# Persistent bbolt database volume.
VOLUME ["/data"]
ENV SETTLEMENT_DB=/data/settlement.db

EXPOSE 8099

ENTRYPOINT ["claw-settlement"]
