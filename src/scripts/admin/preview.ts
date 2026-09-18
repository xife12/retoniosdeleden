import { workshopThemes } from '../../data/workshop-themes';
import { casaGlyphs } from '../../data/casa-glyphs';
import { formatDate, formatPrice } from '../../data/workshops';
import { abejasEducanUI } from '../../data/modulos';
import { onTourUI } from '../../data/on-tour';
import type { CasaDraft, ModuloDraft, SeminarioDraft, WorkshopDraft, ZonaDraft } from './drafts';
import '../../styles/admin/preview.css';

/**
 * Live-Vorschau (Problem P4).
 *
 * v1 ließ die Nutzerin ein Feld namens „Resumen corto (se ve en la tarjeta)"
 * ausfüllen und sich den Rest vorstellen. Hier steht daneben, was daraus auf
 * der Website wird -- in beiden Sprachen und in beiden Ansichten.
 *
 * Der eigentliche Gewinn ist die Detailansicht: Die sechs `show_*`-Schalter
 * blenden ganze Blöcke aus, und erst hier sieht man, was das bedeutet.
 *
 * Die Vorschau ist eine verkleinerte Nachbildung, kein zweites Rendering der
 * echten Komponenten -- Astro-Komponenten laufen zur Bauzeit, im Browser gibt
 * es sie nicht. Sie folgt `Workshops.astro` und `Stay.astro` in Aufbau und
 * Reihenfolge, nicht in jedem Pixel.
 */

export type PreviewMode = 'card' | 'detail';
export type PreviewLang = 'es' | 'en';

export interface PreviewHandle {
  el: HTMLElement;
  /** Neu zeichnen. Darf bei jedem Tastendruck kommen, ist per rAF gedrosselt. */
  update(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Leere Felder werden sichtbar leer, nie stillschweigend weggelassen. */
function orGap(value: string, placeholder: string): HTMLElement {
  if (value.trim()) return el('span', undefined, value);
  return el('span', 'adm-pv__gap', placeholder);
}

function list(values: string[], placeholder: string): HTMLElement {
  const ul = el('ul', 'adm-pv__list');
  const filled = values.filter((v) => v.trim());
  if (filled.length === 0) {
    ul.append(el('li', 'adm-pv__gap', placeholder));
    return ul;
  }
  for (const v of filled) ul.append(el('li', undefined, v));
  return ul;
}

/* ===========================================================================
   Gerüst: Kopfleiste mit Sprach- und Ansichtswahl
   =========================================================================== */

interface Frame {
  el: HTMLElement;
  stage: HTMLElement;
  mode: () => PreviewMode;
  lang: () => PreviewLang;
  onChange: (fn: () => void) => void;
}

function frame(cardLabel: string, detailLabel: string): Frame {
  const root = el('div', 'adm-pv');
  const bar = el('div', 'adm-pv__bar');

  let mode: PreviewMode = 'card';
  let lang: PreviewLang = 'es';
  let changed: (() => void) | null = null;

  function group<T extends string>(
    options: { value: T; label: string }[],
    current: () => T,
    set: (v: T) => void,
    ariaLabel: string,
  ): HTMLElement {
    const wrap = el('div', 'adm-pv__group');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', ariaLabel);
    const buttons = options.map((o) => {
      const b = el('button', 'adm-pv__chip', o.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        set(o.value);
        for (const [i, other] of buttons.entries()) {
          const on = options[i].value === current();
          other.classList.toggle('is-on', on);
          other.setAttribute('aria-pressed', String(on));
        }
        changed?.();
      });
      const on = o.value === current();
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      wrap.append(b);
      return b;
    });
    return wrap;
  }

  bar.append(
    group<PreviewMode>(
      [
        { value: 'card', label: cardLabel },
        { value: 'detail', label: detailLabel },
      ],
      () => mode,
      (v) => {
        mode = v;
      },
      'Qué se muestra',
    ),
    group<PreviewLang>(
      [
        { value: 'es', label: 'ES' },
        { value: 'en', label: 'EN' },
      ],
      () => lang,
      (v) => {
        lang = v;
      },
      'Idioma',
    ),
  );

  const scaler = el('div', 'adm-pv__scaler');
  const stage = el('div', 'adm-pv__stage');
  scaler.append(stage);
  root.append(bar, scaler);

  return {
    el: root,
    stage,
    mode: () => mode,
    lang: () => lang,
    onChange: (fn) => {
      changed = fn;
    },
  };
}

/** Zeichnet frühestens im nächsten Bild neu -- `update()` kommt pro Tastendruck. */
function throttled(draw: () => void): { run: () => void; cancel: () => void } {
  let raf = 0;
  return {
    run() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw();
      });
    },
    cancel() {
      if (raf) cancelAnimationFrame(raf);
    },
  };
}

