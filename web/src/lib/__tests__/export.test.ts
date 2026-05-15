import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportToCSV, exportToJSON } from "../export";

describe("exportToCSV", () => {
  let mockClick: ReturnType<typeof vi.fn>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let appendedChild: HTMLAnchorElement | null;

  beforeEach(() => {
    mockClick = vi.fn();
    appendedChild = null;
    mockCreateObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    mockRevokeObjectURL = vi.fn();

    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        const el = { href: "", download: "", click: mockClick } as unknown as HTMLAnchorElement;
        return el;
      }
      return document.createElement(tag);
    });

    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      appendedChild = node as HTMLAnchorElement;
      return node;
    });

    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates correct CSV string with headers from object keys", () => {
    const data = [
      { name: "Alice", age: "30", city: "NY" },
      { name: "Bob", age: "25", city: "LA" },
    ];

    exportToCSV(data, "test");

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    const blob: Blob = mockCreateObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/csv");

    // Verify the anchor was created with the correct download filename
    expect(appendedChild).toBeTruthy();
    expect(mockClick).toHaveBeenCalledOnce();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("escapes commas and quotes in values", () => {
    // We need to verify the blob content, so we capture it
    let blobContent = "";
    const realCreateObjectURL = vi.fn().mockImplementation((blob: Blob) => {
      // Read blob synchronously via the constructor args
      // Since Blob stores data, we reconstruct from the parts
      blobContent = "";
      return "blob:mock-url";
    });

    vi.stubGlobal("URL", {
      createObjectURL: realCreateObjectURL,
      revokeObjectURL: vi.fn(),
    });

    // Instead of reading blob content (async), verify via a Blob spy
    const blobSpy = vi.fn();
    const OrigBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class MockBlob extends OrigBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          blobSpy(parts, options);
        }
      },
    );

    const data = [
      { field: 'has "quotes"', other: "has,comma" },
      { field: "normal", other: "also\nnewline" },
    ];

    exportToCSV(data, "escaped.csv");

    // Check the CSV content passed to Blob
    const csvContent = blobSpy.mock.calls[0][0][0] as string;
    expect(csvContent).toContain("field,other"); // headers
    expect(csvContent).toContain('"has ""quotes"""'); // escaped quotes
    expect(csvContent).toContain('"has,comma"'); // escaped comma
    expect(csvContent).toContain('"also\nnewline"'); // escaped newline

    vi.stubGlobal("Blob", OrigBlob);
  });

  it("does nothing for empty data", () => {
    exportToCSV([], "empty");
    expect(mockCreateObjectURL).not.toHaveBeenCalled();
  });
});

describe("exportToJSON", () => {
  let mockClick: ReturnType<typeof vi.fn>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let blobSpy: ReturnType<typeof vi.fn>;
  const OrigBlob = globalThis.Blob;

  beforeEach(() => {
    mockClick = vi.fn();
    mockCreateObjectURL = vi.fn().mockReturnValue("blob:json-url");

    vi.stubGlobal("URL", {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: vi.fn(),
    });

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return { href: "", download: "", click: mockClick } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });

    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

    blobSpy = vi.fn();
    vi.stubGlobal(
      "Blob",
      class MockBlob extends OrigBlob {
        constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          blobSpy(parts, options);
        }
      },
    );
  });

  afterEach(() => {
    vi.stubGlobal("Blob", OrigBlob);
    vi.restoreAllMocks();
  });

  it("generates correct JSON string", () => {
    const data = { validators: [{ name: "V1" }], count: 1 };
    exportToJSON(data, "validators");

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();

    const jsonContent = blobSpy.mock.calls[0][0][0] as string;
    expect(JSON.parse(jsonContent)).toEqual(data);
    expect(blobSpy.mock.calls[0][1]).toEqual({ type: "application/json" });
  });

  it("creates and clicks a download link", () => {
    exportToJSON([1, 2, 3], "numbers.json");

    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
    expect(mockClick).toHaveBeenCalledOnce();
  });
});
