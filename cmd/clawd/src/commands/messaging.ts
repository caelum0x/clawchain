/**
 * `clawd messaging` subcommands -- P2P encrypted messaging on-chain.
 */

import { GasPrice, SigningStargateClient } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { loadClawdConfig } from "../lib/config.js";
import { loadMnemonic, mnemonicFileExists } from "../lib/mnemonic.js";
import { table, shortAddr, formatTime, truncate } from "../lib/format.js";

function deriveRestFromRpc(rpcUrl: string): string {
  try {
    const url = new URL(rpcUrl);
    return `${url.protocol}//${url.hostname}:1317`;
  } catch {
    return "http://localhost:1317";
  }
}

async function ensureSigner() {
  const cfg = loadClawdConfig();
  const rpcUrl = cfg.rpcUrl ?? "http://localhost:26657";
  const prefix = cfg.prefix ?? "claw";
  const denom = cfg.denom ?? "uclaw";
  const gasPrice = cfg.gasPrice ?? `0.025${denom}`;

  if (!mnemonicFileExists()) {
    throw new Error('No mnemonic found. Run "clawd init" first.');
  }
  const mnemonic = loadMnemonic();
  if (!mnemonic) {
    throw new Error("Failed to load mnemonic.");
  }

  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix });
  const [account] = await wallet.getAccounts();
  if (!account) {
    throw new Error("Failed to derive wallet account.");
  }

  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl, wallet, {
    gasPrice: GasPrice.fromString(gasPrice),
  });

  return { cfg, rpcUrl, prefix, denom, wallet, account, signingClient };
}

// ---------------------------------------------------------------------------
// clawd messaging send
// ---------------------------------------------------------------------------

export type MessagingSendOptions = {
  recipient: string;
  content: string;
  encrypt?: boolean;
};

