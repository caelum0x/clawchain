import { useState, useCallback } from "react";

/**
 * Hook for copying text to clipboard with feedback state.
 * Returns [copied, copyFn] where `copied` resets after 2s.
 */
export default function useCopyClipboard(
  resetMs = 2000,
): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), resetMs);
        },
        () => {
          /* clipboard write failed — silently ignore */
        },
      );
    },
    [resetMs],
  );

  return [copied, copy];
}
