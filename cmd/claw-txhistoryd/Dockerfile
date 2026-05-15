FROM golang:1.24-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends gcc ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /usr/local/bin/claw-txhistoryd ./cmd/claw-txhistoryd

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/local/bin/claw-txhistoryd /usr/local/bin/claw-txhistoryd
EXPOSE 17171
ENTRYPOINT ["claw-txhistoryd"]
