import { useState, useRef, useEffect } from "react";
import { exportToCSV, exportToJSON } from "../lib/export";

interface ExportMenuProps {
  data: Record<string, unknown>[];
  filename: string;
}

export default function ExportMenu({ data, filename }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  function handleCSV() {
    exportToCSV(data, filename);
    setOpen(false);
  }

  function handleJSON() {
    exportToJSON(data, filename);
    setOpen(false);
  }

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }} onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        className="btn-outline"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        Export
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            minWidth: 150,
            background: "var(--bg2, #fff)",
            border: "1px solid var(--border, #ddd)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 100,
            overflow: "hidden",
          }}
        >
          <button
            role="menuitem"
            onClick={handleCSV}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 16px",
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--text1, #222)",
            }}
          >
            Export CSV
          </button>
          <button
            role="menuitem"
            onClick={handleJSON}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 16px",
              border: "none",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--text1, #222)",
            }}
          >
            Export JSON
          </button>
        </div>
      )}
    </div>
  );
}
