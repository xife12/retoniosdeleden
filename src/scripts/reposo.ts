/**
 * Dauerschleifen ruhen, solange sie niemand sieht.
 *
 * Die Seite ist ein einziges langes Dokument, und überall darin laufen
 * Endlosanimationen: Melis Flügelschlag, ihr Schweben, die Funken im
 * Zeitstrahl, das Wandern der Verwendungs-Liste, der Wink an der Nuss.
 * Jede einzelne ist klein. Zusammen halten sie den Hauptthread ununterbrochen
 * beschäftigt — gemessen (4× gedrosselt, Seite still am Kopf des Dokuments)
 * liefen 13 Endlosanimationen gleichzeitig, sechs davon zwischen 3,6 und 22,8
 * Bildschirmhöhen außerhalb des Sichtfelds.
 *
 * Teuer sind sie, weil sie fast alle SVG anfassen: SVG-Transforms gehen in
 * Blink nicht über den Compositor, sondern durch das Layout, und in beinahe
 * jeder Form dieses Projekts steckt ein feTurbulence-Aquarellfilter, der
 * dabei neu gerastert wird. Ein Flügelschlag zwanzig Bildschirme weiter unten
 * kostet also genauso viel wie einer im Bild.
 *
 * Statt jede Animation einzeln zu benennen — eine Liste, die beim nächsten
 * neuen Effekt schon wieder unvollständig wäre — fragt dieses Modul den
 * Browser: `getAnimations()` nennt alles, was gerade läuft. Was sich
 * unendlich wiederholt, ist Zierde und darf ruhen; alles Endliche
 * (Apertura, Reveals, Übergänge) wird nicht angefasst.
 *
 * Angehalten wird über eine einzige Klasse, nicht über die WAAPI: CSS und
 * `Animation.pause()` streiten sich sonst um denselben Schalter, sobald ein
 * Stilwechsel dazwischenkommt. Fortgesetzt wird dort, wo angehalten wurde —
 * eine Biene nimmt den Flügelschlag mitten in der Bewegung wieder auf.
 *
 * Ohne `getAnimations` (sehr alte Browser) passiert gar nichts, und alles
 * läuft wie vorher.
 */

/** Vorlauf, damit nichts mit stehendem Bild ins Sichtfeld scrollt. */
const MARGEN = '50% 0px 50% 0px';

/** Sammelt die Ziele erst, wenn die Seite steht — vorher fehlen die meisten. */
export function iniciarReposo() {
  if (typeof IntersectionObserver === 'undefined' || typeof document.getAnimations !== 'function') {
    return;
  }

  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        entrada.target.classList.toggle('fuera-de-vista', !entrada.isIntersecting);
      }
    },
    { rootMargin: MARGEN },
  );

  const vistos = new WeakSet<Element>();

  const recoger = () => {
    for (const animacion of document.getAnimations()) {
      /* Nur Zierde: was ein Ende hat, erzählt etwas und wird nie angehalten. */
      if (animacion.effect?.getTiming().iterations !== Infinity) continue;

      const destino = (animacion.effect as KeyframeEffect).target;
      if (!destino || vistos.has(destino)) continue;

      vistos.add(destino);
      observador.observe(destino);
    }
  };

  recoger();

  /* Zweiter Durchgang, sobald die Schriften stehen: manche Schleife startet
     erst mit ihrem Element (Bilder, nachgeladene Teile des Buches). */
  document.fonts?.ready.then(recoger);
}
