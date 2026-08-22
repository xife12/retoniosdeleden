import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vervollständigt die von Astro erzeugte Content-Security-Policy in jeder
 * gebauten Seite (PLAN-SICHERHEIT.md, Befund B5).
 *
 * Astros `experimental.csp` nimmt die Hauptarbeit ab -- es berechnet die
 * Hashes seiner eigenen gebündelten Skripte pro Seite. Zwei Lücken bleiben,
 * beide im Browser nachgemessen, nicht vermutet:
 *
 * 1. **`is:inline`-Skripte werden nicht gehasht.** Astro fasst sie
 *    absichtlich nicht an -- genau deshalb benutzt man sie. Das Projekt hat
 *    drei davon (Base.astro: no-js/reduced-motion, Apertura.astro:
 *    sessionStorage-Vorgriff, Travesia.astro), und alle drei müssen früh und
 *    unverzögert laufen; als gebündeltes Modul kämen sie zu spät und die
 *    Auflage blitzte beim Zurückkommen aus dem Buch auf. Ohne diese
 *    Ergänzung blockiert die CSP sie: in der Konsole stand
 *    "Executing inline script violates the following Content Security Policy
 *    directive", und der Vorgriff aus Apertura.astro lief nicht mehr.
 *
 * 2. **`style-src-attr` fehlt.** Die Seite setzt an rund neunzig Stellen
 *    echte `style="..."`-Attribute (Nav, Logo, Timeline, WatercolorDefs,
 *    Herbario, Pistacho, BeeMeli: Positionierung, CSS-Variablen pro Element,
 *    SVG-Filter). Der naheliegende Griff -- `'unsafe-inline'` in `style-src`
 *    -- ist wirkungslos: Astro trägt dort immer mindestens eine Hash-Quelle
 *    ein (`trackStyleHashes` schreibt selbst bei leerem Stylesheet den Hash
 *    des leeren Strings hinein), und sobald IRGENDEINE Hash-Quelle in einer
 *    Direktive steht, ignorieren Browser `'unsafe-inline'` für die gesamte
 *    Direktive. Das ist kein Fehler, sondern Absicht der CSP-Spezifikation --
 *    sonst liesse sich ein Hash-Allowlist trivial umgehen. `style-src-attr`
 *    regelt ausschliesslich die Attribute, enthält keine Hash-Quelle, und
 *    dort wirkt `'unsafe-inline'` deshalb. Ohne diesen Eintrag verliert die
 *    Seite still ihr halbes Layout, während in der Konsole nur eine Notiz
 *    steht.
 *
 * Warum als Build-Hook und nicht in der Konfiguration
 * --------------------------------------------------
 * `experimental.csp.directives` prüft gegen eine feste Liste erlaubter
 * Direktiven (ALLOWED_DIRECTIVES in astro/dist/core/csp/config.js);
 * `style-src-attr` steht nicht darauf, weil Astro alles rund um `style-src`
 * über `styleDirective` selbst verwaltet -- und das kennt keine
 * Attribut-Variante. Die Skript-Hashes liessen sich zwar über
 * `scriptDirective.hashes` von Hand eintragen, wären dann aber bei jeder
 * Textänderung an einem dieser drei Skripte still veraltet. Hier werden sie
 * aus dem fertigen Ergebnis berechnet und können deshalb gar nicht
 * auseinanderlaufen.
 *
 * Sicherheitsabwägung
 * -------------------
 * Gehasht wird ausschliesslich, was zur Bauzeit im eigenen Ergebnis steht --
 * genau das, was Astro für seine eigenen Skripte ohnehin tut. Entscheidend
 * ist, was NICHT dazukommt: `'unsafe-inline'` bleibt aus `script-src`
 * draussen. Ein zur Laufzeit eingeschleustes Skript hat keinen passenden
 * Hash und wird weiterhin blockiert -- und darum geht es bei dieser CSP.
 *
 * Sollte Astro `is:inline` eines Tages mithashen und `style-src-attr`
 * unterstützen, gehört diese Integration ersatzlos gelöscht.
 */
const STYLE_ATTR = "style-src-attr 'unsafe-inline'";

