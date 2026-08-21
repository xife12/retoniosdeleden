/**
 * Themenkatalog der Workshops: Aquarell-Illustrationen, Karten-Icon und
 * Akzentfarbe. Bewusst im Code und nicht in der Datenbank -- die Bilder sind
 * gestaltete Assets, keine Inhalte, die die Nutzerin im Backend pflegt.
 * Im Backend waehlt sie nur den Schluessel (theme_id) aus diesem Katalog.
 *
 * Die SVGs setzen die Aquarell-Filter und Pigment-Verlaeufe aus dem
 * globalen <defs>-Block der Seite voraus (wc-wash, wc-soft, wc-rough, ink,
 * pg-miel, pg-lavanda, pg-pistacho, pg-barro, pg-cielo, pg-sol).
 */
export type ThemeId = 'bee' | 'lavender' | 'pistachio' | 'organic' | 'clay' | 'cielo' | 'semilla';

/** Akzentfarbe -- steuert Chip- und Rahmenfarbe der Karte. */
export type ThemeAccent = 'miel' | 'lavanda' | 'pistacho' | 'barro' | 'cielo';

export interface WorkshopTheme {
  accent: ThemeAccent;
  label: { es: string; en: string };
  /** Icon im Kartenkopf, viewBox 0 0 90 90. */
  cardIcon: string;
  /** Breites Kopfbild der Detailansicht, viewBox 0 0 320 150. */
  hero: string;
}

