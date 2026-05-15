import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { KB_EVENTS } from "../hooks/useKeyboardShortcuts.ts";

/** A single search result entry. */
interface SearchResult {
  type: "block" | "tx" | "account" | "agent" | "validator";
  label: string;
  meta: string;
  path: string;
}

/** Group results by their type for display. */
interface ResultGroup {
  title: string;
  results: SearchResult[];
}

const TYPE_TITLES: Record<SearchResult["type"], string> = {
  block: "Blocks",
  tx: "Transactions",
  account: "Accounts",
  agent: "Agents",
  validator: "Validators",
};

function isNumeric(s: string): boolean {
  return /^\d+$/.test(s.trim());
}

function isHexHash(s: string): boolean {
  return /^[A-Fa-f0-9]{64}$/.test(s.trim());
}

function isClawAddress(s: string): boolean {
  return s.trim().startsWith("claw1");
}

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchBlock(height: string): Promise<SearchResult[]> {
  try {
    const data = await fetchJSON(
      `/api/cosmos/base/tendermint/v1beta1/blocks/${height}`
    );
    const block = data.block;
    if (!block) return [];
    const h = block.header?.height ?? height;
    const time = block.header?.time
      ? new Date(block.header.time).toLocaleString()
      : "";
    return [
      {
        type: "block",
        label: `Block #${h}`,
        meta: time,
        path: `/explorer/block/${h}`,
      },
    ];
  } catch {
    return [];
  }
}

async function searchTx(hash: string): Promise<SearchResult[]> {
  try {
    const data = await fetchJSON(`/api/cosmos/tx/v1beta1/txs/${hash}`);
    const txr = data.tx_response;
    if (!txr) return [];
    const shortHash =
      txr.txhash.length > 16
        ? `${txr.txhash.slice(0, 8)}...${txr.txhash.slice(-8)}`
        : txr.txhash;
    return [
      {
        type: "tx",
        label: shortHash,
        meta: `Height ${txr.height}`,
        path: `/explorer/tx/${txr.txhash}`,
      },
    ];
  } catch {
    return [];
  }
}

async function searchAccount(address: string): Promise<SearchResult[]> {
  try {
    await fetchJSON(`/api/cosmos/auth/v1beta1/accounts/${address}`);
    const shortAddr =
      address.length > 16
        ? `${address.slice(0, 10)}...${address.slice(-6)}`
        : address;
    return [
      {
        type: "account",
        label: shortAddr,
        meta: "Account",
        path: `/explorer/account/${address}`,
      },
    ];
  } catch {
    return [];
  }
}

async function searchAgents(query: string): Promise<SearchResult[]> {
  try {
    const data = await fetchJSON(`/api/clawchain/agent/v1/agents`);
    const agents: any[] = data.agents ?? [];
    const q = query.toLowerCase();
    return agents
      .filter(
        (a: any) =>
          (a.name ?? "").toLowerCase().includes(q) ||
          (a.agent_name ?? "").toLowerCase().includes(q) ||
          (a.address ?? "").toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((a: any) => ({
        type: "agent" as const,
        label: a.name || a.agent_name || a.address || "Unknown Agent",
        meta: a.address
          ? `${a.address.slice(0, 10)}...${a.address.slice(-6)}`
          : "",
        path: `/agents`,
      }));
  } catch {
    return [];
  }
}

async function searchValidators(query: string): Promise<SearchResult[]> {
  try {
    const data = await fetchJSON(
      `/api/cosmos/staking/v1beta1/validators`
    );
    const validators: any[] = data.validators ?? [];
    const q = query.toLowerCase();
    return validators
      .filter(
        (v: any) =>
          (v.description?.moniker ?? "").toLowerCase().includes(q) ||
          (v.operator_address ?? "").toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((v: any) => ({
        type: "validator" as const,
        label: v.description?.moniker || "Unknown Validator",
        meta: v.operator_address
          ? `${v.operator_address.slice(0, 10)}...${v.operator_address.slice(-6)}`
          : "",
        path: `/validators/${v.operator_address ?? ""}`,
      }));
  } catch {
    return [];
  }
}

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      setSelectedIndex(-1);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);

    const timer = setTimeout(async () => {
      const q = query.trim();
      let allResults: SearchResult[] = [];

      try {
        if (isNumeric(q)) {
          // Search for block by height
          allResults = await searchBlock(q);
        } else if (isHexHash(q)) {
          // Search for transaction by hash
          allResults = await searchTx(q);
        } else if (isClawAddress(q)) {
          // Search for account by address
          allResults = await searchAccount(q);
        } else {
          // General search: try agents and validators
          const [agents, validators] = await Promise.all([
            searchAgents(q),
            searchValidators(q),
          ]);
          allResults = [...agents, ...validators];
        }
      } catch {
        // Silently handle errors
      }

      setResults(allResults);
      setSelectedIndex(-1);
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside closes dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Listen for global keyboard shortcut to focus search
  useEffect(() => {
    function handleFocusSearch() {
      inputRef.current?.focus();
    }
    window.addEventListener(KB_EVENTS.FOCUS_SEARCH, handleFocusSearch);
    return () => window.removeEventListener(KB_EVENTS.FOCUS_SEARCH, handleFocusSearch);
  }, []);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      setIsOpen(false);
      setQuery("");
      navigate(result.path);
    },
    [navigate]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
        return;
      }

      if (!isOpen || results.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1
        );
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        navigateToResult(results[selectedIndex]);
      }
    },
    [isOpen, results, selectedIndex, navigateToResult]
  );

  // Group results by type
  const groups: ResultGroup[] = [];
  const typeOrder: SearchResult["type"][] = [
    "block",
    "tx",
    "account",
    "agent",
    "validator",
  ];
  for (const type of typeOrder) {
    const filtered = results.filter((r) => r.type === type);
    if (filtered.length > 0) {
      groups.push({ title: TYPE_TITLES[type], results: filtered });
    }
  }

  // Compute a flat index for keyboard navigation
  let flatIndex = 0;

  return (
    <div className="global-search" ref={containerRef}>
      <span className="search-icon" aria-hidden="true">
        {"\u2315"}
      </span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search blocks, txs, accounts, agents..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.trim() && results.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        aria-label="Global search"
        autoComplete="off"
      />
      {isOpen && (
        <div className="search-dropdown" role="listbox">
          {isLoading && (
            <div className="search-group" style={{ textAlign: "center", padding: "1rem" }}>
              <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
              <div style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: 4 }}>
                Searching...
              </div>
            </div>
          )}
          {!isLoading && results.length === 0 && query.trim() && (
            <div
              className="search-group"
              style={{ textAlign: "center", padding: "1rem", opacity: 0.6, fontSize: "0.875rem" }}
            >
              No results found
            </div>
          )}
          {!isLoading &&
            groups.map((group) => (
              <div className="search-group" key={group.title}>
                <div className="search-group-title">{group.title}</div>
                {group.results.map((result) => {
                  const currentIndex = flatIndex++;
                  return (
                    <div
                      key={`${result.type}-${result.path}-${currentIndex}`}
                      className={`search-result${currentIndex === selectedIndex ? " selected" : ""}`}
                      role="option"
                      aria-selected={currentIndex === selectedIndex}
                      onClick={() => navigateToResult(result)}
                      onMouseEnter={() => setSelectedIndex(currentIndex)}
                    >
                      <span className="label">{result.label}</span>
                      <span className="meta">{result.meta}</span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
