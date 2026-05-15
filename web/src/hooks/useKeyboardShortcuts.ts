import { useEffect } from "react";

/** Custom event names dispatched by the keyboard shortcuts hook. */
export const KB_EVENTS = {
  FOCUS_SEARCH: "kb:focus-search",
  ESCAPE: "kb:escape",
} as const;

/**
 * Global keyboard shortcut listener.
 *
 * - Ctrl+K / Cmd+K  ->  dispatches "kb:focus-search" on `window`
 * - Escape           ->  dispatches "kb:escape" on `window`
 *
 * Components can listen for these custom events to react accordingly.
 */
export default function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+K or Cmd+K -> focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(KB_EVENTS.FOCUS_SEARCH));
      }

      // Escape -> close modals / dropdowns
      if (e.key === "Escape") {
        window.dispatchEvent(new CustomEvent(KB_EVENTS.ESCAPE));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
