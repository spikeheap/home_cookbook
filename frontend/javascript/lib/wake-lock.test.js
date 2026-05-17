import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupWakeLock } from "./wake-lock.js";

// Hand-rolled fakes — the production module touches a small enough surface
// of `navigator`, `document`, and the button element that mocking is cleaner
// than pulling in jsdom or happy-dom.

function makeButton() {
  const listeners = {};
  const labelEl   = { textContent: "Keep screen awake" };
  return {
    listeners,
    labelEl,
    hidden: false,
    attrs: {},
    addEventListener(type, fn) { listeners[type] = fn; },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    querySelector(sel) { return sel === ".tool__label" ? labelEl : null; },
  };
}

function makeSentinel() {
  const listeners = {};
  let releaseCalls = 0;
  return {
    listeners,
    addEventListener(type, fn) { listeners[type] = fn; },
    release: () => { releaseCalls++; return Promise.resolve(); },
    get releaseCalls() { return releaseCalls; },
    triggerRelease() { listeners.release && listeners.release(); },
  };
}

function installGlobals({ wakeLockSupported = true } = {}) {
  globalThis.navigator = wakeLockSupported
    ? { wakeLock: { request: () => Promise.resolve(makeSentinel()) } }
    : {};
  globalThis.document = {
    visibilityState: "visible",
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}

beforeEach(() => {
  delete globalThis.navigator;
  delete globalThis.document;
});

test("returns null and does nothing when given a null button", () => {
  installGlobals();
  const handle = setupWakeLock(null);
  assert.strictEqual(handle, null);
});

test("hides the button and exits when wakeLock is unsupported", () => {
  installGlobals({ wakeLockSupported: false });
  const button = makeButton();

  const handle = setupWakeLock(button);

  assert.strictEqual(handle, null);
  assert.strictEqual(button.hidden, true);
  assert.strictEqual(button.listeners.click, undefined,
    "no click listener should be attached when unsupported");
});

test("first click acquires the lock and updates the UI", async () => {
  installGlobals();
  const sentinel = makeSentinel();
  globalThis.navigator.wakeLock.request = () => Promise.resolve(sentinel);

  const button = makeButton();
  const handle = setupWakeLock(button);

  await button.listeners.click();

  assert.strictEqual(button.attrs["aria-pressed"], "true");
  assert.strictEqual(button.labelEl.textContent, "Screen awake");
  assert.deepStrictEqual(handle.getState(), { intent: true, hasSentinel: true });
});

test("second click releases the lock and resets the UI", async () => {
  installGlobals();
  const sentinel = makeSentinel();
  globalThis.navigator.wakeLock.request = () => Promise.resolve(sentinel);

  const button = makeButton();
  const handle = setupWakeLock(button);

  await button.listeners.click(); // on
  await button.listeners.click(); // off

  assert.strictEqual(sentinel.releaseCalls, 1);
  assert.strictEqual(button.attrs["aria-pressed"], "false");
  assert.strictEqual(button.labelEl.textContent, "Keep screen awake");
  assert.deepStrictEqual(handle.getState(), { intent: false, hasSentinel: false });
});

test("a rejected request keeps the button off and resets intent", async () => {
  installGlobals();
  globalThis.navigator.wakeLock.request = () => Promise.reject(new Error("denied"));

  // suppress console.warn from production code
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const button = makeButton();
    const handle = setupWakeLock(button);

    await button.listeners.click();

    assert.strictEqual(button.attrs["aria-pressed"], "false");
    assert.strictEqual(button.labelEl.textContent, "Keep screen awake");
    assert.deepStrictEqual(handle.getState(), { intent: false, hasSentinel: false });
  } finally {
    console.warn = originalWarn;
  }
});

test("browser-initiated release keeps visual on while intent persists", async () => {
  installGlobals();
  const sentinel = makeSentinel();
  globalThis.navigator.wakeLock.request = () => Promise.resolve(sentinel);

  const button = makeButton();
  const handle = setupWakeLock(button);

  await button.listeners.click(); // on
  sentinel.triggerRelease();      // browser releases (e.g. tab hidden)

  assert.strictEqual(button.attrs["aria-pressed"], "true",
    "visual stays on because the user still wants the lock");
  assert.strictEqual(button.labelEl.textContent, "Screen awake");
  assert.deepStrictEqual(handle.getState(), { intent: true, hasSentinel: false });
});

test("returning to visible re-acquires when intent is on and sentinel is gone", async () => {
  installGlobals();
  const sentinels = [];
  globalThis.navigator.wakeLock.request = () => {
    const s = makeSentinel();
    sentinels.push(s);
    return Promise.resolve(s);
  };

  const button = makeButton();
  setupWakeLock(button);

  await button.listeners.click();          // request #1
  assert.strictEqual(sentinels.length, 1);

  sentinels[0].triggerRelease();           // browser auto-release

  globalThis.document.visibilityState = "hidden";
  await globalThis.document.listeners.visibilitychange();

  globalThis.document.visibilityState = "visible";
  await globalThis.document.listeners.visibilitychange();

  assert.strictEqual(sentinels.length, 2,
    "a second wake lock should be requested when the tab returns to visible");
});
