/**
 * Keeps the screen on while a sitting runs. The lock is released by the browser
 * whenever the page is hidden, so the caller asks again when it comes back.
 * A browser without the API, or one that refuses, returns null and the sitting
 * runs on regardless (the screen may dim). Phone-only; waits on the owner's check.
 */
export async function keepAwake(): Promise<WakeLockSentinel | null> {
  try {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}
