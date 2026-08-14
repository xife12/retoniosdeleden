const statusEl = document.querySelector<HTMLElement>('[data-admin-save-status]')!;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Kurze, deutliche Rückmeldung nach Aktionen ohne eigenes Formular (Archivieren, Löschen, Sortieren). */
export function showStatus(message: string, isError = false) {
  clearTimeout(hideTimer);
  statusEl.textContent = message;
  statusEl.classList.toggle('is-error', isError);
  statusEl.hidden = false;
  hideTimer = setTimeout(() => {
    statusEl.hidden = true;
  }, 3500);
}
