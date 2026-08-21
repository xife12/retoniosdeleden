/**
 * Aquarell-Glyphen der Lehmhaeuser: Faktenzeile, Ausstattung und Highlights.
 * Wie der Themenkatalog bewusst im Code -- die Nutzerin waehlt im Backend nur
 * den Schluessel, die Zeichnung selbst ist ein gestaltetes Asset.
 *
 * Setzt die globalen Aquarell-Filter und Pigment-Verlaeufe voraus
 * (wc-wash, wc-soft, wc-rough, ink, pg-*). viewBox jeweils 0 0 32 32.
 */
export type CasaGlyph =
  | 'bed' | 'guests' | 'area' | 'bedroom' | 'bath'
  | 'kitchen' | 'hammock' | 'stove' | 'solar' | 'rain'
  | 'hive' | 'tub' | 'stars' | 'lavender' | 'clay'
  | 'mirador' | 'wifi' | 'parking' | 'bbq' | 'fireplace';

export const casaGlyphs: Record<CasaGlyph, string> = {
  bed: `
    <path d="M4 24 L 4 13 C 4 11, 6 11, 8 11 L 26 11 C 28 11, 28 13, 28 15 L 28 24 Z" fill="#e9e4da" filter="url(#wc-soft)" />
    <rect x="7" y="13" width="9" height="6" rx="2.5" fill="url(#pg-cielo)" filter="url(#wc-rough)" />
    <path d="M4 19 L 28 19" stroke="#a07f4a" stroke-width="2.6" filter="url(#ink)" />
    <path d="M5 24 L 5 28 M 27 24 L 27 28" stroke="#a07f4a" stroke-width="2.4" stroke-linecap="round" filter="url(#ink)" />`,
  guests: `
    <circle cx="12" cy="10" r="5" fill="url(#pg-miel)" filter="url(#wc-rough)" />
    <path d="M3 27 C 4 18, 20 18, 21 27 Z" fill="url(#pg-miel)" opacity="0.75" filter="url(#wc-soft)" />
    <circle cx="23" cy="13" r="4" fill="url(#pg-barro)" filter="url(#wc-rough)" />
    <path d="M16 27 C 17 20, 29 20, 30 27 Z" fill="url(#pg-barro)" opacity="0.6" filter="url(#wc-soft)" />`,
  area: `
    <rect x="5" y="6" width="22" height="20" rx="3" fill="#eef1e2" stroke="#7a8b5a" stroke-width="2" stroke-dasharray="4 4" filter="url(#ink)" />
    <path d="M9 16 L 23 16 M 9 16 L 12.5 12.5 M 9 16 L 12.5 19.5 M 23 16 L 19.5 12.5 M 23 16 L 19.5 19.5"
      stroke="#3f4f30" stroke-width="1.8" stroke-linecap="round" fill="none" filter="url(#ink)" />`,
  bedroom: `
    <path d="M6 27 L 6 8 L 26 5 L 26 27 Z" fill="#e9e4da" filter="url(#wc-soft)" />
    <path d="M6 27 L 6 8 L 26 5 L 26 27" fill="none" stroke="#33291f" stroke-width="1.6" opacity="0.4" filter="url(#ink)" />
    <rect x="12" y="12" width="9" height="15" rx="2" fill="none" stroke="#a4444a" stroke-width="2.4" filter="url(#ink)" />
    <circle cx="19" cy="20" r="1.4" fill="#a4444a" />`,
  bath: `
    <path d="M16 3 L 16 9" stroke="#8a7b68" stroke-width="2.4" stroke-linecap="round" filter="url(#ink)" />
    <path d="M8 13 C 9 8, 23 8, 24 13 Z" fill="url(#pg-cielo)" filter="url(#wc-rough)" />
    <g stroke="#7fb0c9" stroke-width="2.2" stroke-linecap="round" filter="url(#ink)">
      <path d="M11 17 L 10 23" /><path d="M16 17 L 15 26" /><path d="M21 17 L 20 22" />
    </g>`,
  kitchen: `
    <path d="M7 16 L 25 16 L 23 26 C 21.5 27.5, 10.5 27.5, 9 26 Z" fill="url(#pg-barro)" filter="url(#wc-soft)" />
    <path d="M5 16 L 27 16" stroke="#8f4c31" stroke-width="2.8" stroke-linecap="round" filter="url(#ink)" />
    <path d="M12 12 C 14 9, 11 7, 13 4 M 20 12 C 22 9, 19 7, 21 4"
      stroke="#b1d3e3" stroke-width="2" stroke-linecap="round" fill="none" filter="url(#ink)" />`,
  hammock: `
    <path d="M5 5 L 5 27 M 27 5 L 27 27" stroke="#a07f4a" stroke-width="2.6" stroke-linecap="round" filter="url(#ink)" />
    <path d="M5 12 C 10 25, 22 25, 27 12" stroke="#f3c87f" stroke-width="4.6" stroke-linecap="round" fill="none" filter="url(#ink)" />
    <path d="M8 14 C 12 21, 20 21, 24 14" stroke="#e8a13d" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.7" filter="url(#ink)" />`,
  stove: `
    <path d="M8 27 L 8 15 C 8 8, 24 8, 24 15 L 24 27 Z" fill="url(#pg-barro)" filter="url(#wc-soft)" />
    <path d="M20.5 9 L 20.5 3" stroke="#8f4c31" stroke-width="2.6" stroke-linecap="round" filter="url(#ink)" />
    <path d="M13 24 C 12 20, 16 20, 15 14 C 19 17, 20.5 21, 18.5 24 Z" fill="url(#pg-miel)" filter="url(#wc-rough)" />`,
  solar: `
    <circle cx="10" cy="9" r="5" fill="url(#pg-sol)" filter="url(#wc-rough)" />
    <g stroke="#e8a13d" stroke-width="1.8" stroke-linecap="round" filter="url(#ink)">
      <path d="M10 1.5 L 10 3.5 M 2 9 L 4 9 M 4.4 3.4 L 5.8 4.8" />
    </g>
    <path d="M9 26 L 13 17 L 29 17 L 27 26 Z" fill="url(#pg-cielo)" filter="url(#wc-soft)" />
    <path d="M14.6 17 L 12.6 26 M 19.6 17 L 18.2 26 M 24.6 17 L 23.7 26"
      stroke="#5c4f40" stroke-width="1.4" opacity="0.5" filter="url(#ink)" />`,
  rain: `
    <path d="M7 13 C 6 8, 14 5, 17.5 9 C 22.5 8, 26 12, 24 16 L 8 16 C 6 16, 6 14, 7 13 Z" fill="#d9eaf2" filter="url(#wc-soft)" />
    <g stroke="#7fb0c9" stroke-width="2.2" stroke-linecap="round" filter="url(#ink)">
      <path d="M11 19 L 10 22" /><path d="M16 19 L 15 23" /><path d="M21 19 L 20 22" />
    </g>
    <path d="M9 28 L 10 24 L 23 24 L 24 28 Z" fill="url(#pg-barro)" opacity="0.85" filter="url(#wc-rough)" />`,
  hive: `
    <path d="M7 25 L 7 12 L 25 12 L 25 25 Z" fill="#e8d5b8" filter="url(#wc-soft)" />
    <path d="M7 17 L 25 17 M 7 21.5 L 25 21.5" stroke="#a07f4a" stroke-width="1.8" filter="url(#ink)" />
    <path d="M4.5 12 L 27.5 12 L 24 7.5 L 8 7.5 Z" fill="#8a6f4d" filter="url(#wc-rough)" />
    <rect x="13" y="22.5" width="6" height="2.5" fill="#5c4a3a" />
    <ellipse cx="26" cy="28" rx="3.4" ry="2.4" fill="url(#pg-miel)" filter="url(#wc-rough)" />`,
  tub: `
    <path d="M5 15 L 27 15 L 24 26 C 22 28, 10 28, 8 26 Z" fill="#c9a86a" filter="url(#wc-soft)" />
    <path d="M6.5 18.5 C 12 16.5, 20 16.5, 25.5 18.5" stroke="#7fb0c9" stroke-width="3" fill="none" filter="url(#ink)" />
    <path d="M10 15 L 10 26 M 16 15 L 16 27 M 22 15 L 22 26" stroke="#a07f4a" stroke-width="1.3" opacity="0.55" filter="url(#ink)" />
    <path d="M11 12 C 13 9, 10 7, 12 3.5 M 20 12 C 22 9, 19 7, 21 3.5"
      stroke="#b1d3e3" stroke-width="2" stroke-linecap="round" fill="none" filter="url(#ink)" />`,
  stars: `
    <path d="M7 27 L 7 13 C 7 5, 25 5, 25 13 L 25 27 Z" fill="#3d4a63" filter="url(#wc-soft)" />
    <path d="M7 27 L 7 13 C 7 5, 25 5, 25 13 L 25 27" fill="none" stroke="#a4444a" stroke-width="2.6" filter="url(#ink)" />
    <g fill="#fdf3e0">
      <circle cx="12" cy="13" r="1.5" /><circle cx="19.5" cy="10.5" r="1.1" />
      <circle cx="16" cy="18" r="1.7" /><circle cx="21" cy="21" r="1.1" /><circle cx="11" cy="22" r="1.2" />
    </g>`,
  lavender: `
    <path d="M16 28 C 17 21, 15 15, 17 9" stroke="#5b6c42" stroke-width="2.2" stroke-linecap="round" filter="url(#ink)" fill="none" />
    <ellipse cx="17" cy="8" rx="4" ry="7" fill="url(#pg-lavanda)" filter="url(#wc-rough)" />
    <ellipse cx="10" cy="17" rx="2.8" ry="5" transform="rotate(-28 10 17)" fill="url(#pg-lavanda)" opacity="0.8" filter="url(#wc-rough)" />
    <ellipse cx="23" cy="15" rx="2.8" ry="5" transform="rotate(24 23 15)" fill="url(#pg-lavanda)" opacity="0.8" filter="url(#wc-rough)" />`,
  clay: `
    <path d="M5 26 C 5 18, 11 14, 16 14 C 21 14, 27 18, 27 26 Z" fill="url(#pg-barro)" filter="url(#wc-soft)" />
    <path d="M10 14.5 L 7 6 M 16 13.5 L 17.5 4 M 22 15.5 L 26.5 8"
      stroke="#c9a86a" stroke-width="2" stroke-linecap="round" filter="url(#ink)" />
    <path d="M11 22 C 14 20, 19 20, 22 22" stroke="#8f4c31" stroke-width="1.6" opacity="0.6" fill="none" filter="url(#ink)" />`,
  mirador: `
    <path d="M1 27 C 8 19, 13 23, 19 14 C 23 8, 28 12, 31 9 L 31 28 L 1 28 Z" fill="url(#pg-pistacho)" opacity="0.55" filter="url(#wc-wash)" />
    <path d="M22 15 L 22 4" stroke="#a07f4a" stroke-width="2.4" stroke-linecap="round" filter="url(#ink)" />
    <path d="M22 5 L 30 7.5 L 22 10 Z" fill="url(#pg-miel)" filter="url(#wc-rough)" />
    <path d="M2 25 C 9 18, 13 22, 18 14" stroke="#3f4f30" stroke-width="1.6" opacity="0.45" fill="none" filter="url(#ink)" />`,
  // ---- Neu (Ausstattungs-Set erweitert, Entscheidung: "Vorschlag übernehmen") ----
  wifi: `
    <circle cx="16" cy="24" r="2.3" fill="#5b6c42" filter="url(#wc-rough)" />
    <path d="M9 18 C 13 14, 19 14, 23 18" stroke="#5b6c42" stroke-width="2.4" stroke-linecap="round" fill="none" filter="url(#ink)" />
    <path d="M4 12 C 11 5, 21 5, 28 12" stroke="#5b6c42" stroke-width="2.4" stroke-linecap="round" fill="none" opacity="0.65" filter="url(#ink)" />`,
  parking: `
    <path d="M4 22 L 6 13 C 7 10, 25 10, 26 13 L 28 22 Z" fill="url(#pg-barro)" filter="url(#wc-soft)" />
    <rect x="2" y="20" width="28" height="6" rx="3" fill="#8a7b68" filter="url(#wc-rough)" />
    <circle cx="9" cy="26" r="3" fill="#3a2c1c" />
    <circle cx="23" cy="26" r="3" fill="#3a2c1c" />
    <path d="M9 13.5 L 12 16 L 20 16 L 23 13.5" stroke="#5c4f40" stroke-width="1.4" fill="none" opacity="0.6" filter="url(#ink)" />`,
  bbq: `
    <ellipse cx="16" cy="24" rx="11" ry="4" fill="#3a2c1c" filter="url(#wc-rough)" />
    <path d="M6 24 C 6 20, 26 20, 26 24" stroke="#5c4a3a" stroke-width="1.6" fill="none" opacity="0.6" filter="url(#ink)" />
    <path d="M9 20 L 12 8 M 16 20 L 16 7 M 23 20 L 20 8" stroke="#8a7b68" stroke-width="1.6" stroke-linecap="round" filter="url(#ink)" />
    <path d="M13 19 C 11 15, 14 13, 12 9 C 17 12, 18 16, 15 19 Z" fill="url(#pg-miel)" filter="url(#wc-rough)" />
    <path d="M20 19 C 18 16, 20 14, 19 11 C 22 13, 23 16, 21 19 Z" fill="url(#pg-miel)" opacity="0.85" filter="url(#wc-rough)" />`,
  fireplace: `
    <path d="M9 27 L 9 11 C 9 6, 23 6, 23 11 L 23 27 Z" fill="url(#pg-barro)" filter="url(#wc-soft)" />
    <rect x="12" y="16" width="8" height="11" rx="2" fill="#3a2c1c" filter="url(#wc-rough)" />
    <path d="M14 24 C 13 21, 16 19, 14 16 C 18 18, 19 21, 17 24 Z" fill="url(#pg-miel)" filter="url(#wc-rough)" />
    <path d="M16 6 L 16 2" stroke="#8f4c31" stroke-width="2.2" stroke-linecap="round" filter="url(#ink)" />`
};

