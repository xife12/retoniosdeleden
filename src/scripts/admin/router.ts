/**
 * Kleiner History-Router für /admin.
 *
 * Die Seite bleibt eine einzige statische Seite; die Ansichten wechseln über
 * den Hash. `history.pushState` sorgt dafür, dass der Zurück-Knopf des
 * Browsers und die Android-Zurück-Geste funktionieren — genau das fehlte im
 * Riesen-Modal von v1 (P1).
 *
 *   #/talleres            Liste Workshops (Startansicht)
 *   #/talleres/nuevo      Editor, neuer Workshop
 *   #/talleres/<id>       Editor, bestehender Workshop
 *   #/casas               Liste Lehmhäuser
 *   #/casas/nuevo         Editor, neues Haus
 *   #/casas/<id>          Editor, bestehendes Haus
 *   #/modulos             Liste Schulmodule ("Las abejas educan")
 *   #/modulos/nuevo       Editor, neues Modul
 *   #/modulos/<id>        Editor, bestehendes Modul
 *   #/on-tour             Liste Seminare + Zonen ("On Tour")
 *   #/on-tour/nuevo       Editor, neues Seminar
 *   #/on-tour/<id>        Editor, bestehendes Seminar
 *   #/on-tour/zona/nueva  Editor, neue Anfahrtszone
 *   #/on-tour/zona/<id>   Editor, bestehende Anfahrtszone
 *
 * Verwerf-Schutz (P3): ein Editor meldet über `setLeaveGuard()` an, dass es
 * ungespeicherte Änderungen gibt. Der Router fragt vor jedem Wechsel. Beim
 * Zurück-Knopf ist der Wechsel technisch schon passiert — dann schiebt der
 * Router die alte Adresse wieder auf den Stapel, statt sie zu vergessen.
 */

export type Route =
  | { view: 'talleres' }
  | { view: 'taller'; id: string | 'nuevo' }
  | { view: 'casas' }
  | { view: 'casa'; id: string | 'nuevo' }
  // Módulos folgen demselben Zweiebenen-Muster wie Talleres und Casas:
  // Liste und Editor, nichts dazwischen (siehe main.ts).
  | { view: 'modulos' }
  | { view: 'modulo'; id: string | 'nuevo' }
  // On Tour hat eine Ebene mehr als Talleres/Casas/Módulos, aber keinen
  // zweiten Bereich: Seminare und Zonen stehen gemeinsam unter #/on-tour und
  // teilen sich einen Knopf in der Kopfzeile. Die Zonen bekommen trotzdem
  // eine eigene Adresse, weil jede von ihnen ein eigener Datensatz mit
  // eigenem Veröffentlichungszustand ist -- ohne eigene Adresse gäbe es
  // keinen Zurück-Knopf aus dem Zoneneditor heraus. Begründung ausführlich
  // in on-tour-view.ts.
  | { view: 'onTour' }
  | { view: 'seminario'; id: string | 'nuevo' }
  | { view: 'zona'; id: string | 'nueva' }
  // Dokumentenablage. Anders als Talleres/Casas sind das nicht zwei Ebenen
  // (Liste + Editor), sondern sechs gleichrangige Ansichten -- deshalb
  // montiert dieser Bereich über `mount(container, route)` statt über
  // mountList/mountEditor. Siehe main.ts.
  | { view: 'documentos' }
  | { view: 'carpeta'; id: string }
  | { view: 'documento'; id: string }
  | { view: 'tareas' }
  | { view: 'papelera' }
  | { view: 'personas' }
  | { view: 'chat' };

const HOME: Route = { view: 'talleres' };

const handlers = new Set<(r: Route) => void | Promise<void>>();
let leaveGuard: null | (() => Promise<boolean>) = null;
let current: Route = HOME;
let started = false;
/** Während wir eine abgelehnte Rückwärtsnavigation reparieren. */
let repairing = false;

