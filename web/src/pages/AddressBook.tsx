import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import useAddressBook, { type Contact } from "../hooks/useAddressBook.ts";
import useDocTitle from "../hooks/useDocTitle.ts";

type SortMode = "name" | "recent";

export default function AddressBook() {
  useDocTitle("Address Book");
  const { contacts, addContact, removeContact, updateContact, searchContacts } = useAddressBook();

  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState("");

  const resetForm = useCallback(() => {
    setFormName("");
    setFormAddress("");
    setFormNotes("");
    setFormError("");
    setShowForm(false);
    setEditingAddress(null);
  }, []);

  function openAddForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(contact: Contact) {
    setFormName(contact.name);
    setFormAddress(contact.address);
    setFormNotes(contact.notes || "");
    setFormError("");
    setEditingAddress(contact.address);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (editingAddress) {
      const result = updateContact(editingAddress, {
        name: formName,
        address: formAddress,
        notes: formNotes || undefined,
      });
      if (!result.ok) {
        setFormError(result.error || "Failed to update contact");
        return;
      }
    } else {
      const result = addContact({
        name: formName,
        address: formAddress,
        notes: formNotes || undefined,
      });
      if (!result.ok) {
        setFormError(result.error || "Failed to add contact");
        return;
      }
    }
    resetForm();
  }

  function handleDelete(address: string) {
    removeContact(address);
  }

  async function handleCopy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 1500);
    } catch {
      // Fallback for environments without clipboard API
      const input = document.createElement("input");
      input.value = address;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 1500);
    }
  }

  function truncateAddress(addr: string): string {
    if (addr.length <= 20) return addr;
    return `${addr.slice(0, 12)}...${addr.slice(-6)}`;
  }

  // Filtered and sorted contacts
  const filtered = searchQuery ? searchContacts(searchQuery) : contacts;
  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === "name") return a.name.localeCompare(b.name);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "0.5rem" }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>Address Book</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={openAddForm}>
            + Add Contact
          </button>
        )}
      </div>
      <p className="page-subtitle">Save and manage frequently used addresses.</p>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 500 }}>
          <h3>{editingAddress ? "Edit Contact" : "Add Contact"}</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1rem" }}>
              <label>Name *</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Alice"
                required
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label>Address *</label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="claw1..."
                required
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label>Notes (optional)</label>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional notes about this contact"
                rows={2}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            {formError && (
              <div style={{ color: "#ef4444", fontSize: "0.85rem", marginBottom: "1rem" }}>
                {formError}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-primary" type="submit">
                {editingAddress ? "Update" : "Save"}
              </button>
              <button className="btn btn-outline" type="button" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Sort Controls */}
      {contacts.length > 0 && (
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or address..."
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>Sort:</span>
            <button
              className={`btn ${sortMode === "recent" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setSortMode("recent")}
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}
            >
              Recent
            </button>
            <button
              className={`btn ${sortMode === "name" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setSortMode("name")}
              style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}
            >
              Name
            </button>
          </div>
        </div>
      )}

      {/* Contact List */}
      {contacts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <p style={{ color: "var(--text2)", marginBottom: "1rem" }}>No contacts saved yet.</p>
          {!showForm && (
            <button className="btn btn-primary" onClick={openAddForm}>
              + Add Your First Contact
            </button>
          )}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ color: "var(--text2)" }}>No contacts match your search.</p>
        </div>
      ) : (
        <div className="contact-list">
          {sorted.map((contact) => (
            <div key={contact.address} className="contact-card">
              <div className="contact-info">
                <div className="contact-name">{contact.name}</div>
                <div
                  className="contact-address"
                  onClick={() => handleCopy(contact.address)}
                  title="Click to copy full address"
                >
                  {truncateAddress(contact.address)}
                  {copiedAddress === contact.address ? (
                    <span className="copied-feedback" style={{ marginLeft: "0.5rem" }}>
                      Copied!
                    </span>
                  ) : (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", opacity: 0.5 }}>
                      (click to copy)
                    </span>
                  )}
                </div>
                {contact.notes && <div className="contact-notes">{contact.notes}</div>}
              </div>
              <div className="contact-actions">
                <button onClick={() => openEditForm(contact)} title="Edit contact">
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(contact.address)}
                  title="Delete contact"
                  style={{ color: "#ef4444" }}
                >
                  Delete
                </button>
                <Link
                  to={`/wallet?sendTo=${encodeURIComponent(contact.address)}`}
                  title="Send tokens to this address"
                >
                  <button type="button">Send</button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {contacts.length > 0 && (
        <p style={{ color: "var(--text2)", fontSize: "0.8rem", marginTop: "1rem" }}>
          {contacts.length} / 100 contacts
        </p>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem",
  background: "var(--bg, #0a0a0a)",
  border: "1px solid var(--border, #333)",
  borderRadius: "0.375rem",
  color: "var(--text, #fff)",
  fontSize: "0.875rem",
};
