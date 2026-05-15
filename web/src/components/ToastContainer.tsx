import { useState, useEffect, useCallback } from "react";
import { useToast, type Toast } from "../hooks/useToast";

const ICONS: Record<Toast["type"], string> = {
  success: "\u2713", // checkmark
  error: "\u2717",   // X
  info: "\u24D8",    // info circle
  warning: "\u26A0", // warning triangle
  loading: "\u25E0", // spinner-like
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [removing, setRemoving] = useState(false);

  const handleClose = useCallback(() => {
    setRemoving(true);
    setTimeout(() => onRemove(toast.id), 300);
  }, [toast.id, onRemove]);

  const duration = toast.duration ?? (toast.type === "loading" ? 0 : 5000);

  return (
    <div className={`toast ${removing ? "removing" : ""}`}>
      <span className={`toast-icon ${toast.type}`}>{ICONS[toast.type]}</span>
      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
        {toast.txHash && (
          <a className="toast-tx-link" href={`/explorer/tx/${toast.txHash}`}>
            View Tx
          </a>
        )}
      </div>
      <button className="toast-close" onClick={handleClose} aria-label="Close toast">
        {"\u2715"}
      </button>
      {duration > 0 && (
        <div
          className="toast-progress"
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  );
}
