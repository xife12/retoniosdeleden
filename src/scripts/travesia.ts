/**
 * Travesía — Steuerung des Übergangs zwischen Chacra und Buch.
 *
 * Die Auflage und das ganze Aussehen stecken in `Travesia.astro`. Hier
 * steht nur, *wann* sie läuft:
 *
 *   · Hinweg    — Klick auf den Buch-Link abfangen, Bahn und Landepunkt
 *                 ausrechnen, Animation spielen, dann navigieren.
 *   · Rückweg   — dasselbe vom Buch zurück, kürzer und ohne Bahn.
 *   · Ankunft   — läuft von allein über CSS (siehe Travesia.astro); hier
 *                 wird nur hinterher aufgeräumt.
 *
 * Drei Dinge, die dieser Bauart sonst regelmäßig das Genick brechen und
 * deshalb ausdrücklich behandelt sind:
 *
 * · **Der Nutzer wird nie festgehalten.** Ist die Zielseite nach `LIMITE`
 *   noch nicht da, wird trotzdem navigiert. Die Animation ist Beiwerk,
 *   nicht Bedingung.
 * · **Zurück-Taste.** Kommt die Seite aus dem bfcache, steht die Auflage
 *   noch im Endbild — voll deckendes Papier. Ohne das Aufräumen bei
 *   `pageshow` landet man auf einem leeren Schirm.
 * · **Mittelklick und „in neuem Tab öffnen"** müssen unangetastet
 *   durchgehen, sonst nimmt der Übergang dem Link seine Grundfunktion.
 */

type Rumbo = 'libro' | 'chacra';

const CLAVE = 're:travesia';

/** Nach so vielen ms wird auf jeden Fall navigiert, Animation hin oder her. */
const LIMITE = 900;

/** Landepunkt, in Anteilen des Fensters. Muss mit `Travesia.astro`
 *  übereinstimmen — dort sitzt die ankommende Meli auf denselben Werten,
 *  und genau daran hängt, dass die Naht nicht zu sehen ist. */
const DESTINO = { x: 0.5, y: 0.58 };

const raiz = document.documentElement;
const capa = document.getElementById('travesia');

const tranquilo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Ankunft: nur aufräumen, gelaufen ist sie schon ---------- */

if (raiz.classList.contains('travesia-llega') || raiz.classList.contains('travesia-vuelve')) {
  /* Etwas länger als die Auflösung (120 + 480 ms), damit nichts
     mittendrin wegspringt. */
  setTimeout(() => raiz.classList.remove('travesia-llega', 'travesia-vuelve'), 700);
}

/* ---------- Hinweg ---------- */

if (capa) {
  const papel = capa.querySelector<HTMLElement>('.travesia-papel');
  const svg = capa.querySelector<SVGSVGElement>('.travesia-senda');
  const puntos = capa.querySelector<SVGPathElement>('.travesia-puntos');
  const meli = capa.querySelector<HTMLElement>('.travesia-meli');

  /**
   * Wie weit der Kreis wachsen muss, um vom Landepunkt aus das ganze
   * Fenster zu decken: bis zur entferntesten Ecke, nicht weiter. Ein fester
   * Großwert (150vmax) deckte schon nach 40 % der Laufzeit alles zu.
   */
  const radioHastaLaEsquina = (x: number, y: number) => {
    const w = innerWidth;
    const h = innerHeight;
    return Math.ceil(
      Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y)),
    );
  };

  const situarFloracion = (x: number, y: number) => {
    papel?.style.setProperty('--tr-x', `${x}px`);
    papel?.style.setProperty('--tr-y', `${y}px`);
    papel?.style.setProperty('--tr-r', `${radioHastaLaEsquina(x, y)}px`);
  };

  const puedeVolar =
    typeof CSS !== 'undefined' && CSS.supports('offset-path', 'path("M0 0 L1 1")');

  let enCamino = false;

  /**
   * Die Bahn vom angeklickten Link zum Landepunkt: erst ein Stück
   * aufsteigen, dann absinken — der Flug einer Biene, die weiß, wohin sie
   * will, nicht die kürzeste Verbindung.
   */
  const trazarSenda = (desde: DOMRect) => {
    const w = innerWidth;
    const h = innerHeight;
    const sx = desde.left + desde.width / 2;
    const sy = desde.top + desde.height / 2;
    const ex = w * DESTINO.x;
    const ey = h * DESTINO.y;
    const dx = ex - sx;

    const d =
      `M ${sx} ${sy} ` +
      `C ${sx + dx * 0.3} ${sy - 60}, ` +
      `${sx + dx * 0.72} ${ey - 30}, ` +
      `${ex} ${ey}`;

    svg?.setAttribute('viewBox', `0 0 ${w} ${h}`);
    puntos?.setAttribute('d', d);

    if (meli) {
      if (puedeVolar) {
        meli.style.offsetPath = `path("${d}")`;
      } else {
        /* Ohne `offset-path` fliegt sie nicht mit — das Papier trägt den
           Übergang dann allein. Lieber eine Sache weniger als eine, die
           an der falschen Stelle steht. */
        meli.style.display = 'none';
      }
    }

    situarFloracion(ex, ey);
  };

  const partir = (destino: string, rumbo: Rumbo, origen: DOMRect) => {
    if (enCamino) return;
    enCamino = true;

    /* Der Zielseite sagen, dass sie empfangen soll. Wird dort im
       Vorgriff-Skript sofort wieder gelöscht. */
    try {
      sessionStorage.setItem(CLAVE, rumbo);
      /* Wer über die Travesía auf der Startseite ankommt, hat schon eine
         Animation gesehen. Die Apertura würde sich sonst darüberlegen. */
      if (rumbo === 'chacra') sessionStorage.setItem('re:apertura', 'vista');
    } catch {
      /* Ohne Speicher gibt es eben keine Ankunft, nur den Hinweg. */
    }

    if (rumbo === 'libro') {
      trazarSenda(origen);
      capa.classList.add('esta-activa', 'va-saliendo');
    } else {
      /* Zurück blüht das Papier dort auf, wo geklickt wurde — die Tür,
         die man gedrückt hat, geht auf. */
      situarFloracion(origen.left + origen.width / 2, origen.top + origen.height / 2);
      capa.classList.add('esta-activa', 'va-volviendo');
    }

    const espera = tranquilo() ? 200 : rumbo === 'libro' ? 640 : 400;
    setTimeout(() => {
      location.href = destino;
    }, Math.min(espera, LIMITE));
  };

  const enlaces: [string, Rumbo][] = [
    ['a.nav-libro, a.is-libro', 'libro'],
    ['a.libro-marca', 'chacra'],
  ];

  for (const [selector, rumbo] of enlaces) {
    for (const enlace of document.querySelectorAll<HTMLAnchorElement>(selector)) {
      enlace.addEventListener('click', (e) => {
        /* „In neuem Tab öffnen", Mittelklick und alles mit Zusatztaste
           bleibt unangetastet. */
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (enlace.target && enlace.target !== '_self') return;

        e.preventDefault();
        partir(enlace.href, rumbo, enlace.getBoundingClientRect());
      });
    }
  }

  /* Zurück aus dem bfcache: die Auflage steht sonst im Endbild und lässt
     einen auf einem leeren, papierfarbenen Schirm sitzen. */
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    enCamino = false;
    capa.classList.remove('esta-activa', 'va-saliendo', 'va-volviendo');
    raiz.classList.remove('travesia-llega', 'travesia-vuelve');
  });
}