export const workshopThemes: Record<ThemeId, WorkshopTheme> = {
  bee: {
    accent: "miel",
    label: { es: "Abejas", en: "Bees" },
    cardIcon: `
      <ellipse cx="42" cy="52" rx="24" ry="17" fill="url(#pg-miel)" filter="url(#wc-rough)" />
      <path d="M32 36 L 34 68 M 46 34 L 48 70" stroke="#6b4a1f" stroke-width="6" filter="url(#wc-rough)" />
      <ellipse cx="36" cy="28" rx="17" ry="8" transform="rotate(-26 36 28)" fill="#d9eaf2" opacity="0.85" />
      <circle cx="66" cy="44" r="11" fill="#a06a2c" filter="url(#wc-rough)" />
      <circle cx="69" cy="42" r="2" fill="#33291f" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.5" />
      <circle cx="268" cy="32" r="24" fill="url(#pg-sol)" filter="url(#wc-wash)" />
      <g filter="url(#wc-wash)">
        <ellipse cx="26" cy="62" rx="36" ry="30" fill="#5b6c42" opacity="0.5" />
        <ellipse cx="84" cy="54" rx="32" ry="34" fill="#6d7f4d" opacity="0.55" />
        <ellipse cx="142" cy="62" rx="34" ry="28" fill="#5b6c42" opacity="0.45" />
        <ellipse cx="200" cy="56" rx="30" ry="31" fill="#6d7f4d" opacity="0.5" />
        <ellipse cx="258" cy="66" rx="34" ry="26" fill="#5b6c42" opacity="0.4" />
      </g>
      <path d="M0 88 C 72 80, 148 94, 226 86 C 268 82, 296 90, 320 84 L 320 150 L 0 150 Z" fill="#aebd8a" opacity="0.55" filter="url(#wc-wash)" />
      <g filter="url(#wc-rough)">
        <rect x="46" y="86" width="42" height="36" rx="4" fill="url(#pg-miel)" />
        <rect x="41" y="78" width="52" height="10" rx="4" fill="#b3761c" />
        <rect x="54" y="112" width="26" height="4" rx="2" fill="#8a5c14" opacity="0.65" />
        <rect x="112" y="94" width="34" height="28" rx="4" fill="url(#pg-miel)" opacity="0.92" />
        <rect x="108" y="87" width="42" height="9" rx="4" fill="#b3761c" opacity="0.92" />
      </g>
      <g filter="url(#wc-rough)">
        <ellipse cx="196" cy="112" rx="7" ry="16" fill="url(#pg-lavanda)" opacity="0.9" />
        <ellipse cx="218" cy="120" rx="6" ry="14" fill="url(#pg-lavanda)" opacity="0.8" />
        <ellipse cx="240" cy="110" rx="7" ry="17" fill="url(#pg-lavanda)" opacity="0.85" />
        <ellipse cx="262" cy="122" rx="6" ry="13" fill="url(#pg-lavanda)" opacity="0.75" />
        <ellipse cx="286" cy="112" rx="7" ry="16" fill="url(#pg-lavanda)" opacity="0.8" />
      </g>
      <g stroke="#5b6c42" stroke-width="2.4" stroke-linecap="round" filter="url(#ink)" opacity="0.65" fill="none">
        <path d="M196 150 C 197 134, 195 124, 196 116" />
        <path d="M218 150 C 219 138, 217 130, 218 124" />
        <path d="M240 150 C 241 132, 239 122, 240 114" />
        <path d="M262 150 C 263 140, 261 132, 262 126" />
        <path d="M286 150 C 287 134, 285 124, 286 116" />
      </g>
      <g stroke="#8a7b68" stroke-width="1.6" stroke-dasharray="3 5" fill="none" opacity="0.6" filter="url(#ink)">
        <path d="M104 66 C 124 48, 148 60, 168 42" />
        <path d="M156 96 C 176 84, 190 96, 208 84" />
      </g>
      <g>
        <g transform="translate(170,40) rotate(-12)">
          <ellipse cx="0" cy="0" rx="8" ry="5.4" fill="url(#pg-miel)" filter="url(#wc-rough)" />
          <path d="M-3 -4 L -2 4 M 2 -4 L 3 4" stroke="#6b4a1f" stroke-width="1.8" />
          <ellipse cx="-2" cy="-6.4" rx="6.4" ry="2.8" transform="rotate(-24 -2 -6.4)" fill="#d9eaf2" opacity="0.85" />
        </g>
        <g transform="translate(210,82) rotate(9)">
          <ellipse cx="0" cy="0" rx="6.4" ry="4.4" fill="url(#pg-miel)" filter="url(#wc-rough)" />
          <path d="M-2.4 -3.2 L -1.6 3.2 M 1.6 -3.2 L 2.4 3.2" stroke="#6b4a1f" stroke-width="1.5" />
          <ellipse cx="-1.6" cy="-5.2" rx="5.2" ry="2.2" transform="rotate(-22 -1.6 -5.2)" fill="#d9eaf2" opacity="0.85" />
        </g>
        <g transform="translate(100,64) rotate(-20)">
          <ellipse cx="0" cy="0" rx="5.6" ry="3.8" fill="url(#pg-miel)" filter="url(#wc-rough)" opacity="0.9" />
          <path d="M-2 -2.8 L -1.4 2.8 M 1.4 -2.8 L 2 2.8" stroke="#6b4a1f" stroke-width="1.4" />
          <ellipse cx="-1.4" cy="-4.6" rx="4.6" ry="2" transform="rotate(-22 -1.4 -4.6)" fill="#d9eaf2" opacity="0.8" />
        </g>
      </g>`
  },
  lavender: {
    accent: "lavanda",
    label: { es: "Lavanda", en: "Lavender" },
    cardIcon: `
      <path d="M45 76 C 46 58, 44 44, 46 26" stroke="#5b6c42" stroke-width="3.4" stroke-linecap="round" filter="url(#ink)" fill="none" />
      <ellipse cx="46" cy="24" rx="9" ry="17" fill="url(#pg-lavanda)" filter="url(#wc-rough)" />
      <ellipse cx="34" cy="46" rx="6" ry="11" transform="rotate(-28 34 46)" fill="url(#pg-lavanda)" opacity="0.8" filter="url(#wc-rough)" />
      <ellipse cx="58" cy="42" rx="6" ry="11" transform="rotate(24 58 42)" fill="url(#pg-lavanda)" opacity="0.8" filter="url(#wc-rough)" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.32" />
      <path d="M0 72 C 80 64, 150 78, 230 68 C 272 63, 298 72, 320 66 L 320 150 L 0 150 Z" fill="#dde4c8" opacity="0.7" filter="url(#wc-wash)" />
      <g filter="url(#wc-soft)" opacity="0.8">
        <ellipse cx="42" cy="52" rx="25" ry="19" fill="url(#pg-pistacho)" />
        <ellipse cx="106" cy="46" rx="22" ry="17" fill="url(#pg-pistacho)" />
        <ellipse cx="168" cy="52" rx="20" ry="16" fill="url(#pg-pistacho)" />
      </g>
      <g stroke="#6b5335" stroke-width="4" stroke-linecap="round" filter="url(#ink)">
        <path d="M42 74 L 42 56 M 106 70 L 106 50 M 168 74 L 168 56" />
      </g>
      <g filter="url(#wc-rough)">
        <path d="M0 104 C 60 96, 130 100, 198 92 L 198 104 C 130 112, 60 108, 0 116 Z" fill="url(#pg-lavanda)" opacity="0.8" />
        <path d="M0 130 C 70 122, 140 126, 206 116 L 206 130 C 140 140, 70 136, 0 144 Z" fill="url(#pg-lavanda)" opacity="0.65" />
      </g>
      <g stroke="#5b6c42" stroke-width="2" stroke-linecap="round" opacity="0.55" filter="url(#ink)" fill="none">
        <path d="M24 118 L 24 108 M 62 116 L 62 106 M 100 113 L 100 103 M 138 110 L 138 100" />
      </g>
      <g filter="url(#wc-rough)" transform="translate(232,68)">
        <path d="M0 48 L 0 20 C 0 7, 42 7, 42 20 L 42 48 Z" fill="url(#pg-barro)" />
        <ellipse cx="21" cy="20" rx="21" ry="7.5" fill="#dfa98c" />
        <path d="M21 12 C 21 1, 33 -1, 36 -10" stroke="#b3761c" stroke-width="4.5" fill="none" stroke-linecap="round" />
        <path d="M4 34 L 38 34" stroke="#9e5636" stroke-width="2.4" opacity="0.7" />
      </g>
      <g stroke="#f7efdd" stroke-width="2.4" stroke-linecap="round" opacity="0.7" fill="none" filter="url(#ink)">
        <path d="M264 52 C 270 44, 262 38, 268 30" />
        <path d="M278 56 C 284 48, 276 42, 282 34" />
      </g>
      <g filter="url(#wc-rough)" transform="translate(272,116)">
        <rect x="0" y="4" width="30" height="18" rx="5" fill="#f1eef8" />
        <rect x="8" y="-6" width="28" height="16" rx="5" fill="#e0dbf0" />
        <path d="M14 2 C 18 -2, 24 -2, 28 2" stroke="#9b8ec4" stroke-width="1.8" fill="none" stroke-linecap="round" />
      </g>`
  },
  pistachio: {
    accent: "pistacho",
    label: { es: "Pistacho", en: "Pistachio" },
    cardIcon: `
      <ellipse cx="45" cy="48" rx="24" ry="29" fill="#e8d5b8" filter="url(#wc-soft)" />
      <path d="M45 19 C 31 25, 25 38, 26 52 C 27 65, 34 74, 45 77 Z" fill="#d9bd94" filter="url(#wc-rough)" />
      <ellipse cx="50" cy="48" rx="11" ry="20" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.32" />
      <path d="M0 60 C 60 52, 120 64, 190 56 C 240 50, 280 60, 320 54 L 320 150 L 0 150 Z" fill="#dde4c8" opacity="0.72" filter="url(#wc-wash)" />
      <g stroke="#aebd8a" stroke-width="3" opacity="0.65" filter="url(#ink)" fill="none">
        <path d="M0 96 C 90 88, 200 92, 320 80" />
        <path d="M0 120 C 90 112, 200 116, 320 102" />
      </g>
      <g filter="url(#wc-soft)" opacity="0.8">
        <ellipse cx="52" cy="58" rx="22" ry="17" fill="url(#pg-pistacho)" />
        <ellipse cx="120" cy="54" rx="19" ry="15" fill="url(#pg-pistacho)" />
        <ellipse cx="180" cy="58" rx="17" ry="13" fill="url(#pg-pistacho)" />
        <ellipse cx="232" cy="54" rx="15" ry="12" fill="url(#pg-pistacho)" />
      </g>
      <g stroke="#6b5335" stroke-width="3.4" stroke-linecap="round" filter="url(#ink)">
        <path d="M52 76 L 52 60 M 120 70 L 120 56 M 180 72 L 180 59 M 232 66 L 232 54" />
      </g>
      <ellipse cx="88" cy="132" rx="36" ry="12" fill="url(#pg-barro)" opacity="0.5" filter="url(#wc-wash)" />
      <path d="M88 132 C 89 118, 87 108, 88 96" stroke="#5b6c42" stroke-width="3.4" stroke-linecap="round" filter="url(#ink)" fill="none" />
      <g filter="url(#wc-rough)">
        <ellipse cx="72" cy="98" rx="13" ry="6.4" transform="rotate(-26 72 98)" fill="url(#pg-pistacho)" />
        <ellipse cx="104" cy="94" rx="13" ry="6.4" transform="rotate(22 104 94)" fill="url(#pg-pistacho)" />
        <ellipse cx="88" cy="84" rx="10" ry="6" fill="url(#pg-pistacho-light)" />
      </g>
      <g filter="url(#wc-rough)" transform="translate(100,108) rotate(8)">
        <rect x="0" y="0" width="36" height="17" rx="4" fill="#fdf3e0" stroke="#b3761c" stroke-width="1.6" />
        <path d="M7 6 H 28 M 7 11.5 H 21" stroke="#8a7b68" stroke-width="1.6" stroke-linecap="round" />
      </g>
      <g transform="translate(226,72)">
        <path d="M8 0 L 8 44" stroke="#8a6a3f" stroke-width="5" stroke-linecap="round" filter="url(#ink)" />
        <path d="M0 44 L 16 44 L 13 62 L 3 62 Z" fill="#b8b3a6" filter="url(#wc-rough)" />
        <path d="M2 -1 C 2 -9, 14 -9, 14 -1" stroke="#8a6a3f" stroke-width="5" fill="none" stroke-linecap="round" filter="url(#ink)" />
      </g>
      <g transform="translate(258,104)" filter="url(#wc-rough)">
        <rect x="0" y="8" width="30" height="26" rx="6" fill="url(#pg-miel)" />
        <path d="M30 14 L 48 8 L 52 12 L 34 22 Z" fill="url(#pg-miel)" />
        <path d="M6 8 C 10 -2, 22 -2, 26 8" stroke="#b3761c" stroke-width="4" fill="none" stroke-linecap="round" />
      </g>`
  },
  organic: {
    accent: "pistacho",
    label: { es: "Orgánico", en: "Organic" },
    cardIcon: `
      <path d="M22 66 C 34 60, 56 60, 68 66 L 64 74 L 26 74 Z" fill="url(#pg-barro)" opacity="0.7" filter="url(#wc-rough)" />
      <path d="M45 64 C 45 50, 44 42, 45 32" stroke="#5b6c42" stroke-width="3.4" stroke-linecap="round" filter="url(#ink)" fill="none" />
      <ellipse cx="36" cy="32" rx="12" ry="7" transform="rotate(-32 36 32)" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />
      <ellipse cx="55" cy="26" rx="12" ry="7" transform="rotate(28 55 26)" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />
      <circle cx="45" cy="45" r="26" fill="none" stroke="#7a8b5a" stroke-width="2.4" stroke-dasharray="5 6" opacity="0.6" filter="url(#ink)" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.28" />
      <path d="M0 56 C 70 50, 150 60, 230 52 C 268 48, 296 56, 320 52 L 320 80 L 0 80 Z" fill="#aebd8a" opacity="0.6" filter="url(#wc-wash)" />
      <path d="M0 76 C 80 70, 180 82, 320 72 L 320 100 L 0 104 Z" fill="#6b5335" opacity="0.7" filter="url(#wc-wash)" />
      <path d="M0 100 C 90 94, 190 106, 320 96 L 320 124 L 0 128 Z" fill="url(#pg-barro)" opacity="0.65" filter="url(#wc-wash)" />
      <path d="M0 124 C 90 118, 190 130, 320 120 L 320 150 L 0 150 Z" fill="#8f4c31" opacity="0.5" filter="url(#wc-wash)" />
      <g stroke="#f7efdd" stroke-width="2" opacity="0.55" fill="none" filter="url(#ink)" stroke-linecap="round">
        <path d="M74 78 C 72 92, 66 100, 58 112 M 74 78 C 78 94, 84 102, 92 114 M 74 88 C 68 94, 62 96, 56 98" />
        <path d="M198 76 C 196 90, 190 98, 184 110 M 198 76 C 204 90, 210 98, 216 108" />
      </g>
      <path d="M118 110 C 130 104, 138 116, 150 110 C 160 105, 166 112, 172 108" stroke="#dfa98c" stroke-width="7" stroke-linecap="round" fill="none" filter="url(#wc-rough)" />
      <circle cx="172" cy="106" r="1.4" fill="#8f4c31" />
      <g stroke="#5b6c42" stroke-width="3" stroke-linecap="round" fill="none" filter="url(#ink)">
        <path d="M74 78 C 72 64, 76 54, 74 42" />
        <path d="M198 76 C 200 62, 196 52, 198 40" />
        <path d="M136 80 C 134 68, 138 60, 136 50" />
      </g>
      <g filter="url(#wc-rough)">
        <circle cx="74" cy="38" r="11" fill="url(#pg-miel)" />
        <circle cx="74" cy="38" r="4" fill="#b3761c" />
        <circle cx="198" cy="36" r="10" fill="url(#pg-miel)" opacity="0.9" />
        <circle cx="198" cy="36" r="3.6" fill="#b3761c" />
        <ellipse cx="126" cy="48" rx="11" ry="6" transform="rotate(-28 126 48)" fill="url(#pg-pistacho)" />
        <ellipse cx="147" cy="44" rx="11" ry="6" transform="rotate(24 147 44)" fill="url(#pg-pistacho)" />
      </g>
      <g filter="url(#wc-rough)" opacity="0.8">
        <ellipse cx="250" cy="52" rx="6" ry="14" fill="url(#pg-lavanda)" />
        <ellipse cx="272" cy="58" rx="5" ry="12" fill="url(#pg-lavanda)" opacity="0.85" />
        <ellipse cx="294" cy="50" rx="6" ry="13" fill="url(#pg-lavanda)" opacity="0.8" />
      </g>
      <g transform="translate(24,48)">
        <path d="M6 0 L 6 40" stroke="#8a6a3f" stroke-width="5" stroke-linecap="round" filter="url(#ink)" />
        <path d="M-2 40 L 14 40 L 11 62 L 1 62 Z" fill="#b8b3a6" filter="url(#wc-rough)" />
      </g>`
  },
  clay: {
    accent: "barro",
    label: { es: "Barro", en: "Clay" },
    cardIcon: `
      <path d="M26 70 L 26 44 C 26 30, 64 30, 64 44 L 64 70 Z" fill="url(#pg-barro)" filter="url(#wc-soft)" />
      <path d="M20 46 C 34 28, 56 28, 70 46" stroke="#5b6c42" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.85" filter="url(#wc-rough)" />
      <rect x="40" y="54" width="12" height="16" rx="5" fill="#5c3a26" opacity="0.8" filter="url(#wc-rough)" />
      <path d="M66 64 L 78 52 M 74 48 L 82 56" stroke="#8a7b68" stroke-width="3" stroke-linecap="round" filter="url(#ink)" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.38" />
      <circle cx="44" cy="32" r="20" fill="url(#pg-sol)" filter="url(#wc-wash)" />
      <g filter="url(#wc-wash)" opacity="0.45">
        <ellipse cx="96" cy="46" rx="30" ry="30" fill="#5b6c42" />
        <ellipse cx="148" cy="40" rx="26" ry="28" fill="#6d7f4d" />
        <ellipse cx="290" cy="48" rx="32" ry="28" fill="#5b6c42" />
      </g>
      <path d="M0 100 C 80 94, 170 104, 250 96 C 286 92, 304 100, 320 96 L 320 150 L 0 150 Z" fill="#dde4c8" opacity="0.7" filter="url(#wc-wash)" />
      <path d="M122 62 L 186 32 L 250 62 Z" fill="#7a8b5a" opacity="0.9" filter="url(#wc-rough)" />
      <path d="M116 64 L 256 64" stroke="#5b6c42" stroke-width="5" stroke-linecap="round" filter="url(#ink)" />
      <path d="M132 100 L 132 78 C 158 73, 214 73, 240 78 L 240 100 Z" fill="url(#pg-barro)" filter="url(#wc-rough)" />
      <path d="M136 78 C 160 72, 208 72, 234 76 L 234 69 C 208 65, 162 65, 136 71 Z" fill="#dfa98c" opacity="0.92" filter="url(#wc-rough)" />
      <g fill="#8a6a3f" filter="url(#wc-rough)">
        <rect x="127" y="58" width="8" height="44" rx="2" />
        <rect x="181" y="56" width="8" height="46" rx="2" />
        <rect x="235" y="58" width="8" height="44" rx="2" />
      </g>
      <rect x="196" y="82" width="18" height="18" rx="3" fill="#5c3a26" opacity="0.6" filter="url(#wc-rough)" />
      <ellipse cx="62" cy="120" rx="48" ry="21" fill="#8a7b68" opacity="0.4" filter="url(#wc-wash)" />
      <ellipse cx="62" cy="115" rx="35" ry="14" fill="url(#pg-barro)" filter="url(#wc-rough)" />
      <g stroke="#e8a13d" stroke-width="2" stroke-linecap="round" opacity="0.75" filter="url(#ink)">
        <path d="M42 112 L 56 107 M 60 119 L 76 112 M 48 121 L 62 123 M 70 106 L 82 111" />
      </g>
      <g transform="translate(256,102)" filter="url(#wc-rough)">
        <path d="M0 0 L 26 0 L 22 28 L 4 28 Z" fill="#7fb0c9" opacity="0.85" />
        <path d="M2 0 C 6 -11, 20 -11, 24 0" stroke="#5c4f40" stroke-width="2.6" fill="none" />
      </g>
      <g transform="translate(296,98)">
        <path d="M0 0 L 14 8 L 4 20 L -6 12 Z" fill="#b8b3a6" filter="url(#wc-rough)" />
        <path d="M3 -2 L 9 -12" stroke="#8a6a3f" stroke-width="4" stroke-linecap="round" filter="url(#ink)" />
      </g>`
  },
  // ---- Neu, thematisch offen (Entscheidung: "neutrale Zusatzoptionen") ----
  // Vereinfachte Hero-Illustration statt bespoker Mehrschicht-Szene, damit
  // künftige Themen-Ergänzungen günstig bleiben. Wash-Hintergrund + Icon
  // zentriert, um den Kartenmittelpunkt (45,45) auf die Hero-Mitte (160,75)
  // skaliert.
  cielo: {
    accent: "cielo",
    label: { es: "Aire libre", en: "Outdoors" },
    cardIcon: `
      <circle cx="52" cy="34" r="18" fill="url(#pg-sol)" filter="url(#wc-wash)" />
      <path d="M20 58 C 18 48, 30 44, 36 50 C 42 42, 56 44, 56 54 C 64 52, 70 60, 64 66 L 22 66 C 14 66, 14 60, 20 58 Z" fill="url(#pg-cielo)" filter="url(#wc-soft)" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.45" />
      <g transform="translate(160,75) scale(1.6) translate(-45,-45)">
        <circle cx="52" cy="34" r="18" fill="url(#pg-sol)" filter="url(#wc-wash)" />
        <path d="M20 58 C 18 48, 30 44, 36 50 C 42 42, 56 44, 56 54 C 64 52, 70 60, 64 66 L 22 66 C 14 66, 14 60, 20 58 Z" fill="url(#pg-cielo)" filter="url(#wc-soft)" />
      </g>
      <path d="M0 128 C 80 120, 240 132, 320 122 L 320 150 L 0 150 Z" fill="#dde4c8" opacity="0.6" filter="url(#wc-wash)" />`
  },
  semilla: {
    accent: "pistacho",
    label: { es: "Semillero", en: "Nursery" },
    cardIcon: `
      <ellipse cx="45" cy="70" rx="30" ry="8" fill="url(#pg-barro)" opacity="0.6" filter="url(#wc-wash)" />
      <path d="M45 68 C 44 50, 46 38, 45 24" stroke="#5b6c42" stroke-width="3.4" stroke-linecap="round" filter="url(#ink)" fill="none" />
      <ellipse cx="34" cy="30" rx="10" ry="16" transform="rotate(-30 34 30)" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />
      <ellipse cx="56" cy="34" rx="10" ry="16" transform="rotate(28 56 34)" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />
      <ellipse cx="45" cy="70" rx="9" ry="6" fill="url(#pg-barro)" filter="url(#wc-rough)" />`,
    hero: `
      <rect width="320" height="150" fill="url(#pg-cielo)" opacity="0.3" />
      <path d="M0 118 C 80 110, 240 122, 320 112 L 320 150 L 0 150 Z" fill="#dde4c8" opacity="0.65" filter="url(#wc-wash)" />
      <g transform="translate(160,75) scale(1.6) translate(-45,-45)">
        <ellipse cx="45" cy="70" rx="30" ry="8" fill="url(#pg-barro)" opacity="0.6" filter="url(#wc-wash)" />
        <path d="M45 68 C 44 50, 46 38, 45 24" stroke="#5b6c42" stroke-width="3.4" stroke-linecap="round" filter="url(#ink)" fill="none" />
        <ellipse cx="34" cy="30" rx="10" ry="16" transform="rotate(-30 34 30)" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />
        <ellipse cx="56" cy="34" rx="10" ry="16" transform="rotate(28 56 34)" fill="url(#pg-pistacho)" filter="url(#wc-rough)" />
        <ellipse cx="45" cy="70" rx="9" ry="6" fill="url(#pg-barro)" filter="url(#wc-rough)" />
      </g>`
  }
};
