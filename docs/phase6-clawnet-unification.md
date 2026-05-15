# Phase 6: Clawnet Protocol Unification

**Status:** Complete
**Date:** 2026-02-24

---

## Summary

Phase 6 completes the Clawnet protocol unification by enforcing explicit method scopes, introducing device slugs for human-friendly device identification, routing approval events exclusively to operator-role clients, and adding mandatory device-auth enforcement for remote connections.

---

## What Was Implemented

### 6.1 — Scope Enforcement + Device Slugs

- **Method scope categorization**: All 93 `BASE_METHODS` are now explicitly categorized in scope sets (`READ_METHODS`, `WRITE_METHODS`, `APPROVAL_METHODS`, `PAIRING_METHODS`, `NODE_ROLE_METHODS`, or admin catch-all). Previously uncategorized methods (`system-event`, `agents.files.list`, `agents.files.get`, `config.schema`) are now properly scoped.

- **Device slugs**: A crustacean-themed deterministic slug generator (`openclaw/src/infra/device-slug.ts`) assigns human-readable names like `scarlet-claw` or `jade-lobster` to paired devices. Slugs are generated on device approval and included in pairing list responses.

### 6.2 — Central Approval Routing

- **Operator-only broadcast**: A new `broadcastToOperators()` function skips node-role clients when sending events. Exec approval events (`exec.approval.requested`, `exec.approval.resolved`) now use this function, preventing nodes from receiving approval notifications they cannot act on.

### 6.3 — Device-Auth Enforcement for Remote

- **Config flag**: `gateway.auth.requireDeviceAuth` (boolean, default `false`) mandates device identity for all non-local, non-webchat remote connections when enabled.

- **Token lifecycle events**: `device.token.revoked` and `device.token.rotated` events are broadcast on token lifecycle operations, enabling connected clients to react to credential changes.

### 6.4 — Polish

- Audit logging for token rotate/revoke operations (structured `logGateway.info` calls).
- PRD updated with Phase 3/4 marked complete and Phase 6 entry added.

---

## Architecture

```text
                    Remote Client
                         |
                    [WS Connect]
                         |
                  +------+-------+
                  |  Auth Layer  |
                  | (token/pass/ |
                  | device-auth) |
                  +------+-------+
                         |
              requireDeviceAuth?
              (reject if remote +
               no device identity)
                         |
                  +------+-------+
                  | Method Scope |
                  | Enforcement  |
                  | (READ/WRITE/ |
                  | ADMIN/PAIR)  |
                  +------+-------+
                         |
           +-------------+-------------+
           |                           |
    broadcastToOperators        broadcast (all)
    (approval events)           (general events)
           |                           |
      [Operators]              [Operators + Nodes]
```

---

## Configuration Reference

### `gateway.auth.requireDeviceAuth`

| Property | Value |
|----------|-------|
| Type | `boolean` |
| Default | `false` |
| Location | `config.yaml` > `gateway` > `auth` > `requireDeviceAuth` |

When set to `true`, all remote (non-loopback) connections must present a valid device identity. Webchat and local connections are exempt.

```yaml
gateway:
  auth:
    mode: token
    token: "your-token"
    requireDeviceAuth: true
```

---

## Files Changed

| File | Change |
|------|--------|
| `openclaw/src/gateway/server-methods.ts` | Added methods to READ_METHODS and WRITE_METHODS |
| `openclaw/src/infra/device-slug.ts` | New: crustacean-themed slug generator |
| `openclaw/src/infra/device-pairing.ts` | Added `slug` field, generate on approval |
| `openclaw/src/gateway/protocol/schema/devices.ts` | Added `slug` to resolved event schema |
| `openclaw/src/gateway/server-broadcast.ts` | Added `broadcastToOperators` function |
| `openclaw/src/gateway/server-methods/types.ts` | Added `broadcastToOperators` to context type |
| `openclaw/src/gateway/server.impl.ts` | Wired `broadcastToOperators` into context |
| `openclaw/src/gateway/server-runtime-state.ts` | Destructured `broadcastToOperators` from broadcaster |
| `openclaw/src/gateway/server-methods/exec-approval.ts` | Switched approval broadcasts to operator-only |
| `openclaw/src/config/types.gateway.ts` | Added `requireDeviceAuth` to auth config |
| `openclaw/src/gateway/server/ws-connection/message-handler.ts` | Enforce device-auth for remote connections |
| `openclaw/src/gateway/server-methods/devices.ts` | Token lifecycle event broadcasts + audit logging |
| `openclaw/src/gateway/server-methods-list.ts` | Added token lifecycle events to GATEWAY_EVENTS |
| `prd.md` | Updated phases 3/4/6 status |
