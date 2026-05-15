import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import useAddressBook, { isValidBech32 } from "../useAddressBook";

const STORAGE_KEY = "clawchain-address-book";

// A valid-looking claw bech32 address (correct length and charset)
const VALID_ADDR_1 = "claw1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu";
const VALID_ADDR_2 = "claw1grgelyng2v6v3t084qhcfkm8h05cc6kzg4j7ey";
const INVALID_ADDR = "cosmos1abc123";
const SHORT_ADDR = "claw1abc";

describe("isValidBech32", () => {
  it("accepts valid claw addresses", () => {
    expect(isValidBech32(VALID_ADDR_1)).toBe(true);
    expect(isValidBech32(VALID_ADDR_2)).toBe(true);
  });

  it("rejects addresses with wrong prefix", () => {
    expect(isValidBech32(INVALID_ADDR)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidBech32("")).toBe(false);
  });

  it("rejects too-short addresses", () => {
    expect(isValidBech32(SHORT_ADDR)).toBe(false);
  });

  it("rejects addresses with invalid characters", () => {
    expect(isValidBech32("claw1INVALID_CHARS_HERE_BBBBBBBBBBBBBBB")).toBe(false);
  });
});

describe("useAddressBook", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with empty contacts", () => {
    const { result } = renderHook(() => useAddressBook());
    expect(result.current.contacts).toEqual([]);
  });

  it("addContact adds to list and persists", () => {
    const { result } = renderHook(() => useAddressBook());

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.addContact({
        address: VALID_ADDR_1,
        name: "Alice",
        notes: "Test contact",
      });
    });

    expect(res!.ok).toBe(true);
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Alice");
    expect(result.current.contacts[0].address).toBe(VALID_ADDR_1);
    expect(result.current.contacts[0].notes).toBe("Test contact");
    expect(result.current.contacts[0].createdAt).toBeTruthy();

    // Verify persistence
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Alice");
  });

  it("removeContact removes by address", () => {
    const { result } = renderHook(() => useAddressBook());

    act(() => {
      result.current.addContact({ address: VALID_ADDR_1, name: "Alice" });
      result.current.addContact({ address: VALID_ADDR_2, name: "Bob" });
    });

    expect(result.current.contacts).toHaveLength(2);

    act(() => {
      result.current.removeContact(VALID_ADDR_1);
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Bob");

    // Verify persistence
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(stored).toHaveLength(1);
  });

  it("updateContact modifies properties", () => {
    const { result } = renderHook(() => useAddressBook());

    act(() => {
      result.current.addContact({ address: VALID_ADDR_1, name: "Alice" });
    });

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.updateContact(VALID_ADDR_1, {
        name: "Alice Updated",
        notes: "New notes",
      });
    });

    expect(res!.ok).toBe(true);
    expect(result.current.contacts[0].name).toBe("Alice Updated");
    expect(result.current.contacts[0].notes).toBe("New notes");
  });

  it("getContact returns correct contact", () => {
    const { result } = renderHook(() => useAddressBook());

    act(() => {
      result.current.addContact({ address: VALID_ADDR_1, name: "Alice" });
      result.current.addContact({ address: VALID_ADDR_2, name: "Bob" });
    });

    const contact = result.current.getContact(VALID_ADDR_2);
    expect(contact).toBeDefined();
    expect(contact!.name).toBe("Bob");

    const missing = result.current.getContact("claw1nonexistent000000000000000000000000");
    expect(missing).toBeUndefined();
  });

  it("searchContacts filters by name and address", () => {
    const { result } = renderHook(() => useAddressBook());

    act(() => {
      result.current.addContact({ address: VALID_ADDR_1, name: "Alice" });
      result.current.addContact({ address: VALID_ADDR_2, name: "Bob" });
    });

    // Search by name
    const byName = result.current.searchContacts("alice");
    expect(byName).toHaveLength(1);
    expect(byName[0].name).toBe("Alice");

    // Search by address fragment
    const byAddr = result.current.searchContacts("grgelyng");
    expect(byAddr).toHaveLength(1);
    expect(byAddr[0].name).toBe("Bob");

    // Search returning all
    const all = result.current.searchContacts("");
    expect(all).toHaveLength(2);
  });

  it("validates bech32 address before adding", () => {
    const { result } = renderHook(() => useAddressBook());

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.addContact({
        address: "invalid-address",
        name: "Bad Contact",
      });
    });

    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("Invalid bech32");
    expect(result.current.contacts).toHaveLength(0);
  });

  it("prevents duplicate addresses", () => {
    const { result } = renderHook(() => useAddressBook());

    act(() => {
      result.current.addContact({ address: VALID_ADDR_1, name: "Alice" });
    });

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.addContact({ address: VALID_ADDR_1, name: "Alice Duplicate" });
    });

    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("already exists");
    expect(result.current.contacts).toHaveLength(1);
  });

  it("enforces max 100 contacts limit", () => {
    // Pre-seed localStorage with 100 contacts
    const contacts = Array.from({ length: 100 }, (_, i) => {
      // Generate unique valid-looking addresses
      const suffix = String(i).padStart(6, "0").split("").map(c => "qpzry9x8gf"[parseInt(c)]).join("");
      return {
        address: `claw1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5${suffix}`,
        name: `Contact ${i}`,
        createdAt: new Date().toISOString(),
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));

    const { result } = renderHook(() => useAddressBook());
    expect(result.current.contacts).toHaveLength(100);

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.addContact({ address: VALID_ADDR_1, name: "One More" });
    });

    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("full");
    expect(result.current.contacts).toHaveLength(100);
  });

  it("requires name to be non-empty", () => {
    const { result } = renderHook(() => useAddressBook());

    let res: { ok: boolean; error?: string };
    act(() => {
      res = result.current.addContact({ address: VALID_ADDR_1, name: "   " });
    });

    expect(res!.ok).toBe(false);
    expect(res!.error).toContain("Name is required");
  });

  it("loads contacts from localStorage on init", () => {
    const preloaded = [
      { address: VALID_ADDR_1, name: "Preloaded", createdAt: new Date().toISOString() },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preloaded));

    const { result } = renderHook(() => useAddressBook());
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Preloaded");
  });
});