/* ===========================================================================
   Taller
   =========================================================================== */

export function workshopPreview(get: () => WorkshopDraft): PreviewHandle {
  const f = frame('Tarjeta', 'Ficha');

  function drawCard(d: WorkshopDraft, lang: PreviewLang): HTMLElement {
    const theme = workshopThemes[d.themeId];
    const card = el('article', `adm-pv__card adm-pv__card--${theme?.accent ?? 'miel'}`);

    const head = el('div', 'adm-pv__cardhead');
    if (theme) {
      const icon = el('span', 'adm-pv__icon');
      icon.innerHTML = `<svg viewBox="0 0 90 90">${theme.cardIcon}</svg>`;
      head.append(icon);
    }
    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.title[lang], 'Falta el título'));
    head.append(h);
    card.append(head);

    const chip = el('p', 'adm-pv__chiplabel');
    chip.append(orGap(d.audience[lang], 'Falta “para quién”'));
    card.append(chip);

    const p = el('p', 'adm-pv__text');
    p.append(orGap(d.summary[lang], 'Falta el resumen corto'));
    card.append(p);

    const meta = el('dl', 'adm-pv__meta');
    const pair = (key: string, value: string): void => {
      const wrap = el('div');
      wrap.append(el('dt', undefined, key), el('dd', undefined, value));
      meta.append(wrap);
    };
    pair(lang === 'es' ? 'Duración' : 'Duration', `${d.hours} h`);
    pair(lang === 'es' ? 'Grupo' : 'Group', String(d.maxPeople));
    pair(formatPrice(d.price, d.currency), lang === 'es' ? 'por persona' : 'per person');
    card.append(meta);

    const dates = el('p', 'adm-pv__dates');
    if (d.dates.length) {
      dates.textContent = d.dates.map((x) => formatDate(x, lang)).join(' · ');
    } else {
      dates.className += ' adm-pv__gap';
      dates.textContent = lang === 'es' ? 'Sin fechas cargadas' : 'No dates yet';
    }
    card.append(dates);

    return card;
  }

  function drawDetail(d: WorkshopDraft, lang: PreviewLang): HTMLElement {
    const theme = workshopThemes[d.themeId];
    const wrap = el('article', 'adm-pv__detail');

    if (theme) {
      const hero = el('div', 'adm-pv__hero');
      hero.innerHTML = `<svg viewBox="0 0 320 150">${theme.hero}</svg>`;
      wrap.append(hero);
    }

    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.title[lang], 'Falta el título'));
    wrap.append(h);

    const lead = el('p', 'adm-pv__text');
    lead.append(orGap(d.longDesc[lang], 'Falta la descripción completa'));
    wrap.append(lead);

    // Genau hier zahlt sich die Vorschau aus: Was ausgeschaltet ist,
    // fehlt auch auf der Website.
    if (d.show.programme) {
      wrap.append(el('h4', 'adm-pv__h4', lang === 'es' ? 'Cómo es el encuentro' : 'How the day goes'));
      const ol = el('ol', 'adm-pv__steps');
      const steps = d.programme.filter((s) => s.title[lang].trim() || s.text[lang].trim());
      if (steps.length === 0) {
        ol.append(el('li', 'adm-pv__gap', 'Sin pasos cargados'));
      } else {
        for (const s of steps) {
          const li = el('li');
          li.append(el('strong', undefined, s.title[lang] || '—'));
          li.append(el('p', undefined, s.text[lang]));
          ol.append(li);
        }
      }
      wrap.append(ol);
    }

    if (d.show.included) {
      wrap.append(el('h4', 'adm-pv__h4', lang === 'es' ? 'Qué incluye' : "What's included"));
      wrap.append(list(d.included.map((x) => x[lang]), 'Sin ítems'));
    }

    if (d.show.bring) {
      wrap.append(el('h4', 'adm-pv__h4', lang === 'es' ? 'Qué traer' : 'What to bring'));
      wrap.append(list(d.bring.map((x) => x[lang]), 'Sin ítems'));
    }

    const facts = el('dl', 'adm-pv__facts');
    const fact = (key: string, value: string): void => {
      const row = el('div');
      row.append(el('dt', undefined, key), el('dd', undefined, value));
      facts.append(row);
    };
    const instructor = `${d.instructorFirstName} ${d.instructorLastName}`.trim();
    if (instructor) fact(lang === 'es' ? 'Lo da' : 'Guided by', instructor);
    if (d.show.forWhom) fact(lang === 'es' ? 'Para quién' : 'Who it is for', d.forWhom[lang] || '—');
    if (d.show.languages) fact(lang === 'es' ? 'Idiomas' : 'Languages', d.languages[lang] || '—');
    if (d.show.meetingPoint) {
      fact(lang === 'es' ? 'Punto de encuentro' : 'Meeting point', d.meetingPoint[lang] || '—');
    }
    if (facts.children.length) wrap.append(facts);

    return wrap;
  }

  const draw = throttled(() => {
    const d = get();
    const lang = f.lang();
    f.stage.replaceChildren(f.mode() === 'card' ? drawCard(d, lang) : drawDetail(d, lang));
  });

  f.onChange(draw.run);
  draw.run();

  return {
    el: f.el,
    update: draw.run,
    destroy() {
      draw.cancel();
      f.el.remove();
    },
  };
}

