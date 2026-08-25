import { insertMentionPlaceholder, searchMentionCandidates, type MentionCandidate } from './mentions';

/**
 * @-Menü für Text-Eingabefelder (Kommentare, künftig auch Chat-Nachrichten) --
 * ausgelagert aus document-detail.ts (Phase-6-Refactoring), damit das Chat-
 * Modul (Phase 7, baut ein anderer Agent) dieselbe Tastenlogik nicht ein
 * zweites Mal schreiben muss. Reine Verschiebung, keine Verhaltensänderung --
 * siehe document-detail.ts, Entscheidung 13 im dortigen Dateikopf, zur
 * Positionierung (fest unterhalb des Felds, keine Caret-Pixelberechnung) und
 * zur Barrierefreiheit (role="combobox"/"listbox", aria-activedescendant,
 * volle Pfeiltasten-/Enter-/Escape-Bedienung).
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE
 * ============================================================================
 *
 *   attachMentionInput(
 *     textarea: HTMLTextAreaElement,
 *     menu: HTMLElement,
 *     idPrefix: string,
 *     localCandidates?: () => MentionCandidate[],
 *   ): void
 *     -- verdrahtet ein <textarea> mit einem daneben/darunter liegenden Menü-
 *        Container: tippen von "@" öffnet die Vorschlagsliste (Personen/
 *        Dokumente aus searchMentionCandidates(), siehe mentions.ts),
 *        Pfeiltasten/Enter/Escape bedienen sie, Auswahl fügt per
 *        insertMentionPlaceholder() den Platzhalter ein. `menu` muss vom
 *        Aufrufer bereits im DOM stehen (leer, hidden) -- diese Funktion
 *        befüllt/versteckt es nur. `idPrefix` erzeugt eindeutige Options-IDs
 *        für aria-activedescendant, falls mehrere Instanzen gleichzeitig auf
 *        der Seite existieren (z. B. mehrere offene Bearbeitungsfelder).
 *        `localCandidates` liefert zusätzliche, LOKAL (ohne Netzwerkaufruf)
 *        durchsuchbare Kandidaten -- aktuell von document-detail.ts genutzt
 *        für die Versionen des gerade offenen Dokuments (die globale Suche
 *        durchsucht laut mentions.ts bewusst keine Versionen). Leer, wenn
 *        nicht übergeben.
 * ============================================================================
 */

export function attachMentionInput(
  textarea: HTMLTextAreaElement,
  menu: HTMLElement,
  idPrefix: string,
  localCandidates: () => MentionCandidate[] = () => [],
): void {
  let state: { start: number; query: string } | null = null;
  let candidates: MentionCandidate[] = [];
  let activeIndex = 0;
  // Schutz gegen Race-Bedingungen: die Antwort einer veralteten Anfrage
  // (z. B. weil währenddessen weitergetippt wurde) darf eine neuere nicht
  // überschreiben.
  let requestSeq = 0;

  menu.setAttribute('role', 'listbox');
  textarea.setAttribute('role', 'combobox');
  textarea.setAttribute('aria-autocomplete', 'list');
  textarea.setAttribute('aria-controls', menu.id);

  function hide(): void {
    state = null;
    candidates = [];
    activeIndex = 0;
    menu.hidden = true;
    menu.replaceChildren();
    textarea.removeAttribute('aria-expanded');
    textarea.removeAttribute('aria-activedescendant');
  }

  function render(): void {
    menu.replaceChildren();
    if (!state || candidates.length === 0) {
      menu.hidden = true;
      textarea.removeAttribute('aria-expanded');
      textarea.removeAttribute('aria-activedescendant');
      return;
    }
    menu.hidden = false;
    textarea.setAttribute('aria-expanded', 'true');
    candidates.forEach((candidate, i) => {
      const optId = `${idPrefix}-opt-${i}`;
      const isActive = i === activeIndex;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = optId;
      btn.className = `docdet-mentionmenu__item${isActive ? ' is-active' : ''}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(isActive));
      const typeLabel =
        candidate.type === 'person' ? 'Persona' : candidate.type === 'version' ? 'Versión' : 'Documento';
      btn.textContent = `${typeLabel} · ${candidate.label}`;
      // mousedown statt click, um den Fokuswechsel (und damit ein
      // vorzeitiges "blur" auf dem Textfeld) zu verhindern.
      btn.addEventListener('mousedown', (event) => event.preventDefault());
      btn.addEventListener('click', () => choose(candidate));
      menu.append(btn);
    });
    textarea.setAttribute('aria-activedescendant', `${idPrefix}-opt-${activeIndex}`);
  }

  function choose(candidate: MentionCandidate): void {
    if (!state) return;
    const currentPos = textarea.selectionStart ?? state.start;
    const before = textarea.value.slice(0, state.start);
    const after = textarea.value.slice(currentPos);
    const { text, cursorPos } = insertMentionPlaceholder(before + after, before.length, candidate);
    textarea.value = text;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();
    hide();
  }

  function onInput(): void {
    const pos = textarea.selectionStart ?? textarea.value.length;
    const found = findMentionQuery(textarea.value, pos);
    if (!found) {
      hide();
      return;
    }
    state = found;
    const seq = (requestSeq += 1);
    const query = found.query.trim().toLowerCase();
    // Lokale Treffer (z. B. Versionen dieses Dokuments) kosten keinen
    // Netzwerkaufruf und stehen sofort bereit; bei leerer Anfrage bleiben sie
    // ebenfalls leer, aus demselben Grund wie searchMentionCandidates('')
    // (mentions.ts, Entscheidung 4): kein sofortiges Aufklappen einer langen
    // Liste direkt nach dem Tippen von "@".
    const local = query ? localCandidates().filter((c) => c.label.toLowerCase().includes(query)) : [];
    void searchMentionCandidates(found.query).then((results) => {
      if (seq !== requestSeq || !state) return; // veraltet oder inzwischen geschlossen
      candidates = [...local, ...results];
      activeIndex = 0;
      render();
    });
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!state) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // nicht die Seite/den Dialog schließen, nur das Menü
      hide();
      return;
    }
    if (menu.hidden || candidates.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, candidates.length - 1);
      render();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(candidates[activeIndex]);
    }
  }

  textarea.addEventListener('input', onInput);
  textarea.addEventListener('keydown', onKeydown);
  // Sicherheitsnetz zusätzlich zum mousedown-preventDefault() oben, für
  // Geräte/Browser, bei denen der Fokus dem Textfeld doch entgleitet.
  textarea.addEventListener('blur', () => {
    window.setTimeout(() => hide(), 150);
  });
}

/**
 * Sucht rückwärts vom Cursor aus ein offenes "@Suchtext"-Token: das '@' muss
 * am Textanfang stehen oder einem Leerzeichen folgen (sonst z. B.
 * "correo@dominio" fälschlich als Erwähnung erkannt), und zwischen '@' und
 * Cursor darf kein Leerzeichen/Zeilenumbruch liegen. Kein Lookbehind
 * (HANDOFF.md) -- reine Zeichen-für-Zeichen-Suche.
 */
function findMentionQuery(text: string, cursorPos: number): { start: number; query: string } | null {
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i === 0 ? '' : text[i - 1];
      if (before === '' || /\s/.test(before)) {
        return { start: i, query: text.slice(i + 1, cursorPos) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}
