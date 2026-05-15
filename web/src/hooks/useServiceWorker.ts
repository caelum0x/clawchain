import { useState, useEffect, useCallback, useRef } from "react";

export interface UseServiceWorkerReturn {
  /** True when a new service worker is installed and waiting to activate */
  updateAvailable: boolean;
  /** Call to activate the waiting service worker and reload */
  applyUpdate: () => void;
  /** The current registration, if any */
  registration: ServiceWorkerRegistration | null;
}

/**
 * Registers and manages the service worker lifecycle.
 *
 * When a new version of the service worker is detected (waiting state),
 * `updateAvailable` becomes true. Call `applyUpdate()` to skip waiting
 * and reload the page with the new version.
 */
export function useServiceWorker(): UseServiceWorkerReturn {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  const applyUpdate = useCallback(() => {
    const waitingWorker = waitingWorkerRef.current;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      // Reload once the new service worker takes over
      waitingWorker.addEventListener("statechange", () => {
        if (waitingWorker.state === "activated") {
          window.location.reload();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;

    async function register() {
      try {
        const reg = await navigator.serviceWorker.register("/service-worker.js", {
          scope: "/",
        });

        if (cancelled) return;
        setRegistration(reg);

        // Check if there's already a waiting worker (e.g. from a previous visit)
        if (reg.waiting) {
          waitingWorkerRef.current = reg.waiting;
          setUpdateAvailable(true);
          return;
        }

        // Listen for new service workers becoming installed
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              // A new worker is installed but waiting — update available
              waitingWorkerRef.current = installing;
              if (!cancelled) {
                setUpdateAvailable(true);
              }
            }
          });
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    }

    register();

    // If the controller changes (new SW activated), reload
    let reloading = false;
    function onControllerChange() {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return { updateAvailable, applyUpdate, registration };
}