/* ===========================================================================
   Casa de barro
   =========================================================================== */

const BUILD_LABEL: Record<string, { es: string; en: string }> = {
  listo: { es: 'Terminada', en: 'Finished' },
  enObra: { es: 'En obra', en: 'Under construction' },
  planeado: { es: 'Planeada', en: 'Planned' },
};

export function casaPreview(get: () => CasaDraft): PreviewHandle {
  const f = frame('Tarjeta', 'Ficha');

  /** Ohne Foto zeigt die Website eine Aquarell-Zeichnung je Baufortschritt. */
  function media(d: CasaDraft, lang: PreviewLang): HTMLElement {
    const first = d.images[0];
    if (first?.url) {
      const img = el('img', 'adm-pv__photo');
      img.src = first.url;
      img.alt = first.alt[lang] || '';
      img.loading = 'lazy';
      return img;
    }
    const box = el('div', 'adm-pv__art');
    box.innerHTML = `<svg viewBox="0 0 32 32">${casaGlyphs.clay}</svg>`;
    box.append(el('span', 'adm-pv__gap', 'Sin fotos: se muestra un dibujo'));
    return box;
  }

  function facts(d: CasaDraft, lang: PreviewLang): HTMLElement {
    const ul = el('ul', 'adm-pv__factlist');
    const rows: [string, number, string][] = [
      ['bed', d.beds, lang === 'es' ? 'camas' : 'beds'],
      ['guests', d.guests, lang === 'es' ? 'huéspedes' : 'guests'],
      ['area', d.area, 'm²'],
      ['bedroom', d.bedrooms, lang === 'es' ? 'dormitorios' : 'bedrooms'],
      ['bath', d.bathrooms, lang === 'es' ? 'baños' : 'bathrooms'],
    ];
    for (const [glyph, value, label] of rows) {
      const li = el('li');
      li.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">${casaGlyphs[glyph as keyof typeof casaGlyphs] ?? ''}</svg>`;
      li.append(el('strong', undefined, String(value)), el('span', undefined, label));
      ul.append(li);
    }
    return ul;
  }

  function drawCard(d: CasaDraft, lang: PreviewLang): HTMLElement {
    const card = el('article', 'adm-pv__card');
    card.append(media(d, lang));

    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.title[lang], 'Falta el nombre'));
    card.append(h);

    const state = el('p', 'adm-pv__chiplabel', BUILD_LABEL[d.buildStatus]?.[lang] ?? d.buildStatus);
    card.append(state);

    const tag = el('p', 'adm-pv__text');
    tag.append(orGap(d.tagline[lang], 'Falta la frase corta'));
    card.append(tag);

    card.append(facts(d, lang));
    return card;
  }

  function drawDetail(d: CasaDraft, lang: PreviewLang): HTMLElement {
    const wrap = el('article', 'adm-pv__detail');
    wrap.append(media(d, lang));

    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.title[lang], 'Falta el nombre'));
    wrap.append(h);

    const tag = el('p', 'adm-pv__text');
    tag.append(orGap(d.tagline[lang], 'Falta la frase corta'));
    wrap.append(tag);

    wrap.append(facts(d, lang));

    const body = d.body.map((p) => p[lang]).filter((p) => p.trim());
    if (body.length === 0) {
      wrap.append(el('p', 'adm-pv__gap', 'Falta la descripción'));
    } else {
      for (const p of body) wrap.append(el('p', 'adm-pv__text', p));
    }

    wrap.append(el('h4', 'adm-pv__h4', lang === 'es' ? 'Equipamiento' : 'Amenities'));
    wrap.append(list(d.amenities.map((a) => a.label[lang]), 'Sin ítems'));

    wrap.append(el('h4', 'adm-pv__h4', lang === 'es' ? 'Lo que la hace especial' : 'Highlights'));
    const ul = el('ul', 'adm-pv__list');
    const highs = d.highlights.filter((x) => x.label[lang].trim());
    if (highs.length === 0) {
      ul.append(el('li', 'adm-pv__gap', 'Sin ítems'));
    } else {
      for (const x of highs) {
        const li = el('li');
        li.append(el('strong', undefined, x.label[lang]));
        if (x.note[lang].trim()) li.append(el('span', undefined, ` ${x.note[lang]}`));
        ul.append(li);
      }
    }
    wrap.append(ul);

    const note = el('p', 'adm-pv__note');
    note.append(orGap(d.bookNote[lang], 'Falta la nota sobre reservas'));
    wrap.append(note);

    return wrap;
  }

  const draw = throttled(() => {
    const d = get();
    const lang = f.lang();
    f.stage.replaceChildren(f.mode() === 'card' ? drawCard(d, lang) : drawDetail(d, lang));
  });

  f.onChange(draw.run);
  draw.run();

  return {
    el: f.el,
    update: draw.run,
    destroy() {
      draw.cancel();
      f.el.remove();
    },
  };
}

