/**
 * Bootstrap der eigenständigen Chat-App (/chat, Phase 7c, PLAN-CHAT.md
 * Abschnitt 5 + 7c).
 *
 * Bewusst viel schlanker als main.ts (Hülle von /admin): kein
 * Talleres/Casas-Umschalten und kein Hash-Router -- /chat kennt nur zwei
 * Zustände, Anmeldeformular oder Chat. Wiederverwendet aus main.ts nur das
 * Anmelde-Gating-Muster (initAuth()/onAuth()), nicht dessen
 * Router-Verdrahtung, die es hier nicht gibt.
 */
import { currentEmail, initAuth, mountLogin, onAuth, signOut } from './auth';
import { mountChat, unmountChat } from './chat-view';
// base.css: Toasts/Dialoge/Anmeldeformular (.adm-toasts, .adm-dialog…,
// .adm-login…). In /admin kommt das über shell.css hinein (die @importiert
// base.css); /chat braucht shell.css selbst nicht (Kopfzeile/Navigation der
// vollen Admin-Hülle), deshalb hier direkt.
import '../../styles/admin/base.css';
// document-detail.css NUR wegen .mention-chip* -- die Erwähnungs-Chips IN
// abgeschickten Nachrichten (renderCommentBody() aus mentions.ts). Das
// @-Menü selbst (.chat-mentionmenu) hält sich in chat.css absichtlich
// unabhängig von document-detail.css (siehe Kommentar dort), die Chips im
// Nachrichtentext aber nicht -- ohne diese Zeile blieben sie unformatiertes
// "@[Label](typ:uuid)"-Rohmarkup ohne die übliche Chip-Optik. In /admin ist
// diese Datei ohnehin immer geladen (documents-view.ts importiert
// document-detail.ts), hier muss sie explizit dazukommen.
import '../../styles/admin/document-detail.css';
import '../../styles/admin/chat-standalone.css';

/**
 * Service-Worker-Registrierung -- NUR hier, nicht global (PLAN-CHAT.md
 * Abschnitt 5.3). Dieses Modul lädt ausschliesslich auf /chat; ein Service
 * Worker mit leerem fetch-Handler auf /admin oder der Marketing-Seite würde
 * dort nur jede Netzwerkanfrage unnötig durch die Vermittlungsebene
 * schleusen. `scope: '/chat'` deckungsgleich mit chat.webmanifest.
 *
 * Wirft absichtlich nie sichtbar für die Nutzerin: schlägt die Registrierung
 * fehl (älterer Browser, oder iOS Safari, das Service Worker nur im
 * Vollbild-Standalone-Kontext zuverlässig behält), bleibt der Chat trotzdem
 * normal benutzbar -- nur der automatische Install-Vorschlag (Android/
 * Chrome) bliebe dann aus.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/chat-sw.js', { scope: '/chat' }).catch(() => {
      // Siehe Kommentar oben -- stumm bleiben.
    });
  });
}

const rootEl = document.querySelector<HTMLElement>('[data-chat-root]');

/* ------------------------------------------------------------------- *
 * Schlanke Kopfzeile: "Chat" links, "Cerrar sesión" rechts -- kein Nachbau
 * der vollen Admin-Kopfzeile (Logo/Navigation/Sicherheit-Knopf), siehe
 * Auftrag. Erst nach dem Anmelden sichtbar, wie [data-admin-top] in main.ts.
 * ------------------------------------------------------------------- */
const header = document.createElement('header');
header.className = 'chat-standalone__top';
header.hidden = true;

const brand = document.createElement('p');
brand.className = 'chat-standalone__brand';
brand.textContent = 'Chat';

const logoutBtn = document.createElement('button');
logoutBtn.type = 'button';
logoutBtn.className = 'btn btn--ghost btn--sm';
logoutBtn.textContent = 'Cerrar sesión';
logoutBtn.addEventListener('click', () => void signOut());

header.append(brand, logoutBtn);

const main = document.createElement('main');
main.className = 'chat-standalone__main';

rootEl?.append(header, main);

/** Was gerade in `main` steht -- zum Abräumen vor dem nächsten Wechsel. */
let activeTeardown: (() => void) | null = null;

function clearMain(): void {
  activeTeardown?.();
  activeTeardown = null;
  main.replaceChildren();
}

function showLogin(): void {
  clearMain();
  header.hidden = true;
  const mounted = mountLogin(main);
  activeTeardown = () => mounted.destroy();
}

function showChat(): void {
  clearMain();
  header.hidden = false;
  void mountChat(main, {
    // /chat hat keinen #/...-Hash-Router (der existiert nur innerhalb der
    // /admin-SPA, siehe router.ts) -- ohne dieses Argument würde mountChat()
    // intern navigate() aufrufen und nur den URL-Hash dieser Seite ändern,
    // ohne dass irgendjemand reagiert. Ein echter Sprung zurück in die
    // volle Admin-Oberfläche ist hier deshalb Absicht (PLAN-CHAT.md
    // Abschnitt 6.2: "der Chat ersetzt die Dokumentverwaltung nicht") --
    // verlässt damit bewusst die installierte Chat-App-Hülle.
    //
    // Hash-Pfad exakt aus router.ts::routeToHash() für { view: 'documento' }
    // übernommen, NICHT geraten: "#/documentos/doc/<id>" (Mehrzahl
    // "documentos", Unterpfad "doc"), nicht etwa "#/documento/<id>".
    onOpenDocument: (id) => {
      window.location.href = `/admin/#/documentos/doc/${id}`;
    },
  });
  activeTeardown = unmountChat;
}

onAuth((state) => {
  if (!state.signedIn) {
    showLogin();
    return;
  }
  showChat();
});

// Nur als Tooltip -- die schlanke Kopfzeile zeigt keine eigene E-Mail-Zeile.
brand.title = currentEmail() ?? '';
void initAuth();
