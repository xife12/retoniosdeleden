import '../../styles/admin/base.css';

/**
 * Gepaartes Sprachfeld -- das Herzstück gegen Problem P2.
 *
 * Das alte Backend trennte Spanisch und Englisch in zwei Reiter. Man tippte
 * alles doppelt, sah nie, was in der anderen Sprache noch fehlte, und erfuhr
 * es erst, wenn die Validierung einen beim Speichern in den anderen Reiter
 * warf. Die Reiter entfallen ersatzlos.
 *
 * Stattdessen ist ein Feld **ein** Bauteil: Spanisch prominent, Englisch
 * direkt darunter, sichtbar untergeordnet. Fehlt Englisch, während Spanisch
 * schon steht, zeigt das Feld einen ruhigen Bernstein-Hinweis -- keine
 * Fehlermeldung, niemand wird beim Tippen angemeckert.
 */

export type FieldKind = 'text' | 'textarea';
export type FieldLang = 'es' | 'en';

export interface PairedValue {
  es: string;
  en: string;
}

export interface PairedField {
  el: HTMLElement;
  get(): PairedValue;
  set(v: Partial<PairedValue>): void;
  focus(lang?: FieldLang): void;
  /** Für den Vollständigkeitszähler im Editor-Kopf. */
  isComplete(): { es: boolean; en: boolean };
  /** true, wenn dieses Feld für „fertig" ausgefüllt sein muss. */
  readonly required: boolean;
  readonly label: string;
}

export interface PairedFieldOptions {
  label: string;
  /** Beschriftung der englischen Zeile. Vorgabe: dieselbe wie `label`. */
  labelEn?: string;
  type?: FieldKind;
  rows?: number;
  /** Zeigt einen Zeichenzähler und warnt beim Überschreiten. */
  maxLength?: number;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  placeholderEn?: string;
  onInput?: () => void;
}

let uid = 0;

function makeControl(
  kind: FieldKind,
  rows: number,
  placeholder: string,
  id: string,
): HTMLInputElement | HTMLTextAreaElement {
  if (kind === 'textarea') {
    const ta = document.createElement('textarea');
    ta.rows = rows;
    ta.id = id;
    ta.className = 'adm-pf__control';
    ta.placeholder = placeholder;
    return ta;
  }
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.id = id;
  inp.className = 'adm-pf__control';
  inp.placeholder = placeholder;
  return inp;
}