export function routeToHash(route: Route): string {
  switch (route.view) {
    case 'talleres':
      return '#/talleres';
    case 'taller':
      return `#/talleres/${route.id}`;
    case 'casas':
      return '#/casas';
    case 'casa':
      return `#/casas/${route.id}`;
    case 'modulos':
      return '#/modulos';
    case 'modulo':
      return `#/modulos/${route.id}`;
    case 'onTour':
      return '#/on-tour';
    case 'seminario':
      return `#/on-tour/${route.id}`;
    case 'zona':
      return `#/on-tour/zona/${route.id}`;
    case 'documentos':
      return '#/documentos';
    case 'carpeta':
      return `#/documentos/carpeta/${route.id}`;
    case 'documento':
      return `#/documentos/doc/${route.id}`;
    case 'tareas':
      return '#/documentos/tareas';
    case 'papelera':
      return '#/documentos/papelera';
    case 'personas':
      return '#/documentos/personas';
    case 'chat':
      return '#/documentos/chat';
  }
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [section, id] = parts;

  if (section === 'casas') {
    return id ? { view: 'casa', id } : { view: 'casas' };
  }
  if (section === 'talleres') {
    return id ? { view: 'taller', id } : { view: 'talleres' };
  }
  if (section === 'modulos') {
    return id ? { view: 'modulo', id } : { view: 'modulos' };
  }
  // Wie bei der Ablage weiter unten: der zweite Teil kann hier ausnahmsweise
  // eine Unteransicht benennen statt eines Datensatzes. Das geht gut, weil
  // Kennungen uuids sind und "zona" damit nie eine sein kann.
  if (section === 'on-tour') {
    if (id === 'zona') {
      const target = parts[2];
      return target ? { view: 'zona', id: target } : { view: 'onTour' };
    }
    return id ? { view: 'seminario', id } : { view: 'onTour' };
  }
  // Die Ablage hat eine Ebene mehr: der zweite Teil benennt hier die
  // Unteransicht, nicht schon den Datensatz. Unbekannte Unteransichten und
  // Verweise ohne Kennung fallen bewusst auf die Ordnerübersicht zurück,
  // statt die Seite leer zu lassen.
  if (section === 'documentos') {
    const target = parts[2];
    switch (id) {
      case undefined:
        return { view: 'documentos' };
      case 'carpeta':
        return target ? { view: 'carpeta', id: target } : { view: 'documentos' };
      case 'doc':
        return target ? { view: 'documento', id: target } : { view: 'documentos' };
      case 'tareas':
        return { view: 'tareas' };
      case 'papelera':
        return { view: 'papelera' };
      case 'personas':
        return { view: 'personas' };
      case 'chat':
        return { view: 'chat' };
      default:
        return { view: 'documentos' };
    }
  }
  return HOME;
}

export function currentRoute(): Route {
  return current;
}

function sameRoute(a: Route, b: Route): boolean {
  return routeToHash(a) === routeToHash(b);
}

async function mayLeave(): Promise<boolean> {
  if (!leaveGuard) return true;
  return leaveGuard();
}

function announce(route: Route): void {
  current = route;
  // Ein Editor, der gerade verlassen wurde, darf den nächsten nicht bremsen.
  leaveGuard = null;
  for (const fn of handlers) void fn(route);
}

export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  void (async () => {
    if (sameRoute(route, current)) return;
    if (!(await mayLeave())) return;

    const hash = routeToHash(route);
    if (opts.replace) {
      history.replaceState({ adm: hash }, '', hash);
    } else {
      history.pushState({ adm: hash }, '', hash);
    }
    announce(route);
  })();
}

export function onRoute(handler: (r: Route) => void | Promise<void>): void {
  handlers.add(handler);
}

/** Editor meldet an, ob gerade ungespeicherte Änderungen bestehen. */
export function setLeaveGuard(fn: null | (() => Promise<boolean>)): void {
  leaveGuard = fn;
}

export function start(): void {
  if (started) return;
  started = true;

  window.addEventListener('popstate', () => {
    if (repairing) {
      repairing = false;
      return;
    }
    const target = parseRoute(location.hash);
    if (sameRoute(target, current)) return;

    const previous = routeToHash(current);
    void (async () => {
      if (await mayLeave()) {
        announce(target);
        return;
      }
      // Abgelehnt: die vorige Adresse zurück auf den Stapel legen. Der
      // Vorwärts-Eintrag geht dabei verloren, dafür bleibt die Anzeige
      // ehrlich zu dem, was auf dem Schirm steht.
      repairing = true;
      history.pushState({ adm: previous }, '', previous);
    })();
  });

  const initial = parseRoute(location.hash);
  const hash = routeToHash(initial);
  history.replaceState({ adm: hash }, '', hash);
  announce(initial);
}
