import { useState, useCallback } from "react";

const STORAGE_KEY = "clawchain-address-book";
const MAX_CONTACTS = 100;
const BECH32_PREFIX = "claw";

export interface Contact {
  address: string;
  name: string;
  notes?: string;
  createdAt: string;
}

export interface AddressBookContext {
  contacts: Contact[];
  addContact: (contact: Omit<Contact, "createdAt">) => { ok: boolean; error?: string };
  removeContact: (address: string) => void;
  updateContact: (address: string, updates: Partial<Omit<Contact, "createdAt">>) => { ok: boolean; error?: string };
  getContact: (address: string) => Contact | undefined;
  searchContacts: (query: string) => Contact[];
}

/** Basic bech32 validation: must start with prefix + "1" and be a reasonable length. */
export function isValidBech32(address: string, prefix = BECH32_PREFIX): boolean {
  if (!address) return false;
  // Must start with the prefix followed by "1" separator
  if (!address.startsWith(`${prefix}1`)) return false;
  // Bech32 data part should only contain valid characters
  const dataPart = address.slice(prefix.length + 1);
  if (dataPart.length < 6) return false;
  // Bech32 charset: qpzry9x8gf2tvdw0s3jn54khce6mua7l
  const bech32Chars = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
  if (!bech32Chars.test(dataPart)) return false;
  // Typical cosmos address is 39-59 chars total
  if (address.length < 39 || address.length > 65) return false;
  return true;
}

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export default function useAddressBook(): AddressBookContext {
  const [contacts, setContacts] = useState<Contact[]>(loadContacts);

  const addContact = useCallback(
    (contact: Omit<Contact, "createdAt">): { ok: boolean; error?: string } => {
      if (!contact.name.trim()) {
        return { ok: false, error: "Name is required" };
      }
      if (!isValidBech32(contact.address)) {
        return { ok: false, error: "Invalid bech32 address. Must start with claw1..." };
      }

      const current = loadContacts();
      if (current.some((c) => c.address === contact.address)) {
        return { ok: false, error: "Address already exists in address book" };
      }
      if (current.length >= MAX_CONTACTS) {
        return { ok: false, error: `Address book is full (max ${MAX_CONTACTS} contacts)` };
      }

      const newContact: Contact = {
        ...contact,
        name: contact.name.trim(),
        notes: contact.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      const updated = [newContact, ...current];
      saveContacts(updated);
      setContacts(updated);
      return { ok: true };
    },
    [],
  );

  const removeContact = useCallback((address: string) => {
    const current = loadContacts();
    const updated = current.filter((c) => c.address !== address);
    saveContacts(updated);
    setContacts(updated);
  }, []);

  const updateContact = useCallback(
    (address: string, updates: Partial<Omit<Contact, "createdAt">>): { ok: boolean; error?: string } => {
      if (updates.address && !isValidBech32(updates.address)) {
        return { ok: false, error: "Invalid bech32 address" };
      }
      if (updates.name !== undefined && !updates.name.trim()) {
        return { ok: false, error: "Name is required" };
      }

      const current = loadContacts();
      // If changing address, check for duplicates
      if (updates.address && updates.address !== address) {
        if (current.some((c) => c.address === updates.address)) {
          return { ok: false, error: "Address already exists in address book" };
        }
      }

      const idx = current.findIndex((c) => c.address === address);
      if (idx === -1) {
        return { ok: false, error: "Contact not found" };
      }

      current[idx] = {
        ...current[idx],
        ...updates,
        name: (updates.name ?? current[idx].name).trim(),
      };
      saveContacts(current);
      setContacts([...current]);
      return { ok: true };
    },
    [],
  );

  const getContact = useCallback(
    (address: string): Contact | undefined => {
      return contacts.find((c) => c.address === address);
    },
    [contacts],
  );

  const searchContacts = useCallback(
    (query: string): Contact[] => {
      if (!query.trim()) return contacts;
      const q = query.trim().toLowerCase();
      return contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          (c.notes && c.notes.toLowerCase().includes(q)),
      );
    },
    [contacts],
  );

  return { contacts, addContact, removeContact, updateContact, getContact, searchContacts };
}
