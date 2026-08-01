/**
 * Anlauf der Startseite — was wann geladen wird.
 *
 * Der Befund, der diese Datei erklärt: Auf einem 4× gedrosselten Gerät
 * blockierte der erste Seitenaufbau den Hauptthread rund 660 ms, davon
 * ~350 ms am Stück allein für das Auswerten des GSAP-Bündels (Kern +
 * ScrollTrigger + MotionPathPlugin, zusammen ~140 kB). Dieser Block fiel
 * mitten in die Apertura: Der Ring zeichnete sich, während nichts lief.
 * Genau das war das Ruckeln beim ersten Laden.
 *
 * Also in zwei Lagen:
 *
 *  · **Sofort** — die Reveals. Ein Beobachter und etwas CSS, zusammen unter
 *    1 kB. Der Hero steht damit vollständig, sobald das Papier hochgeht,
 *    ganz ohne GSAP. (Der Flügelschlag wird in `Base.astro` scharfgestellt,
 *    weil ihn jede Seite braucht, nicht nur diese.)
 *  · **Nach der Apertura** — die Scroll-Choreografie (Parallax, Melis
 *    Kartenflug, Vignetten, Begleit-Meli). Vorher gibt es dafür nichts zu
 *    tun: Der Hero füllt den Schirm, gescrollt hat noch niemand.
 *
 * Wer wenig Bewegung will, bekommt GSAP gar nicht erst. Die Choreografie
 * hätte sich ohnehin sofort wieder abgeschaltet — 140 kB für ein `return`.
 *
 * Drei Auslöser holen das Modul, der erste gewinnt:
 *   · die Apertura meldet sich ab (`apertura:fin`)
 *   · der Nutzer scrollt oder tippt — dann ist die Apertura übersprungen
 *     und die Choreografie wird sofort gebraucht
 *   · Notbremse nach LIMITE ms, falls das Ereignis je verloren geht
 */
import { iniciarAparicion } from './aparicion';

/** Spätestens dann wird geladen, Apertura hin oder her. */
const LIMITE = 4000;

const raiz = document.documentElement;

/* ---------- Sofort: was den ersten Eindruck trägt ---------- */

iniciarAparicion();

/* ---------- Später: die Scroll-Choreografie ---------- */

const tranquilo = raiz.classList.contains('reduced-motion');

if (!tranquilo) {
  const despertadores = ['scroll', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

  let pedido = false;
  let reloj = 0;

  const cargar = () => {
    if (pedido) return;
    pedido = true;

    clearTimeout(reloj);
    removeEventListener('apertura:fin', cargar);
    for (const evento of despertadores) removeEventListener(evento, cargar);

    import('./scroll-story').catch(() => {
      /* Kommt die Choreografie nicht, bleibt die Seite trotzdem benutzbar:
         Reveals und Flügel hängen nicht daran, gescrollt wird nativ. Nur
         die Begleit-Meli fehlt — sie ist von Haus aus unsichtbar. */
    });
  };

  reloj = window.setTimeout(cargar, LIMITE);

  addEventListener('apertura:fin', cargar, { once: true });
  for (const evento of despertadores) {
    addEventListener(evento, cargar, { once: true, passive: true });
  }

  /* Keine Auflage zu erwarten — schon gesehen oder gar nicht erst gebaut:
     dann gibt es nichts abzuwarten. */
  if (raiz.classList.contains('apertura-aus') || !document.getElementById('apertura')) {
    cargar();
  }
}
