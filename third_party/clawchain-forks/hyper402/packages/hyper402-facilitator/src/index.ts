/**
 * Hyper402 Facilitator - Export for use with x402-express
 */

export const facilitator = {
  url: process.env.HYPER402_FACILITATOR_URL || "http://localhost:3002",
};

// Export types and functions for direct use
export * from "./types.js";
export * from "./config.js";
export { verify } from "./verify.js";
export { settle } from "./settle.js";

