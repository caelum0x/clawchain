/**
 * Persistent message store for agent-to-agent messages.
 *
 * Messages are stored as NDJSON in `~/.clawd/messages/inbox.ndjson`.
 * Read tracking is stored in `~/.clawd/messages/read.json`.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type StoredMessage = {
  id: string;
  from: string;
  to: string;
  body: string;
  timestamp: number;
  signature: string;
};

const MAX_MESSAGES = 1000;

export class MessageStore {
  private readonly inboxPath: string;
  private readonly readPath: string;

  constructor(dataDir: string) {
    const messagesDir = join(dataDir, "messages");
    mkdirSync(messagesDir, { recursive: true });
    this.inboxPath = join(messagesDir, "inbox.ndjson");
    this.readPath = join(messagesDir, "read.json");
  }

  /**
   * Append a message to the inbox. Returns the message ID.
   */
  append(msg: Omit<StoredMessage, "id">): string {
    const id = randomUUID();
    const entry: StoredMessage = { id, ...msg };
    appendFileSync(this.inboxPath, JSON.stringify(entry) + "\n");

    // Trim to MAX_MESSAGES
    this.trimInbox();

    return id;
  }

  /**
   * Get all messages in the inbox.
   */
  getAll(): StoredMessage[] {
    return this.readInbox();
  }

  /**
   * Get unread messages.
   */
  getUnread(): StoredMessage[] {
    const readIds = this.getReadIds();
    return this.readInbox().filter((m) => !readIds.has(m.id));
  }

  /**
   * Mark messages as read by ID.
   */
  markRead(ids: string[]): void {
    const readIds = this.getReadIds();
    for (const id of ids) {
      readIds.add(id);
    }
    this.saveReadIds(readIds);
  }

  /**
   * Get all messages from/to a specific peer address.
   */
  getConversation(peerAddress: string): StoredMessage[] {
    return this.readInbox().filter(
      (m) => m.from === peerAddress || m.to === peerAddress,
    );
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private readInbox(): StoredMessage[] {
    if (!existsSync(this.inboxPath)) return [];

    const lines = readFileSync(this.inboxPath, "utf-8")
      .split("\n")
      .filter((line) => line.trim());

    const messages: StoredMessage[] = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line));
      } catch {
        // Skip corrupt lines
      }
    }
    return messages;
  }

  private trimInbox(): void {
    const messages = this.readInbox();
    if (messages.length > MAX_MESSAGES) {
      const trimmed = messages.slice(messages.length - MAX_MESSAGES);
      writeFileSync(
        this.inboxPath,
        trimmed.map((m) => JSON.stringify(m)).join("\n") + "\n",
      );
    }
  }

  private getReadIds(): Set<string> {
    if (!existsSync(this.readPath)) return new Set();
    try {
      const data = JSON.parse(readFileSync(this.readPath, "utf-8"));
      return new Set(Array.isArray(data) ? data : []);
    } catch {
      return new Set();
    }
  }

  private saveReadIds(ids: Set<string>): void {
    mkdirSync(dirname(this.readPath), { recursive: true });
    writeFileSync(this.readPath, JSON.stringify([...ids]));
  }
}
