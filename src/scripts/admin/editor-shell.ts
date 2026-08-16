/**
 * Gerüst beider Editoren (Spec 2.2).
 *
 * Volle Seite statt Overlay: das Riesen-Modal von v1 ist weg (P1). Oben
 * klebt eine Kopfzeile mit Speicherzustand und Primäraktion -- „Speichern"
 * steht nie mehr nur ganz unten. Links springt man zwischen den Abschnitten,
 * rechts läuft ab 78rem die Live-Vorschau mit; darunter öffnet sie als
 * Vollbild-Blatt.
 *
 * Die Fachlichkeit steckt in `workshops-view.ts` / `casas-view.ts`; hier
 * steht nur, wo etwas hingehört.
 */
import { toast } from './toast';
import type { SaveState } from './dirty';
import '../../styles/admin/editor.css';

export type { SaveState };
export type PubBadge = 'draft' | 'published' | 'published-dirty' | 'archived';
export type SectionState = 'ok' | 'partial' | 'empty';

const BADGE_TEXT: Record<PubBadge, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  'published-dirty': 'Publicado · cambios sin publicar',
  archived: 'Archivado',
};

/** Wie lange ein neuer Build der Website ungefähr braucht (Spec 2.4). */
const DEPLOY_MS = 90_000;

export interface EditorShell {
  root: HTMLElement;
  addSection(id: string, label: string): HTMLElement;
  setSectionState(id: string, state: SectionState): void;
  setTitle(text: string): void;
  setSaveState(s: SaveState, at?: Date): void;
  setBadge(b: PubBadge): void;
  setCompleteness(
    es: { done: number; total: number },
    en: { done: number; total: number },
    onJump: () => void,
  ): void;
  setPreview(el: HTMLElement | null): void;
  onPublish(fn: () => Promise<void>): void;
  /** „Descartar cambios sin publicar" -- nur im Zustand published-dirty. */
  onDiscard(fn: () => Promise<void>): void;
  /** Klick auf die Zustandsanzeige, wenn etwas ungespeichert ist. */
  onSaveNow(fn: () => Promise<void>): void;
  onBack(fn: () => void): void;
  dangerZone(): HTMLElement;
  destroy(): void;
}

export interface EditorShellOptions {
  backLabel: string;
  publishLabel?: string;
}

