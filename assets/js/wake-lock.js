// Recipe-page wake lock: keeps the screen on while cooking.
// Per-page toggle. Re-acquires automatically if the tab is hidden and returned.
// No-op (and hides the button) on browsers without the Wake Lock API.

export function setupWakeLock(button) {
  if (!button) return null;

  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    button.hidden = true;
    return null;
  }

  const labelEl  = button.querySelector(".tool__label");
  const labelOff = "Keep screen awake";
  const labelOn  = "Screen awake";

  let sentinel = null;
  let intent   = false;

  function setVisual(active) {
    button.setAttribute("aria-pressed", active ? "true" : "false");
    if (labelEl) labelEl.textContent = active ? labelOn : labelOff;
  }

  async function acquire() {
    try {
      sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        // The browser auto-releases when the tab is hidden. Keep `intent`
        // intact so visibilitychange can re-acquire on return.
        sentinel = null;
        if (!intent) setVisual(false);
      });
      setVisual(true);
    } catch (err) {
      console.warn("Wake lock request failed:", err);
      intent   = false;
      sentinel = null;
      setVisual(false);
    }
  }

  async function release() {
    intent = false;
    if (sentinel) {
      try { await sentinel.release(); } catch (_) { /* ignore */ }
    }
    sentinel = null;
    setVisual(false);
  }

  button.addEventListener("click", async () => {
    if (intent) {
      await release();
    } else {
      intent = true;
      await acquire();
    }
  });

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", async () => {
      if (intent && document.visibilityState === "visible" && !sentinel) {
        await acquire();
      }
    });
  }

  return {
    acquire,
    release,
    getState: () => ({ intent, hasSentinel: !!sentinel }),
  };
}

// Auto-bootstrap in browsers. No-op in Node (no document).
if (typeof document !== "undefined") {
  const btn = document.querySelector('[data-tool="wakelock"]');
  if (btn) setupWakeLock(btn);
}
