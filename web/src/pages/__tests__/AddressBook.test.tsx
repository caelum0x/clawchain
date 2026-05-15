import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, beforeEach } from "vitest";
import AddressBook from "../AddressBook";

const STORAGE_KEY = "clawchain-address-book";
const VALID_ADDR = "claw1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu";
const VALID_ADDR_2 = "claw1grgelyng2v6v3t084qhcfkm8h05cc6kzg4j7ey";

function renderPage() {
  return render(
    <MemoryRouter>
      <AddressBook />
    </MemoryRouter>,
  );
}

describe("AddressBook", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders empty state", () => {
    renderPage();
    expect(screen.getByText("No contacts saved yet.")).toBeInTheDocument();
    expect(screen.getByText("Address Book")).toBeInTheDocument();
  });

  it("opens add contact form when button is clicked", async () => {
    renderPage();
    const addButton = screen.getByText("+ Add Contact");
    await userEvent.click(addButton);
    expect(screen.getByText("Name *")).toBeInTheDocument();
    expect(screen.getByText("Address *")).toBeInTheDocument();
  });

  it("adds a contact via the form", async () => {
    renderPage();

    // Open the form
    await userEvent.click(screen.getByText("+ Add Contact"));

    // Fill in the form
    const nameInput = screen.getByPlaceholderText("e.g. Alice");
    const addressInput = screen.getByPlaceholderText("claw1...");
    await userEvent.type(nameInput, "Alice");
    await userEvent.type(addressInput, VALID_ADDR);

    // Submit
    await userEvent.click(screen.getByText("Save"));

    // Contact should now appear
    expect(screen.getByText("Alice")).toBeInTheDocument();

    // Verify in localStorage
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Alice");
  });

  it("shows contact in list after adding", async () => {
    // Pre-seed
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { address: VALID_ADDR, name: "Bob", notes: "My friend", createdAt: new Date().toISOString() },
      ]),
    );

    renderPage();

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("My friend")).toBeInTheDocument();
  });

  it("deletes a contact", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { address: VALID_ADDR, name: "Alice", createdAt: new Date().toISOString() },
      ]),
    );

    renderPage();
    expect(screen.getByText("Alice")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Delete"));

    expect(screen.getByText("No contacts saved yet.")).toBeInTheDocument();
  });

  it("searches and filters contacts", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { address: VALID_ADDR, name: "Alice", createdAt: new Date().toISOString() },
        { address: VALID_ADDR_2, name: "Bob", createdAt: new Date().toISOString() },
      ]),
    );

    renderPage();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    // Search for Alice
    const searchInput = screen.getByPlaceholderText("Search by name or address...");
    await userEvent.type(searchInput, "alice");

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("shows error for invalid address", async () => {
    renderPage();
    await userEvent.click(screen.getByText("+ Add Contact"));

    const nameInput = screen.getByPlaceholderText("e.g. Alice");
    const addressInput = screen.getByPlaceholderText("claw1...");
    await userEvent.type(nameInput, "BadAddr");
    await userEvent.type(addressInput, "invalid-address");
    await userEvent.click(screen.getByText("Save"));

    expect(screen.getByText(/Invalid bech32/)).toBeInTheDocument();
  });

  it("shows contact count", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { address: VALID_ADDR, name: "Alice", createdAt: new Date().toISOString() },
      ]),
    );

    renderPage();
    expect(screen.getByText("1 / 100 contacts")).toBeInTheDocument();
  });
});