// Astro schreibt das Meta-Tag mit doppelten Anführungszeichen und
// kleingeschriebenem http-equiv. Der Inhalt enthält nur einfache
// Anführungszeichen ('self', 'sha256-...'), kollidiert also nicht.
const META = /(<meta\s+http-equiv="content-security-policy"\s+content=")([^"]*)(")/i;

// Inline-Skripte: alles ohne src-Attribut. Nicht-gierig bis zum ersten
// </script> -- so parsen Browser es auch.
const INLINE_SKRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

// Astro erzeugt für jeden Eintrag unter `redirects` eine Stub-Seite aus
// nichts als einem Meta-Refresh -- kein Skript, kein Style, nichts zu
// schützen. Die zählt nicht als fehlende CSP, sonst warnt der Build bei
// jedem Lauf grundlos, und eine Warnung, die immer kommt, liest niemand mehr.
const WEITERLEITUNG = /<meta\s+http-equiv="refresh"/i;

function sha256(text) {
  return `sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}`;
}

async function htmlDateien(verzeichnis) {
  const eintraege = await readdir(verzeichnis, { withFileTypes: true });
  const gefunden = [];

  for (const eintrag of eintraege) {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) gefunden.push(...(await htmlDateien(pfad)));
    else if (eintrag.name.endsWith('.html')) gefunden.push(pfad);
  }

  return gefunden;
}

/** Fehlende Hashes in die bestehende script-src-Direktive einfügen. */
function skriptHashesErgaenzen(csp, fehlende) {
  if (fehlende.length === 0) return csp;
  const zusatz = fehlende.map((h) => `'${h}'`).join(' ');

  if (/(^|;)\s*script-src\s/.test(csp)) {
    return csp.replace(/((^|;)\s*script-src\b)([^;]*)/i, `$1$3 ${zusatz}`);
  }
  // Ohne script-src greift default-src -- dann eine eigene Direktive
  // aufmachen, statt die Hashes ins Leere zu schreiben.
  return `${csp.replace(/;\s*$/, '')};script-src 'self' ${zusatz}`;
}

export default function cspErgaenzen() {
  return {
    name: 'csp-ergaenzen',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        // fileURLToPath statt dir.pathname: unter Windows liefert pathname
        // "/D:/.../retonos%20del%20eden/dist/" -- mit führendem Schrägstrich
        // und prozentkodierten Leerzeichen, was readdir nicht findet.
        const dateien = await htmlDateien(fileURLToPath(dir));
        let bearbeitet = 0;
        let hashesGesamt = 0;
        const ohneCsp = [];

        for (const datei of dateien) {
          const inhalt = await readFile(datei, 'utf-8');
          const treffer = inhalt.match(META);

          if (!treffer) {
            if (!WEITERLEITUNG.test(inhalt)) ohneCsp.push(datei);
            continue;
          }

          const [ganz, vorn, alteCsp, hinten] = treffer;
          let csp = alteCsp;

          // 1) Hashes aller Inline-Skripte, die noch nicht drinstehen.
          const fehlende = [];
          for (const [, quelltext] of inhalt.matchAll(INLINE_SKRIPT)) {
            const hash = sha256(quelltext);
            if (!csp.includes(hash) && !fehlende.includes(hash)) fehlende.push(hash);
          }
          csp = skriptHashesErgaenzen(csp, fehlende);
          hashesGesamt += fehlende.length;

          // 2) style-src-attr. Idempotent -- ein zweiter Lauf ändert nichts.
          if (!csp.includes('style-src-attr')) {
            csp = `${csp.replace(/;\s*$/, '')};${STYLE_ATTR}`;
          }

          if (csp !== alteCsp) {
            await writeFile(datei, inhalt.replace(ganz, `${vorn}${csp}${hinten}`), 'utf-8');
            bearbeitet += 1;
          }
        }

        // Eine Seite ohne CSP wäre ein stiller Ausfall des ganzen Schutzes --
        // deshalb laut, nicht als Nebensatz.
        if (ohneCsp.length > 0) {
          logger.warn(
            `${ohneCsp.length} Seite(n) ohne Content-Security-Policy gebaut ` +
              `(${ohneCsp.join(', ')}). Ist experimental.csp noch aktiv?`,
          );
        }
        logger.info(
          `CSP ergaenzt in ${bearbeitet} Seite(n): ${hashesGesamt} Hash(es) fuer ` +
            'is:inline-Skripte, style-src-attr fuer die style-Attribute.',
        );
      },
    },
  };
}
