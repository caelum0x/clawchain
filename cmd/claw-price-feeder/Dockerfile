# Builder
FROM golang:1.21.1-alpine AS builder

RUN apk add --no-cache \
    ca-certificates \
    build-base \
    linux-headers \
    git

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN make build

# Runner
FROM alpine
RUN apk add bash

WORKDIR /app

COPY --from=builder /app/build/price-feeder /bin/claw-price-feeder
COPY --from=builder /app/price-feeder.example.toml /app/price-feeder.toml
COPY --from=builder /app/clawchain-provider-config/ /app/clawchain-provider-config/

EXPOSE 7171

ENTRYPOINT ["claw-price-feeder", "price-feeder.toml"]
