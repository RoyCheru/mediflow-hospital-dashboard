/** Live Queue auto-refresh interval (requirement: every 20–30 seconds). */
export const QUEUE_POLL_INTERVAL_MS = 25_000;

/**
 * Poll only while the browser tab is focused. React Query already pauses
 * intervals while the document is hidden (refetchIntervalInBackground: false)
 * and refetches on window focus, which re-evaluates this function and resumes
 * polling. Callers only enable it while the Live Queue tab is active.
 */
export function queueRefetchInterval(): number | false {
  if (typeof document === "undefined") return false;
  return document.hasFocus() ? QUEUE_POLL_INTERVAL_MS : false;
}
