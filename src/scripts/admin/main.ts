/**
 * Verdrahtung der Hülle: Anmeldung, Kopfzeile, Router → Ansicht.
 *
 * Diese Datei enthält bewusst keine Fachlichkeit. Sie entscheidet nur, ob
 * das Anmeldeformular oder eine Ansicht im Anker `[data-admin-view]` steht,
 * und räumt beim Wechsel die vorherige Ansicht ab (`unmount()`).
 */
import { initAuth, isSignedIn, mountLogin, onAuth, signOut, currentEmail } from './auth';
import { securityDialog } from './mfa-dialog';
import { mfaState } from './mfa';
import { navigate, onRoute, start, type Route } from './router';
import { clearToasts } from './toast';
import * as casas from './casas-view';
import * as talleres from './workshops-view';
import '../../styles/admin/shell.css';

/** Jede Ansicht liefert genau diese drei Funktionen (Montage-Vertrag). */
interface AdminView {
  mountList(container: HTMLElement): Promise<void>;
  mountEditor(container: HTMLElement, id: string): Promise<void>;
  unmount(): void;
}

const views: Record<'talleres' | 'casas', AdminView> = { talleres, casas };

const viewEl = document.querySelector<HTMLElement>('[data-admin-view]');
const topEl = document.querySelector<HTMLElement>('[data-admin-top]');
const mailEl = document.querySelector<HTMLElement>('[data-admin-email]');
const logoutEl = document.querySelector<HTMLButtonElement>('[data-admin-logout]');
const navButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-admin-nav]'),
);

/** Welche Ansicht gerade steht -- zum Abräumen vor dem nächsten Wechsel. */
let mounted: AdminView | null = null;
let loginMounted = false;
let routerStarted = false;

function section(route: Route): 'talleres' | 'casas' {
  return route.view === 'casas' || route.view === 'casa' ? 'casas' : 'talleres';
}

function markNav(route: Route): void {
  const active = section(route);
  for (const btn of navButtons) {
    const own = btn.dataset.adminNav === active;
    btn.classList.toggle('is-active', own);
    // aria-current statt aria-selected: das sind Links in einer Navigation,
    // keine Reiter eines Tabpanels (Problem P12).
    if (own) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

function unmountCurrent(): void {
  mounted?.unmount();
  mounted = null;
  clearToasts();
}

async function show(route: Route): Promise<void> {
  if (!viewEl || !isSignedIn()) return;

  unmountCurrent();
  markNav(route);
  viewEl.replaceChildren();
  // Nach jedem Ansichtswechsel oben anfangen -- sonst landet man mitten
  // in einer langen Liste, weil der Editor davor weit gescrollt war.
  window.scrollTo({ top: 0 });

  const view = views[section(route)];
  mounted = view;

  if (route.view === 'taller' || route.view === 'casa') {
    await view.mountEditor(viewEl, route.id);
  } else {
    await view.mountList(viewEl);
  }
}

function showLogin(): void {
  if (!viewEl || loginMounted) return;
  unmountCurrent();
  loginMounted = true;
  topEl?.setAttribute('hidden', '');
  mountLogin(viewEl);
}

onAuth((state) => {
  if (mailEl) mailEl.textContent = state.email ?? '';

  if (!state.signedIn) {
    showLogin();
    return;
  }

  loginMounted = false;
  topEl?.removeAttribute('hidden');
  void markSecurityState();

  // Der Router meldet die Startadresse selbst; danach übernimmt onRoute.
  if (!routerStarted) {
    routerStarted = true;
    start();
  }
});

onRoute((route) => {
  void show(route);
});

for (const btn of navButtons) {
  btn.addEventListener('click', () => {
    navigate(btn.dataset.adminNav === 'casas' ? { view: 'casas' } : { view: 'talleres' });
  });
}

logoutEl?.addEventListener('click', () => {
  void signOut();
});

/**
 * Zugang zum zweiten Faktor.
 *
 * Der Knopf wird hier zur Laufzeit eingehaengt statt ins Markup von
 * index.astro geschrieben: die Huelle soll weiterhin genau einen Anker haben
 * und nichts kennen, was es ohne Anmeldung gar nicht gibt.
 *
 * Ist noch kein Faktor eingerichtet, traegt der Knopf `data-attention` -- ein
 * stiller Punkt, kein Banner. Ein Backend, das bei jedem Start eine Warnung
 * wegzuklicken verlangt, wird nach einer Woche weggeklickt, ohne gelesen zu
 * werden.
 */
const securityBtn = document.createElement('button');
securityBtn.type = 'button';
securityBtn.className = 'btn btn--ghost btn--sm adm-top__security';
securityBtn.textContent = 'Seguridad';
securityBtn.addEventListener('click', () => {
  void securityDialog().then(() => void markSecurityState());
});
logoutEl?.parentElement?.insertBefore(securityBtn, logoutEl);

async function markSecurityState(): Promise<void> {
  if (!isSignedIn()) return;
  const state = await mfaState();
  securityBtn.toggleAttribute('data-attention', !state.enrolled);
  securityBtn.title = state.enrolled
    ? 'Segundo factor activo'
    : 'Todavía sin segundo factor';
}

if (mailEl) mailEl.textContent = currentEmail() ?? '';
void initAuth();
