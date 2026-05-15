FROM golang:1.24-alpine AS builder

RUN apk add --no-cache make gcc musl-dev git

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /claw-eventsd ./cmd/claw-eventsd/

# -------------------------------------------------------------------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates curl

COPY --from=builder /claw-eventsd /usr/local/bin/claw-eventsd

EXPOSE 8891

ENTRYPOINT ["claw-eventsd"]
