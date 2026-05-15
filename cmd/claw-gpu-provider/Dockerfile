FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /claw-gpu-provider ./cmd/claw-gpu-provider/

FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip docker.io ca-certificates && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /claw-gpu-provider /usr/local/bin/claw-gpu-provider
ENTRYPOINT ["claw-gpu-provider"]