/* ===========================================================================
   Módulo ("Las abejas educan")
   =========================================================================== */

/**
 * Die Monatsnamen kommen aus demselben Datensatz wie die übrige Oberfläche
 * des Bereichs (`abejasEducanUI[lang].mesesCortos`) -- nicht aus
 * `toLocaleString`. Sonst stünde in der Vorschau "sept" und auf der Website
 * "set", und die Nutzerin müsste raten, welches von beidem stimmt.
 */
function mesesLinea(meses: number[], lang: PreviewLang): string {
  const nombres = abejasEducanUI[lang].mesesCortos;
  return meses
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b)
    .map((m) => nombres[m - 1])
    .join(' · ');
}

/** "90 minutos" bzw. "3 horas" -- ganze Stunden werden als Stunden gelesen. */
function duracionTexto(minutos: number, lang: PreviewLang): string {
  const ui = abejasEducanUI[lang];
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60} ${ui.horas}`;
  return `${minutos} ${ui.minutos}`;
}

export function moduloPreview(get: () => ModuloDraft): PreviewHandle {
  const f = frame('Tarjeta', 'Ficha');

  function drawCard(d: ModuloDraft, lang: PreviewLang): HTMLElement {
    const ui = abejasEducanUI[lang];
    // Die Karten der Ruta tragen den Honigton; die Chacra hebt sich als Ziel
    // des Weges mit dem Pistazienton ab -- wie in AbejasEducan.astro.
    const card = el(
      'article',
      `adm-pv__card adm-pv__card--${d.lugar === 'chacra' ? 'pistacho' : 'miel'}`,
    );

    const head = el('div', 'adm-pv__cardhead');
    const h = el('h3', 'adm-pv__title');
    // Die Nummer steht sichtbar in der Wabe -- deshalb auch hier davor.
    h.append(el('span', undefined, `${d.numero}. `));
    h.append(orGap(d.title[lang], 'Falta el título'));
    head.append(h);
    card.append(head);

    const chip = el('p', 'adm-pv__chiplabel');
    chip.append(orGap(d.clase[lang], 'Falta la clase'));
    card.append(chip);

    const p = el('p', 'adm-pv__text');
    p.append(orGap(d.summary[lang], 'Falta el resumen corto'));
    card.append(p);

    const meta = el('dl', 'adm-pv__meta');
    const pair = (key: string, value: string): void => {
      const wrap = el('div');
      wrap.append(el('dt', undefined, key), el('dd', undefined, value));
      meta.append(wrap);
    };
    pair(ui.duracion, duracionTexto(d.duracion, lang));
    pair(ui.maxAlumnos, `${d.maxAlumnos} ${ui.alumnos}`);
    pair(
      lang === 'es' ? 'Edad' : 'Age',
      // Ohne Obergrenze schreibt die Website "ab 8", nicht "8 – 0".
      d.edadMax > 0 && d.edadMax >= d.edadMin
        ? `${d.edadMin}–${d.edadMax}`
        : `${lang === 'es' ? 'desde' : 'from'} ${d.edadMin}`,
    );
    card.append(meta);

    const meses = el('p', 'adm-pv__dates');
    if (d.meses.length) {
      meses.textContent = `${ui.meses}: ${mesesLinea(d.meses, lang)}`;
    } else {
      meses.className += ' adm-pv__gap';
      meses.textContent = lang === 'es' ? 'Sin meses elegidos' : 'No months chosen';
    }
    card.append(meses);

    // Genau hier zahlt sich die Vorschau aus: „Próximamente" heißt, dass die
    // Karte steht, aber nicht auswählbar ist -- das sieht man sonst nirgends.
    const accion = el(
      'p',
      d.estado === 'proximamente' ? 'adm-pv__chiplabel' : 'adm-pv__text',
      d.estado === 'proximamente' ? ui.proximamente : ui.elegir,
    );
    card.append(accion);

    return card;
  }

  function drawDetail(d: ModuloDraft, lang: PreviewLang): HTMLElement {
    const ui = abejasEducanUI[lang];
    const wrap = el('article', 'adm-pv__detail');

    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.title[lang], 'Falta el título'));
    wrap.append(h);

    const chip = el('p', 'adm-pv__chiplabel');
    chip.append(orGap(d.clase[lang], 'Falta la clase'));
    wrap.append(chip);

    const lead = el('p', 'adm-pv__text');
    lead.append(orGap(d.longDesc[lang], 'Falta la descripción completa'));
    wrap.append(lead);

    wrap.append(el('h4', 'adm-pv__h4', ui.objetivos));
    wrap.append(list(d.objetivos.map((x) => x[lang]), 'Sin objetivos'));

    const facts = el('dl', 'adm-pv__facts');
    const fact = (key: string, value: string): void => {
      const row = el('div');
      row.append(el('dt', undefined, key), el('dd', undefined, value));
      facts.append(row);
    };
    fact(lang === 'es' ? 'Dónde' : 'Where', d.lugar === 'chacra' ? ui.enChacra : ui.enAula);
    fact(ui.duracion, duracionTexto(d.duracion, lang));
    fact(ui.maxAlumnos, `${d.maxAlumnos} ${ui.alumnos}`);
    fact(ui.meses, d.meses.length ? mesesLinea(d.meses, lang) : '—');
    if (d.estado === 'proximamente') fact(ui.proximamente, ui.proximamenteNota);
    wrap.append(facts);

    return wrap;
  }

  const draw = throttled(() => {
    const d = get();
    const lang = f.lang();
    f.stage.replaceChildren(f.mode() === 'card' ? drawCard(d, lang) : drawDetail(d, lang));
  });

  f.onChange(draw.run);
  draw.run();

  return {
    el: f.el,
    update: draw.run,
    destroy() {
      draw.cancel();
      f.el.remove();
    },
  };
}

/* ===========================================================================
   On Tour — Seminar
   =========================================================================== */

/**
 * Der Grund, warum es diese Vorschau gibt, steht in einer einzigen Zeile der
 * Karte: dem Preis. Im Formular stehen Betrag und Preisart getrennt
 * nebeneinander; erst hier liest man, was daraus auf der Website wird --
 * "US$ 45 por persona" oder "$U 1600 por el grupo entero". Wer die beiden
 * verwechselt, verwechselt sie um den Faktor der Gruppengröße, und genau das
 * soll man sehen, bevor es veröffentlicht ist.
 */
function precioLinea(d: SeminarioDraft, lang: PreviewLang): string {
  const ui = onTourUI[lang];
  const sufijo = d.precioTipo === 'total' ? ui.precioTotal : ui.porPersona;
  return `${formatPrice(d.precio, d.currency)} ${sufijo}`;
}

/** "150 minutos" bzw. "2 horas" -- ganze Stunden werden als Stunden gelesen. */
function duracionOnTour(minutos: number, lang: PreviewLang): string {
  const ui = onTourUI[lang];
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60} ${ui.horas}`;
  return `${minutos} ${ui.minutos}`;
}

