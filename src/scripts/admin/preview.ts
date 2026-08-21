import { workshopThemes } from '../../data/workshop-themes';
import { casaGlyphs } from '../../data/casa-glyphs';
import { formatDate, formatPrice } from '../../data/workshops';
import type { CasaDraft, WorkshopDraft } from './drafts';
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
