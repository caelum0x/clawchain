import { Type } from "@sinclair/typebox";

export const HeartbeatIndicatorTypeSchema = Type.Union([
  Type.Literal("ok"),
  Type.Literal("alert"),
  Type.Literal("error"),
]);

export const HeartbeatStatusSchema = Type.Union([
  Type.Literal("sent"),
  Type.Literal("ok-empty"),
  Type.Literal("ok-token"),
  Type.Literal("skipped"),
  Type.Literal("failed"),
]);

export const HeartbeatEventPayloadSchema = Type.Object(
  {
    ts: Type.Integer({ minimum: 0 }),
    status: HeartbeatStatusSchema,
    to: Type.Optional(Type.String()),
    accountId: Type.Optional(Type.String()),
    preview: Type.Optional(Type.String()),
    durationMs: Type.Optional(Type.Number({ minimum: 0 })),
    hasMedia: Type.Optional(Type.Boolean()),
    reason: Type.Optional(Type.String()),
    channel: Type.Optional(Type.String()),
    silent: Type.Optional(Type.Boolean()),
    indicatorType: Type.Optional(HeartbeatIndicatorTypeSchema),
  },
  { additionalProperties: false },
);

// Type aliases are exported from ./types.ts to avoid duplicate exports
// through the barrel file (schema.ts).
