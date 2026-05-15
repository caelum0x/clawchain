import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationPrefs {
  task: boolean;
  message: boolean;
  gpu: boolean;
  privacy: boolean;
  transaction: boolean;
  governance: boolean;
  validator: boolean;
  staking: boolean;
}

export type NotificationPrefCategory = keyof NotificationPrefs;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "claw-notification-prefs";

const DEFAULT_PREFS: NotificationPrefs = {
  task: true,
  message: true,
  gpu: true,
  privacy: true,
  transaction: true,
  governance: true,
  validator: true,
  staking: true,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFS };
    return {
      task: typeof parsed.task === "boolean" ? parsed.task : true,
      message: typeof parsed.message === "boolean" ? parsed.message : true,
      gpu: typeof parsed.gpu === "boolean" ? parsed.gpu : true,
      privacy: typeof parsed.privacy === "boolean" ? parsed.privacy : true,
      transaction: typeof parsed.transaction === "boolean" ? parsed.transaction : true,
      governance: typeof parsed.governance === "boolean" ? parsed.governance : true,
      validator: typeof parsed.validator === "boolean" ? parsed.validator : true,
      staking: typeof parsed.staking === "boolean" ? parsed.staking : true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be full or unavailable — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadPrefs);

  const toggleCategory = useCallback((category: NotificationPrefCategory) => {
    setPrefs((prev) => {
      const next = { ...prev, [category]: !prev[category] };
      savePrefs(next);
      return next;
    });
  }, []);

  const isEnabled = useCallback(
    (category: NotificationPrefCategory): boolean => prefs[category],
    [prefs],
  );

  return { prefs, toggleCategory, isEnabled } as const;
}
