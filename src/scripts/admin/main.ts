/**
 * Verdrahtung der Hülle: Anmeldung, Kopfzeile, Router → Ansicht.
 *
 * Diese Datei enthält bewusst keine Fachlichkeit. Sie entscheidet nur, ob
 * das Anmeldeformular oder eine Ansicht im Anker `[data-admin-view]` steht,
 * und räumt beim Wechsel die vorherige Ansicht ab (`unmount()`).
 */
import { initAuth, isSignedIn, mountLogin, onAuth, signOut, currentEmail } from './auth';
import { navigate, onRoute, start, type Route } from './router';
import { clearToasts } from './toast';
import { currentRole, type ProfileRole } from './documents-store';
import { listChatThreads } from './chat-store';
import * as casas from './casas-view';
import * as talleres from './workshops-view';
import * as documentos from './documents-view';
import '../../styles/admin/shell.css';

/**
 * Zwei Montagearten, weil die Bereiche unterschiedlich tief sind.
 *
 * Talleres und Casas bestehen aus genau zwei Ebenen -- Liste und Editor --
 * und behalten deshalb ihren ursprünglichen Vertrag unverändert. Die Ablage
 * hat sechs gleichrangige Ansichten (Ordner, Ordnerinhalt, Dokument,
 * Aufgaben, Papierkorb, Personen); die in mountList/mountEditor zu pressen
 * hieße, den Bereich mit einem Vertrag zu beschreiben, der nicht auf ihn
 * passt. Sie bekommt stattdessen die Route selbst und entscheidet allein.
 */
interface TwoLevelView {
  mountList(container: HTMLElement): Promise<void>;
  mountEditor(container: HTMLElement, id: string): Promise<void>;
  unmount(): void;
}

interface RoutedView {
  mount(container: HTMLElement, route: Route): Promise<void>;
  unmount(): void;
}

type AdminView = TwoLevelView | RoutedView;

function isRouted(view: AdminView): view is RoutedView {
  return 'mount' in view;
}

type Section = 'talleres' | 'casas' | 'documentos';

const views: Record<Section, AdminView> = { talleres, casas, documentos };

/**
 * Rolle der angemeldeten Person, einmal beim Anmelden geladen.
 *
 * Die Navigation muss synchron entscheiden können, welche Knöpfe sie zeigt --
 * deshalb hier gemerkt statt bei jedem Wechsel neu gefragt. `null` heißt
 * "noch nicht geladen"; bis dahin wird nichts ausgeblendet, damit die
 * Kopfzeile nicht sichtbar hin- und herspringt.
 */
let role: ProfileRole | null = null;

/** Nur owner und editor dürfen die öffentliche Website bearbeiten. */
function mayEditSite(): boolean {
  return role === null || role === 'owner' || role === 'editor';
}

const viewEl = document.querySelector<HTMLElement>('[data-admin-view]');
const topEl = document.querySelector<HTMLElement>('[data-admin-top]');
const mailEl = document.querySelector<HTMLElement>('[data-admin-email]');
const logoutEl = document.querySelector<HTMLButtonElement>('[data-admin-logout]');
const navButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-admin-nav]'),
);
const chatFabEl = document.querySelector<HTMLButtonElement>('[data-admin-chat-fab]');
const chatBadgeEl = document.querySelector<HTMLElement>('[data-admin-chat-badge]');

/** Welche Ansicht gerade steht -- zum Abräumen vor dem nächsten Wechsel. */
let mounted: AdminView | null = null;
let loginMounted = false;
let routerStarted = false;

const DOCUMENT_VIEWS: ReadonlySet<Route['view']> = new Set([
  'documentos',
  'carpeta',
  'documento',
  'tareas',
  'papelera',
  'personas',
  'chat',
]);

function section(route: Route): Section {
  if (DOCUMENT_VIEWS.has(route.view)) return 'documentos';
  return route.view === 'casas' || route.view === 'casa' ? 'casas' : 'talleres';
}

