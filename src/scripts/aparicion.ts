/**
 * Die Reveals: `[data-reveal]` steigt beim Hereinscrollen ein.
 *
 * Das hing bis eben an GSAP — ein `fromTo` je Element plus ein ScrollTrigger.
 * Für eine Bewegung aus zwei Eigenschaften (Versatz und Deckkraft) ist das
 * ein 140-kB-Werkzeug, und es band ausgerechnet die Überschrift des Heros an
 * ein Modul, dessen Auswertung auf einem gedrosselten Gerät ~350 ms am Stück
 * kostet. Der Hero stand dadurch fertig da, aber ohne Text.
 *
 * Beobachter plus CSS-Transition kann dasselbe, kostet nichts und läuft,
 * sobald das Papier der Apertura hochgeht. Die Kurve in `global.css` ist
 * `power3.out` nachempfunden, die Auslöselinie (`start: 'top 88%'`) steckt
 * jetzt im `rootMargin`: −12 % zieht die untere Kante des Sichtfelds auf
 * 88 % der Fensterhöhe hoch, und genau dort schaltet der Beobachter.
 *
 * `once` bleibt `once`: was einmal da ist, verschwindet nicht wieder.
 */

/** Entspricht `start: 'top 88%'` aus der früheren ScrollTrigger-Fassung. */
const MARGEN = '0px 0px -12% 0px';

export function iniciarAparicion() {
  const elementos = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (elementos.length === 0) return;

  const mostrar = (el: Element) => el.classList.add('se-ve');

  /* Ohne Beobachter (sehr alte Browser) steht alles sofort da. Lieber ohne
     Auftritt als unsichtbar. */
  if (typeof IntersectionObserver === 'undefined') {
    elementos.forEach(mostrar);
    return;
  }

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        mostrar(entrada.target);
        observador.unobserve(entrada.target);
      }
    },
    { rootMargin: MARGEN },
  );

  for (const el of elementos) observador.observe(el);
}
