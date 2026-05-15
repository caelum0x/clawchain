import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning" | "loading";
  title: string;
  message?: string;
  duration?: number; // ms, default 5000, 0 = manual dismiss
  txHash?: string; // if set, show "View Tx" link
}

export interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string; // returns toast id
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_TOASTS = 5;
let nextId = 0;

function generateId(): string {
  nextId += 1;
  return `toast-${nextId}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const scheduleRemoval = useCallback(
    (id: string, duration: number) => {
      // Clear any existing timer for this id
      const existing = timersRef.current.get(id);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [removeToast],
  );

  const addToast = useCallback(
    (toast: Omit<Toast, "id">): string => {
      const id = generateId();
      const newToast: Toast = { ...toast, id };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        // Enforce max toasts limit by removing oldest
        if (updated.length > MAX_TOASTS) {
          const removed = updated.slice(0, updated.length - MAX_TOASTS);
          removed.forEach((r) => {
            const timer = timersRef.current.get(r.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(r.id);
            }
          });
          return updated.slice(updated.length - MAX_TOASTS);
        }
        return updated;
      });

      // Auto-dismiss: loading toasts don't auto-dismiss
      const duration = toast.duration ?? (toast.type === "loading" ? 0 : 5000);
      if (duration > 0) {
        scheduleRemoval(id, duration);
      }

      return id;
    },
    [scheduleRemoval],
  );

  const updateToast = useCallback(
    (id: string, updates: Partial<Toast>) => {
      setToasts((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const updated = { ...t, ...updates, id }; // id is immutable

          // If the type changed away from loading, or a new duration is provided,
          // re-schedule auto-dismiss
          const wasLoading = t.type === "loading";
          const isNowLoading = updated.type === "loading";
          const durationChanged = updates.duration !== undefined;

          if (wasLoading && !isNowLoading && !durationChanged) {
            // Switched from loading to a non-loading type: start auto-dismiss with default
            const dur = updated.duration ?? 5000;
            if (dur > 0) {
              scheduleRemoval(id, dur);
            }
          } else if (durationChanged) {
            // Clear existing timer and re-schedule if needed
            const existing = timersRef.current.get(id);
            if (existing) {
              clearTimeout(existing);
              timersRef.current.delete(id);
            }
            const dur = updates.duration ?? 0;
            if (dur > 0) {
              scheduleRemoval(id, dur);
            }
          }

          return updated;
        }),
      );
    },
    [scheduleRemoval],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, updateToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