/**
 * Diese fuenf Glyphen belegt die Faktenzeile (Betten, Gaeste, Flaeche,
 * Schlafzimmer, Baeder) automatisch aus den Zahlenfeldern. Im Backend werden
 * sie deshalb aus der Auswahl fuer Ausstattung/Highlights herausgefiltert,
 * damit dieselbe Zeichnung nicht doppelt auf der Seite steht.
 */
export const factGlyphs: CasaGlyph[] = ['bed', 'guests', 'area', 'bedroom', 'bath'];

/** Beschriftung im Auswahlmenue des Backends -- erscheint nicht auf der Website. */
export const casaGlyphLabels: Record<CasaGlyph, { es: string; en: string }> = {
  bed: { es: 'Cama', en: 'Bed' },
  guests: { es: 'Huéspedes', en: 'Guests' },
  area: { es: 'Superficie', en: 'Area' },
  bedroom: { es: 'Dormitorio', en: 'Bedroom' },
  bath: { es: 'Baño', en: 'Bathroom' },
  kitchen: { es: 'Cocina', en: 'Kitchen' },
  hammock: { es: 'Hamaca', en: 'Hammock' },
  stove: { es: 'Estufa a leña', en: 'Wood stove' },
  solar: { es: 'Energía solar', en: 'Solar power' },
  rain: { es: 'Agua de lluvia', en: 'Rainwater' },
  hive: { es: 'Colmenas', en: 'Beehives' },
  tub: { es: 'Tina', en: 'Soaking tub' },
  stars: { es: 'Cielo estrellado', en: 'Starry sky' },
  lavender: { es: 'Lavanda', en: 'Lavender' },
  clay: { es: 'Barro', en: 'Clay' },
  mirador: { es: 'Mirador', en: 'Lookout' },
  wifi: { es: 'Wifi', en: 'Wi-Fi' },
  parking: { es: 'Estacionamiento', en: 'Parking' },
  bbq: { es: 'Parrilla', en: 'Barbecue' },
  fireplace: { es: 'Hogar a leña', en: 'Fireplace' },
};
