/**
 * Copy `text` to the system clipboard behind a user gesture.
 *
 * `navigator.clipboard.writeText` returns a `Promise<void>` and is only defined
 * in a secure context (HTTPS or http://localhost); it rejects with a
 * `NotAllowedError` when the write is blocked. This wrapper resolves to a
 * boolean so callers can gate their "Copied" feedback on an actual success and
 * fail quietly (no swap) when the clipboard is unavailable or denied.
 *
 * Verified against MDN (Clipboard.writeText) — see the task's doc-check step.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
