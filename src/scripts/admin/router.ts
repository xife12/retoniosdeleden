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
  | { view: 'casa'; id: string | 'nuevo' };

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
