/**
 * Was von der Seite gerade nach außen sichtbar ist.
 *
 * `libroActivo` schaltet das interaktive Buch ("Luna y el secreto de la
 * colmena") als Ganzes: den Menüpunkt in der Navigation, die Einladung
 * unten in der Bienen-Sektion und die Travesía — den Papier-Übergang, der
 * nur zwischen Startseite und Buchseite hin- und herführt.
 *
 * Es ist aus, weil am Buch noch zu viel offen ist und die Veröffentlichung
 * deshalb nach hinten geschoben wurde. Archiviert, nicht gelöscht: die
 * Komponenten unter `src/components/libro/`, die Seitendaten in
 * `src/data/libro.ts`, die Erzählstimmen unter `public/voz/` und die
 * Mini-Spiele liegen unverändert weiter im Projekt.
 *
 * Zum Wiedereinschalten zwei Handgriffe:
 *   1. hier auf `true` setzen;
 *   2. `src/pages/es/_libro.astro` und `src/pages/en/_book.astro` zurück
 *      nach `libro.astro` bzw. `book.astro` umbenennen. Astro erzeugt für
 *      Dateien mit `_` am Anfang bewusst keine Route — ohne diesen zweiten
 *      Schritt zeigen die wieder eingeblendeten Links ins Leere.
 */
export const libroActivo = false;