interface SectionRef {
  section: HTMLElement;
  dots: HTMLElement[];
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

export function editorShell(o: EditorShellOptions): EditorShell {
  const root = el('div', 'adm-ed');
  const sections = new Map<string, SectionRef>();
  const wide = window.matchMedia('(min-width: 78rem)');

  let publishFn: (() => Promise<void>) | null = null;
  let discardFn: (() => Promise<void>) | null = null;
  let saveNowFn: (() => Promise<void>) | null = null;
  let backFn: (() => void) | null = null;
  let previewEl: HTMLElement | null = null;
  let deployTimer = 0;

  /* ---------------- Kopfzeile ---------------- */

  const bar = el('header', 'adm-ed__bar');
  const back = el('button', 'adm-ed__back');
  back.type = 'button';
  back.innerHTML = `<span aria-hidden="true">←</span> ${o.backLabel}`;

  const ident = el('div', 'adm-ed__ident');
  const title = el('p', 'adm-ed__title', 'Sin título');
  const stateRow = el('p', 'adm-ed__staterow');
  const badge = el('span', 'adm-badge adm-badge--draft', BADGE_TEXT.draft);
  const save = el('button', 'adm-ed__save');
  save.type = 'button';
  save.setAttribute('aria-live', 'polite');
  stateRow.append(badge, save);
  ident.append(title, stateRow);

  const actions = el('div', 'adm-ed__actions');
  const previewBtn = el('button', 'btn btn--ghost btn--sm adm-ed__previewbtn', 'Vista previa');
  previewBtn.type = 'button';
  const publish = el('button', 'btn adm-ed__publish', o.publishLabel ?? 'Publicar');
  publish.type = 'button';
  actions.append(previewBtn, publish);

  bar.append(back, ident, actions);
  root.append(bar);

  /* ---------------- Hinweiszeilen unter der Kopfzeile ---------------- */

  const notice = el('div', 'adm-ed__notice');
  notice.hidden = true;
  const noticeText = el('p', 'adm-ed__noticetext');
  const discard = el('button', 'btn btn--ghost btn--sm', 'Descartar cambios sin publicar');
  discard.type = 'button';
  notice.append(noticeText, discard);

  const deploy = el('div', 'adm-ed__deploy');
  deploy.hidden = true;
  const deployText = el('p', 'adm-ed__deploytext');
  const track = el('div', 'adm-ed__track');
  const fill = el('div', 'adm-ed__fill');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', 'Publicación en curso');
  track.append(fill);
  deploy.append(deployText, track);

  root.append(notice, deploy);

  /* ---------------- Sprungleiste (Chips + Seitenleiste) ---------------- */

  const chips = el('nav', 'adm-ed__chips');
  chips.setAttribute('aria-label', 'Secciones');
  root.append(chips);

  const grid = el('div', 'adm-ed__grid');
  const nav = el('nav', 'adm-ed__nav');
  nav.setAttribute('aria-label', 'Secciones del formulario');
  const complete = el('p', 'adm-ed__complete');
  const jump = el('button', 'adm-ed__jump', 'Ir a lo que falta');
  jump.type = 'button';
  jump.hidden = true;
  const navList = el('ul', 'adm-ed__navlist');
  nav.append(complete, jump, navList);

  const form = el('div', 'adm-ed__form');
  const danger = el('section', 'adm-ed__danger');
  danger.append(el('h2', 'adm-ed__dangertitle', 'Zona de peligro'));

  const aside = el('aside', 'adm-ed__aside');
  aside.setAttribute('aria-label', 'Vista previa');

  grid.append(nav, form, aside);
  root.append(grid);

  /* ---------------- Vollbild-Blatt für die Vorschau ---------------- */

  const sheet = el('div', 'adm-ed__sheet');
  sheet.hidden = true;
  const sheetHead = el('div', 'adm-ed__sheethead');
  sheetHead.append(el('p', 'adm-ed__sheettitle', 'Vista previa'));
  const sheetClose = el('button', 'btn btn--ghost btn--sm', 'Cerrar');
  sheetClose.type = 'button';
  sheetHead.append(sheetClose);
  const sheetBody = el('div', 'adm-ed__sheetbody');
  sheet.append(sheetHead, sheetBody);
  root.append(sheet);

  /* ---------------- Verhalten ---------------- */

  /**
   * Die Vorschau existiert genau einmal. Wo sie hängt, entscheidet die
   * Breite: rechte Spalte ab 78rem, sonst das Blatt.
   */
  function placePreview(): void {
    previewBtn.hidden = wide.matches || !previewEl;
    if (!previewEl) return;
    if (wide.matches) {
      aside.append(previewEl);
      closeSheet();
    } else if (!sheetBody.contains(previewEl)) {
      sheetBody.append(previewEl);
    }
  }

  function openSheet(): void {
    sheet.hidden = false;
    document.body.classList.add('adm-modal-open');
    sheetClose.focus();
  }

  function closeSheet(): void {
    if (sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('adm-modal-open');
    previewBtn.focus();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !sheet.hidden) closeSheet();
  }

  wide.addEventListener('change', placePreview);
  window.addEventListener('keydown', onKey);
  previewBtn.addEventListener('click', openSheet);
  sheetClose.addEventListener('click', closeSheet);

  back.addEventListener('click', () => backFn?.());
  save.addEventListener('click', () => void saveNowFn?.());

  discard.addEventListener('click', () => {
    discard.disabled = true;
    void (async () => {
      try {
        await discardFn?.();
      } finally {
        discard.disabled = false;
      }
    })();
  });

  /**
   * Nach dem Veröffentlichen läuft die Anzeige ehrlich mit: Der Build
   * braucht ungefähr anderthalb Minuten, und erst danach steht „Ya está en
   * la web" da -- kein Erfolg auf Vorschuss (Spec 2.4).
   */
  function runDeployProgress(): void {
    const started = Date.now();
    deploy.hidden = false;
    deployText.textContent = 'Listo. La web se actualiza sola en aproximadamente un minuto.';
    window.clearInterval(deployTimer);

    deployTimer = window.setInterval(() => {
      const ratio = Math.min(1, (Date.now() - started) / DEPLOY_MS);
      fill.style.width = `${(ratio * 100).toFixed(1)}%`;
      track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
      if (ratio < 1) return;

      window.clearInterval(deployTimer);
      deployTimer = 0;
      deployText.textContent = 'Ya está en la web.';
      deploy.classList.add('is-done');
      toast('Ya está en la web.', { tone: 'ok' });
    }, 500);
  }

  publish.addEventListener('click', () => {
    if (!publishFn) return;
    publish.disabled = true;
    const label = publish.textContent;
    publish.textContent = 'Publicando…';
    void (async () => {
      try {
        await publishFn();
        runDeployProgress();
      } finally {
        publish.disabled = false;
        publish.textContent = label;
      }
    })();
  });

  function makeDot(): HTMLElement {
    const dot = el('span', 'adm-ed__dot adm-ed__dot--empty');
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }

  return {
    root,

    addSection(id, label) {
      const section = el('section', 'adm-ed__section');
      section.id = `sec-${id}`;
      section.append(el('h2', 'adm-ed__sectiontitle', label));
      const body = el('div', 'adm-ed__sectionbody');
      section.append(body);
      form.append(section);
      // Die Gefahrenzone bleibt immer das letzte Element der Spalte.
      form.append(danger);

      const goto = (): void => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        section.querySelector<HTMLElement>('input, textarea, select, button')?.focus({
          preventScroll: true,
        });
      };

      const navItem = el('li');
      const navBtn = el('button', 'adm-ed__navbtn');
      navBtn.type = 'button';
      const navDot = makeDot();
      navBtn.append(navDot, el('span', undefined, label));
      navBtn.addEventListener('click', goto);
      navItem.append(navBtn);
      navList.append(navItem);

      const chip = el('button', 'adm-ed__chip');
      chip.type = 'button';
      const chipDot = makeDot();
      chip.append(chipDot, el('span', undefined, label));
      chip.addEventListener('click', goto);
      chips.append(chip);

      sections.set(id, { section, dots: [navDot, chipDot] });
      return body;
    },

    setSectionState(id, state) {
      const ref = sections.get(id);
      if (!ref) return;
      for (const dot of ref.dots) {
        dot.className = `adm-ed__dot adm-ed__dot--${state}`;
      }
    },

    setTitle(text) {
      title.textContent = text || 'Sin título';
    },

    setSaveState(s, at) {
      const time = at
        ? at.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
        : '';
      const text: Record<SaveState, string> = {
        clean: time ? `Guardado a las ${time}` : 'Guardado',
        dirty: 'Sin guardar',
        saving: 'Guardando…',
        error: 'No se pudo guardar · tocá para reintentar',
      };
      save.textContent = text[s];
      save.className = `adm-ed__save is-${s}`;
      save.disabled = s === 'clean' || s === 'saving';
    },

    setBadge(b) {
      badge.textContent = BADGE_TEXT[b];
      badge.className = `adm-badge adm-badge--${b}`;
      const dirty = b === 'published-dirty';
      notice.hidden = !dirty;
      if (dirty) {
        noticeText.textContent =
          'Hay cambios guardados que todavía no están en la web.';
      }
    },

    setCompleteness(es, en, onJump) {
      complete.textContent = `Español ${es.done}/${es.total} · English ${en.done}/${en.total}`;
      const missing = es.done < es.total || en.done < en.total;
      jump.hidden = !missing;
      jump.onclick = onJump;
    },

    setPreview(next) {
      previewEl?.remove();
      previewEl = next;
      placePreview();
    },

    onPublish(fn) {
      publishFn = fn;
    },

    onDiscard(fn) {
      discardFn = fn;
    },

    onSaveNow(fn) {
      saveNowFn = fn;
    },

    onBack(fn) {
      backFn = fn;
    },

    dangerZone() {
      return danger;
    },

    destroy() {
      window.clearInterval(deployTimer);
      wide.removeEventListener('change', placePreview);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('adm-modal-open');
      root.remove();
    },
  };
}