export function seminarioPreview(get: () => SeminarioDraft): PreviewHandle {
  const f = frame('Tarjeta', 'Ficha');

  function drawCard(d: SeminarioDraft, lang: PreviewLang): HTMLElement {
    const ui = onTourUI[lang];
    // Das Pigment ist das, was das Seminar sichtbar an sein Thema bindet --
    // Honig, Lehm, Lavendel. 'miel' ist der Grundton der Karte und braucht
    // deshalb keine eigene Klasse.
    const card = el('article', `adm-pv__card adm-pv__card--${d.pigmento}`);

    const head = el('div', 'adm-pv__cardhead');
    const h = el('h3', 'adm-pv__title');
    h.append(el('span', undefined, `${d.numero}. `));
    h.append(orGap(d.title[lang], 'Falta el título'));
    head.append(h);
    card.append(head);

    const precio = el('p', 'adm-pv__chiplabel', precioLinea(d, lang));
    card.append(precio);

    const p = el('p', 'adm-pv__text');
    p.append(orGap(d.summary[lang], 'Falta el resumen corto'));
    card.append(p);

    const meta = el('dl', 'adm-pv__meta');
    const pairRow = (key: string, value: string): void => {
      const wrap = el('div');
      wrap.append(el('dt', undefined, key), el('dd', undefined, value));
      meta.append(wrap);
    };
    pairRow(ui.duracion, duracionOnTour(d.duracion, lang));
    pairRow(
      ui.personas,
      `${ui.desde} ${d.minPersonas} ${ui.hasta} ${d.maxPersonas}`,
    );
    card.append(meta);

    // "Activo" ist nicht der Veröffentlichungszustand: ein abgeschaltetes
    // Seminar steht weiterhin auf der Seite, nur ohne Auswahlknopf. Das sieht
    // man sonst nirgends -- deshalb hier.
    const accion = el(
      'p',
      d.activo ? 'adm-pv__text' : 'adm-pv__gap',
      d.activo
        ? ui.elegir
        : lang === 'es'
          ? 'Sin botón para elegirlo (desactivado)'
          : 'No button to choose it (switched off)',
    );
    card.append(accion);

    return card;
  }

  function drawDetail(d: SeminarioDraft, lang: PreviewLang): HTMLElement {
    const ui = onTourUI[lang];
    const wrap = el('article', 'adm-pv__detail');

    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.title[lang], 'Falta el título'));
    wrap.append(h);

    wrap.append(el('p', 'adm-pv__chiplabel', precioLinea(d, lang)));

    const lead = el('p', 'adm-pv__text');
    lead.append(orGap(d.longDesc[lang], 'Falta la descripción completa'));
    wrap.append(lead);

    wrap.append(el('h4', 'adm-pv__h4', ui.incluye));
    wrap.append(list(d.incluye.map((x) => x[lang]), 'Sin lista de lo que llevamos'));

    wrap.append(el('h4', 'adm-pv__h4', ui.necesitamos));
    const nec = el('p', 'adm-pv__text');
    nec.append(orGap(d.necesitamos[lang], 'Falta lo que necesitamos del lugar'));
    wrap.append(nec);

    const facts = el('dl', 'adm-pv__facts');
    const fact = (key: string, value: string): void => {
      const row = el('div');
      row.append(el('dt', undefined, key), el('dd', undefined, value));
      facts.append(row);
    };
    fact(ui.duracion, duracionOnTour(d.duracion, lang));
    fact(ui.personas, `${ui.desde} ${d.minPersonas} ${ui.hasta} ${d.maxPersonas}`);
    // Die Rechnung ausgeschrieben: bei einer Pauschale ändert die
    // Teilnehmerzahl nichts, bei einem Preis je Person alles.
    fact(
      ui.estimacion,
      d.precioTipo === 'total'
        ? formatPrice(d.precio, d.currency)
        : `${formatPrice(d.precio, d.currency)} × ${d.minPersonas} = ` +
          formatPrice(d.precio * d.minPersonas, d.currency),
    );
    wrap.append(facts);

    return wrap;
  }

  const draw = throttled(() => {
    const d = get();
    const lang = f.lang();
    f.stage.replaceChildren(f.mode() === 'card' ? drawCard(d, lang) : drawDetail(d, lang));
  });

  f.onChange(draw.run);
  draw.run();

  return {
    el: f.el,
    update: draw.run,
    destroy() {
      draw.cancel();
      f.el.remove();
    },
  };
}