export function pairedField(o: PairedFieldOptions): PairedField {
  const kind = o.type ?? 'text';
  const rows = o.rows ?? 3;
  const required = o.required ?? false;
  const idBase = `pf-${++uid}`;

  const el = document.createElement('div');
  el.className = 'adm-pf';

  /* ---------------- Kopf ---------------- */

  const head = document.createElement('div');
  head.className = 'adm-pf__head';

  const label = document.createElement('label');
  label.className = 'adm-pf__label';
  label.htmlFor = `${idBase}-es`;
  label.textContent = o.label;
  if (required) {
    const req = document.createElement('span');
    req.className = 'adm-pf__req';
    req.textContent = '*';
    req.setAttribute('aria-label', 'obligatorio');
    label.append(req);
  }
  head.append(label);
  el.append(head);

  /* ---------------- Spanisch: Primärzeile ---------------- */

  const rowEs = document.createElement('div');
  rowEs.className = 'adm-pf__row adm-pf__row--es';

  const badgeEs = document.createElement('span');
  badgeEs.className = 'adm-pf__badge';
  badgeEs.textContent = 'ES';
  badgeEs.setAttribute('aria-hidden', 'true');

  const inputEs = makeControl(kind, rows, o.placeholder ?? '', `${idBase}-es`);
  inputEs.setAttribute('lang', 'es');
  rowEs.append(badgeEs, inputEs);
  el.append(rowEs);

  /* ---------------- Englisch: untergeordnete Zeile ---------------- */

  const rowEn = document.createElement('div');
  rowEn.className = 'adm-pf__row adm-pf__row--en';

  const badgeEn = document.createElement('span');
  badgeEn.className = 'adm-pf__badge';
  badgeEn.textContent = 'EN';
  badgeEn.setAttribute('aria-hidden', 'true');

  const inputEn = makeControl(kind, Math.max(2, rows - 1), o.placeholderEn ?? '', `${idBase}-en`);
  inputEn.setAttribute('lang', 'en');
  inputEn.setAttribute('aria-label', `${o.labelEn ?? o.label} (English)`);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'adm-pf__copy';
  copy.textContent = 'copiar del ES';
  copy.title = 'Copiar el texto en español como punto de partida';

  rowEn.append(badgeEn, inputEn, copy);
  el.append(rowEn);

  /* ---------------- Fußzeile: Zähler, Hinweis, Warnung ---------------- */

  const foot = document.createElement('div');
  foot.className = 'adm-pf__foot';

  const warn = document.createElement('p');
  warn.className = 'adm-pf__warn';
  warn.textContent = 'Falta la versión en inglés.';
  warn.hidden = true;

  const hint = document.createElement('p');
  hint.className = 'adm-pf__hint';
  if (o.hint) hint.textContent = o.hint;
  else hint.hidden = true;

  const count = document.createElement('p');
  count.className = 'adm-pf__count';
  if (!o.maxLength) count.hidden = true;

  foot.append(warn, hint, count);
  el.append(foot);

  /* ---------------- Verhalten ---------------- */

  function refresh(): void {
    const es = inputEs.value.trim();
    const en = inputEn.value.trim();

    // Warnen nur, wenn Spanisch schon dasteht -- ein leeres Feld ist noch
    // kein Versäumnis, sondern einfach noch nicht dran.
    const missingEn = es.length > 0 && en.length === 0;
    warn.hidden = !missingEn;
    el.classList.toggle('is-warn', missingEn);
    copy.hidden = en.length > 0;

    if (o.maxLength) {
      const longest = Math.max(inputEs.value.length, inputEn.value.length);
      count.textContent = `${longest} / ${o.maxLength}`;
      count.classList.toggle('is-over', longest > o.maxLength);
    }
  }

  function handleInput(): void {
    refresh();
    o.onInput?.();
  }

  inputEs.addEventListener('input', handleInput);
  inputEn.addEventListener('input', handleInput);

  copy.addEventListener('click', () => {
    inputEn.value = inputEs.value;
    inputEn.focus();
    handleInput();
  });

  refresh();

  return {
    el,
    required,
    label: o.label,
    get: () => ({ es: inputEs.value.trim(), en: inputEn.value.trim() }),
    set(v) {
      if (v.es !== undefined) inputEs.value = v.es;
      if (v.en !== undefined) inputEn.value = v.en;
      refresh();
    },
    focus(lang: FieldLang = 'es') {
      (lang === 'es' ? inputEs : inputEn).focus();
    },
    isComplete: () => ({
      es: inputEs.value.trim().length > 0,
      en: inputEn.value.trim().length > 0,
    }),
  };
}

/**
 * Zählt über eine Feldgruppe, was je Sprache ausgefüllt ist -- Grundlage für
 * „Español 12/12 · English 9/12" im Editor-Kopf. Gezählt werden nur Felder,
 * die als `required` angelegt wurden.
 */
export function completeness(fields: PairedField[]): {
  es: { done: number; total: number };
  en: { done: number; total: number };
  firstMissing: { field: PairedField; lang: FieldLang } | null;
} {
  const relevant = fields.filter((f) => f.required);
  let esDone = 0;
  let enDone = 0;
  let firstMissing: { field: PairedField; lang: FieldLang } | null = null;

  for (const f of relevant) {
    const c = f.isComplete();
    if (c.es) esDone++;
    if (c.en) enDone++;
    if (!firstMissing) {
      if (!c.es) firstMissing = { field: f, lang: 'es' };
      else if (!c.en) firstMissing = { field: f, lang: 'en' };
    }
  }

  return {
    es: { done: esDone, total: relevant.length },
    en: { done: enDone, total: relevant.length },
    firstMissing,
  };
}
