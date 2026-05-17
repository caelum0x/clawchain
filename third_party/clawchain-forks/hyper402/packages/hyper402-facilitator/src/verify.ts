/**
 * Hyper402 Verify - Payment verification logic
 * Based on x402 exact-evm scheme
 */

import { createPublicClient, http, getAddress, type Address, type Hex } from "viem";
import type { PaymentPayload, PaymentRequirements, VerifyResponse, ExactEvmPayload } from "./types.js";
import { HYPEREVM_TESTNET_CONFIG, USDC_CONFIG, authorizationTypes, usdcABI } from "./config.js";

const SCHEME = "exact";

/**
 * Verify a payment payload against payment requirements
 */
export async function verify(
  payload: PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  try {
    const exactEvmPayload = payload.payload as ExactEvmPayload;

    // 1. Verify scheme
    if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
      return {
        isValid: false,
        invalidReason: "unsupported_scheme",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // 2. Verify network
    if (payload.network !== "hyperevm-testnet") {
      return {
        isValid: false,
        invalidReason: "invalid_network",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // Create public client for HyperEVM testnet
    const client = createPublicClient({
      chain: {
        id: HYPEREVM_TESTNET_CONFIG.chainId,
        name: HYPEREVM_TESTNET_CONFIG.name,
        nativeCurrency: HYPEREVM_TESTNET_CONFIG.nativeCurrency,
        rpcUrls: {
          default: { http: [HYPEREVM_TESTNET_CONFIG.rpcUrl] },
          public: { http: [HYPEREVM_TESTNET_CONFIG.rpcUrl] },
        },
      },
      transport: http(HYPEREVM_TESTNET_CONFIG.rpcUrl),
    });

    // 3. Verify EIP-712 signature
    const permitTypedData = {
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization" as const,
      domain: {
        name: USDC_CONFIG.name,
        version: USDC_CONFIG.version,
        chainId: HYPEREVM_TESTNET_CONFIG.chainId,
        verifyingContract: USDC_CONFIG.address,
      },
      message: {
        from: exactEvmPayload.authorization.from as Address,
        to: exactEvmPayload.authorization.to as Address,
        value: BigInt(exactEvmPayload.authorization.value),
        validAfter: BigInt(exactEvmPayload.authorization.validAfter),
        validBefore: BigInt(exactEvmPayload.authorization.validBefore),
        nonce: exactEvmPayload.authorization.nonce as Hex,
      },
    };

    const recoveredAddress = await client.verifyTypedData({
      address: exactEvmPayload.authorization.from as Address,
      ...permitTypedData,
      signature: exactEvmPayload.signature as Hex,
    });

    if (!recoveredAddress) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_signature",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // 4. Verify recipient matches
    if (getAddress(exactEvmPayload.authorization.to) !== getAddress(paymentRequirements.payTo)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // 5. Verify deadline is not expired (with 6 second buffer)
    const now = Math.floor(Date.now() / 1000);
    if (BigInt(exactEvmPayload.authorization.validBefore) < BigInt(now + 6)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_authorization_valid_before",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // 6. Verify not yet valid
    if (BigInt(exactEvmPayload.authorization.validAfter) > BigInt(now)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_authorization_valid_after",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // 7. Check balance
    const balance = await client.readContract({
      address: USDC_CONFIG.address,
      abi: usdcABI,
      functionName: "balanceOf",
      args: [exactEvmPayload.authorization.from as Address],
    });

    if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
      return {
        isValid: false,
        invalidReason: "insufficient_funds",
        payer: exactEvmPayload.authorization.from,
      };
    }

    // 8. Verify amount
    if (BigInt(exactEvmPayload.authorization.value) < BigInt(paymentRequirements.maxAmountRequired)) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_authorization_value",
        payer: exactEvmPayload.authorization.from,
      };
    }

    return {
      isValid: true,
      invalidReason: undefined,
      payer: exactEvmPayload.authorization.from,
    };
  } catch (error) {
    console.error("Verification error:", error);
    return {
      isValid: false,
      invalidReason: "unexpected_verify_error",
      payer: (payload.payload as ExactEvmPayload).authorization.from,
    };
  }
}