function markNav(route: Route): void {
  const active = section(route);
  for (const btn of navButtons) {
    const target = btn.dataset.adminNav;
    // Wer nur Dokumente pflegen darf, sieht die Website-Bereiche gar nicht
    // erst: die Datenbank verweigert ihr dort ohnehin jeden Zugriff
    // (Policies hängen an may_edit_site()), und ein Knopf, der nur zu einer
    // Fehlermeldung führt, ist schlimmer als kein Knopf.
    const allowed = target === 'documentos' || mayEditSite();
    btn.hidden = !allowed;

    const own = target === active;
    btn.classList.toggle('is-active', own);
    // aria-current statt aria-selected: das sind Links in einer Navigation,
    // keine Reiter eines Tabpanels (Problem P12).
    if (own) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

/**
 * Fängt Adressen ab, die zur Rolle nicht passen -- etwa wenn jemand einen
 * Lesezeichen-Link auf einen fremden Bereich öffnet. Liefert die Route
 * zurück, die stattdessen gelten soll, oder `null`, wenn alles in Ordnung ist.
 */
function redirectFor(route: Route): Route | null {
  if (!mayEditSite() && section(route) !== 'documentos') {
    return { view: 'documentos' };
  }
  // Die Personenverwaltung gehört allein der Rolle owner.
  if (route.view === 'personas' && role !== null && role !== 'owner') {
    return { view: 'documentos' };
  }
  return null;
}

/**
 * Ungelesen-Zahl am Chat-Icon -- Plan Abschnitt 7a: KEIN Live-Push, nur ein
 * Nachladen bei Gelegenheit. "Bei Gelegenheit" heißt hier: bei jedem
 * Adresswechsel (siehe Aufruf in onRoute() unten), weil das ohnehin der
 * einzige Moment ist, in dem sich für die Nutzerin gerade etwas bewegt --
 * u.a. auch beim Verlassen des Chats selbst, nachdem dort markRead()
 * gelaufen ist. Wirft absichtlich nie: eine falsche/fehlende Zahl am Icon
 * ist kein Grund, irgendetwas anderes zu blockieren.
 */
async function refreshChatBadge(): Promise<void> {
  if (!chatBadgeEl) return;
  try {
    const threads = await listChatThreads();
    const total = threads.reduce((sum, t) => sum + t.unreadCount, 0);
    chatBadgeEl.textContent = total > 99 ? '99+' : String(total);
    chatBadgeEl.hidden = total === 0;
  } catch {
    // Stumm bleiben -- siehe oben.
  }
}

function unmountCurrent(): void {
  mounted?.unmount();
  mounted = null;
  clearToasts();
}

async function show(route: Route): Promise<void> {
  if (!viewEl || !isSignedIn()) return;

  const detour = redirectFor(route);
  if (detour) {
    navigate(detour, { replace: true });
    return;
  }

  unmountCurrent();
  markNav(route);
  viewEl.replaceChildren();
  // Nach jedem Ansichtswechsel oben anfangen -- sonst landet man mitten
  // in einer langen Liste, weil der Editor davor weit gescrollt war.
  window.scrollTo({ top: 0 });

  const view = views[section(route)];
  mounted = view;

  if (isRouted(view)) {
    await view.mount(viewEl, route);
  } else if (route.view === 'taller' || route.view === 'casa') {
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
  chatFabEl?.setAttribute('hidden', '');
  mountLogin(viewEl);
}

onAuth((state) => {
  if (mailEl) mailEl.textContent = state.email ?? '';

  if (!state.signedIn) {
    role = null;
    showLogin();
    return;
  }

  loginMounted = false;
  topEl?.removeAttribute('hidden');
  chatFabEl?.removeAttribute('hidden');

  // Der Router meldet die Startadresse selbst; danach übernimmt onRoute.
  if (!routerStarted) {
    routerStarted = true;
    // Die Rolle muss VOR dem Start feststehen: sie entscheidet, welche
    // Knöpfe die Kopfzeile zeigt und ob die gemerkte Startadresse für diese
    // Person überhaupt erlaubt ist. Schlägt das Laden fehl, bleibt `role`
    // null -- dann wird nichts ausgeblendet und es bleibt wie bisher bei
    // dem, was die Datenbank zulässt.
    void (async () => {
      try {
        role = await currentRole();
      } catch {
        role = null;
      }
      start();
      void refreshChatBadge();
    })();
  }
});

onRoute((route) => {
  void show(route);
  // Nicht blockierend, siehe refreshChatBadge(): jeder Adresswechsel ist
  // eine gute Gelegenheit, die Zahl am Icon aufzufrischen -- u.a. gerade
  // beim Verlassen des Chats, nachdem dort gelesen wurde.
  void refreshChatBadge();
});

chatFabEl?.addEventListener('click', () => navigate({ view: 'chat' }));

const NAV_TARGETS: Record<Section, Route> = {
  talleres: { view: 'talleres' },
  casas: { view: 'casas' },
  documentos: { view: 'documentos' },
};

for (const btn of navButtons) {
  btn.addEventListener('click', () => {
    const target = btn.dataset.adminNav as Section | undefined;
    navigate(NAV_TARGETS[target ?? 'talleres'] ?? NAV_TARGETS.talleres);
  });
}

logoutEl?.addEventListener('click', () => {
  void signOut();
});

if (mailEl) mailEl.textContent = currentEmail() ?? '';
void initAuth();