export async function runMessagingSend(opts: MessagingSendOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Sending message to ${shortAddr(opts.recipient)}...`);

  const msg = {
    typeUrl: "/clawchain.messaging.v1.MsgSendMessage",
    value: {
      sender: account.address,
      recipient: opts.recipient,
      ciphertext: opts.content,
      nonce: opts.encrypt ? Date.now().toString(36) : "",
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Send failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Message sent to ${shortAddr(opts.recipient)}.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Send failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}

// ---------------------------------------------------------------------------
// clawd messaging inbox
// ---------------------------------------------------------------------------

export type MessagingInboxOptions = {
  json?: boolean;
  limit?: number;
};

export async function runMessagingInbox(opts: MessagingInboxOptions): Promise<void> {
  const { account, cfg, rpcUrl } = await ensureSigner();
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/messaging/v1/messages/${encodeURIComponent(account.address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log("No messages found.");
      } else {
        console.error(`Failed to query inbox (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { messages?: any[] };
    const allMessages: any[] = data.messages ?? [];

    // Filter to messages where the current account is the recipient (inbox)
    const inbox = allMessages.filter(
      (m: any) => (m.recipient ?? "") === account.address,
    );

    const limit = opts.limit ?? 50;
    const messages = inbox.slice(0, limit);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ messages }, null, 2) + "\n");
      return;
    }

    if (messages.length === 0) {
      console.log("Inbox is empty.");
      return;
    }

    const headers = ["#", "From", "Preview", "Time", "ACK'd"];
    const rows = messages.map((m: any, i: number) => [
      String(i + 1),
      shortAddr(m.sender ?? ""),
      truncate(m.ciphertext ?? "", 40),
      formatTime(parseInt(m.timestamp ?? "0")),
      (m.acknowledged ?? false) ? "yes" : "no",
    ]);

    console.log(`Inbox (${messages.length} message${messages.length !== 1 ? "s" : ""})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query inbox: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd messaging sent
// ---------------------------------------------------------------------------

export type MessagingSentOptions = {
  json?: boolean;
  limit?: number;
};

export async function runMessagingSent(opts: MessagingSentOptions): Promise<void> {
  const { account, cfg, rpcUrl } = await ensureSigner();
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/messaging/v1/messages/${encodeURIComponent(account.address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      if (res.status === 404) {
        console.log("No sent messages found.");
      } else {
        console.error(`Failed to query sent messages (HTTP ${res.status}).`);
      }
      return;
    }

    const data = (await res.json()) as { messages?: any[] };
    const allMessages: any[] = data.messages ?? [];

    // Filter to messages where the current account is the sender
    const sent = allMessages.filter(
      (m: any) => (m.sender ?? "") === account.address,
    );

    const limit = opts.limit ?? 50;
    const messages = sent.slice(0, limit);

    if (opts.json) {
      process.stdout.write(JSON.stringify({ messages }, null, 2) + "\n");
      return;
    }

    if (messages.length === 0) {
      console.log("No sent messages.");
      return;
    }

    const headers = ["#", "To", "Preview", "Time", "ACK'd"];
    const rows = messages.map((m: any, i: number) => [
      String(i + 1),
      shortAddr(m.recipient ?? ""),
      truncate(m.ciphertext ?? "", 40),
      formatTime(parseInt(m.timestamp ?? "0")),
      (m.acknowledged ?? false) ? "yes" : "no",
    ]);

    console.log(`Sent (${messages.length} message${messages.length !== 1 ? "s" : ""})\n`);
    console.log(table(headers, rows));
    console.log();
  } catch (err) {
    console.error(`Failed to query sent messages: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd messaging read <messageId>
// ---------------------------------------------------------------------------

export type MessagingReadOptions = {
  messageId: string;
  json?: boolean;
};

export async function runMessagingRead(opts: MessagingReadOptions): Promise<void> {
  const { account, cfg, rpcUrl } = await ensureSigner();
  const restUrl = (cfg.restUrl ?? deriveRestFromRpc(rpcUrl)).replace(/\/+$/, "");

  const url = `${restUrl}/clawchain/messaging/v1/messages/${encodeURIComponent(account.address)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) {
      console.error(`Failed to query messages (HTTP ${res.status}).`);
      process.exit(1);
    }

    const data = (await res.json()) as { messages?: any[] };
    const allMessages: any[] = data.messages ?? [];

    const message = allMessages.find(
      (m: any) => String(m.id ?? "") === opts.messageId,
    );

    if (!message) {
      console.error(`Message ${opts.messageId} not found.`);
      process.exit(1);
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(message, null, 2) + "\n");
      return;
    }

    console.log(`Message #${message.id}\n`);
    console.log(`  From:         ${message.sender ?? ""}`);
    console.log(`  To:           ${message.recipient ?? ""}`);
    console.log(`  Time:         ${formatTime(parseInt(message.timestamp ?? "0"))}`);
    console.log(`  Block:        ${message.block_height ?? message.blockHeight ?? ""}`);
    console.log(`  Acknowledged: ${(message.acknowledged ?? false) ? "yes" : "no"}`);
    console.log(`  Nonce:        ${message.nonce ?? ""}`);
    console.log();
    console.log(`Content:`);
    console.log(`  ${message.ciphertext ?? ""}`);
    console.log();
  } catch (err) {
    console.error(`Failed to read message: ${String(err)}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// clawd messaging ack <messageId>
// ---------------------------------------------------------------------------

export type MessagingAckOptions = {
  messageId: string;
};

export async function runMessagingAck(opts: MessagingAckOptions): Promise<void> {
  const { account, signingClient } = await ensureSigner();

  console.log(`Acknowledging message #${opts.messageId}...`);

  const msg = {
    typeUrl: "/clawchain.messaging.v1.MsgAckMessage",
    value: {
      creator: account.address,
      messageId: parseInt(opts.messageId, 10),
    },
  };

  try {
    const res = await signingClient.signAndBroadcast(account.address, [msg], "auto");
    if (res.code !== 0) {
      console.error(`Ack failed (code=${res.code}): ${res.rawLog}`);
      process.exit(1);
    }

    console.log(`Message #${opts.messageId} acknowledged.`);
    console.log(`  TxHash: ${res.transactionHash}`);
  } catch (err) {
    console.error(`Ack failed: ${String(err)}`);
    process.exit(1);
  } finally {
    signingClient.disconnect();
  }
}