/* ===========================================================================
   On Tour — Anfahrtszone
   =========================================================================== */

/**
 * Was in der Zonenliste der Website rechts steht.
 *
 * Drei Zustände, die im Formular auseinanderzuhalten die eigentliche Arbeit
 * ist:
 *   aPedido        → "A calcular"  (der Preis steht noch nicht fest)
 *   recargo = 0    → "Incluido"    (die Fahrt kostet nichts)
 *   recargo > 0    → "$U 1200"
 * Der Unterschied zwischen den ersten beiden ist der Grund für die ganze
 * Mechanik: "A calcular" als 0 zu speichern hieße, dem Kunden eine kostenlose
 * Anfahrt quer durchs Land zu versprechen.
 */
function recargoLinea(d: ZonaDraft, lang: PreviewLang): string {
  const ui = onTourUI[lang];
  if (d.aPedido) return ui.zonaAPedido;
  if (d.recargo <= 0) return ui.zonaSinRecargo;
  return formatPrice(d.recargo, d.currency);
}

export function zonaPreview(get: () => ZonaDraft): PreviewHandle {
  // Zwei Ansichten, weil eine Zone an zwei Stellen auftaucht: in der Liste
  // "Cuánto cuesta que vayamos" und noch einmal in der Kostenschätzung des
  // Anfrageformulars. Gerade dort fällt auf, was "A calcular" bedeutet --
  // die Schätzung kann dann nämlich gar keine Summe nennen.
  const f = frame('Lista', 'Presupuesto');

  function drawRow(d: ZonaDraft, lang: PreviewLang): HTMLElement {
    const card = el('article', 'adm-pv__card');

    const h = el('h3', 'adm-pv__title');
    h.append(orGap(d.nombre[lang], 'Falta el nombre de la zona'));
    card.append(h);

    card.append(el('p', 'adm-pv__chiplabel', recargoLinea(d, lang)));

    const p = el('p', 'adm-pv__text');
    p.append(orGap(d.detalle[lang], 'Falta la lista de localidades'));
    card.append(p);

    return card;
  }

  function drawEstimate(d: ZonaDraft, lang: PreviewLang): HTMLElement {
    const ui = onTourUI[lang];
    const wrap = el('article', 'adm-pv__detail');

    wrap.append(el('h3', 'adm-pv__title', ui.estimacion));

    const facts = el('dl', 'adm-pv__facts');
    const fact = (key: string, value: string): void => {
      const row = el('div');
      row.append(el('dt', undefined, key), el('dd', undefined, value));
      facts.append(row);
    };
    fact(ui.campoZona, d.nombre[lang] || '—');
    fact(lang === 'es' ? 'Traslado' : 'Travel', recargoLinea(d, lang));
    wrap.append(facts);

    const nota = el('p', d.aPedido ? 'adm-pv__gap' : 'adm-pv__note');
    nota.textContent = d.aPedido
      ? lang === 'es'
        ? 'Con “a calcular” el presupuesto automático no puede dar un total. Se nombra a mano en la propuesta.'
        : 'With “to be worked out” the automatic estimate cannot give a total. It is quoted by hand in the proposal.'
      : ui.estimacionNota;
    wrap.append(nota);

    return wrap;
  }

  const draw = throttled(() => {
    const d = get();
    const lang = f.lang();
    f.stage.replaceChildren(f.mode() === 'card' ? drawRow(d, lang) : drawEstimate(d, lang));
  });

  f.onChange(draw.run);
  draw.run();

  return {
    el: f.el,
    update: draw.run,
    destroy() {
      draw.cancel();
      f.el.remove();
    },
  };
}
