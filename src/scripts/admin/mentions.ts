import { supabase } from '../../lib/supabase';
import { fail, listProfiles, type MentionTargetType, type VersionRow } from './documents-store';

/**
 * Erwähnungs-Mechanik der Dokumentenablage (#/documentos) -- unabhängig von
 * der Oberfläche. Wird von documents-comments.ts (Datenzugriff) UND von
 * document-detail.ts (Texteingabe mit @-Menü, baut ein anderer Agent) benutzt.
 *
 * ============================================================================
 * ÖFFENTLICHE SCHNITTSTELLE
 * ============================================================================
 *
 * Platzhalter-Format im Kommentartext (siehe Entscheidung 1 unten):
 *   @[Anzeigename](person:UUID)
 *   @[Dokumenttitel](document:UUID)
 *   @[v3](version:UUID)
 *
 * Typen:
 *   MentionCandidate = { type: MentionTargetType; id: string; label: string }
 *   (MentionTargetType = 'person' | 'document' | 'version', aus documents-store.ts)
 *
 * Funktionen:
 *   parseMentions(body: string): { type: MentionTargetType; id: string }[]
 *     -- extrahiert alle Platzhalter aus einem Text, in Lesereihenfolge.
 *
 *   renderCommentBody(body: string, opts?: RenderCommentBodyOptions): DocumentFragment
 *     -- wandelt Text in anzeigbare DOM-Knoten um: normaler Text bleibt Text,
 *        Platzhalter werden zu Chips (<button> falls ein passender
 *        on*Click-Handler übergeben wurde, sonst <span>). Reines DOM
 *        (createElement/textContent), kein innerHTML -- unproblematisch bei
 *        beliebigem Nutzertext.
 *
 *   insertMentionPlaceholder(text: string, cursorPos: number, mention: { type, id, label }): { text, cursorPos }
 *     -- fügt den Platzhalter an cursorPos ein (siehe Entscheidung 3 unten
 *        zur Erwartung an den Aufrufer beim @-Menü).
 *
 *   searchMentionCandidates(query: string): Promise<MentionCandidate[]>
 *     -- durchsucht Personen (aktive Profile, nach display_name) UND
 *        Dokumente (nach title, ilike). Liefert bei leerer Anfrage [] --
 *        siehe Entscheidung 4.
 *
 *   mentionForVersion(version: VersionRow): MentionCandidate
 *     -- Hilfsfunktion für "diese konkrete Version erwähnen" aus einer
 *        bereits offenen Versionsliste heraus (Versionen sind NICHT über
 *        searchMentionCandidates() durchsuchbar, siehe Entscheidung 5).
 *        label ist "v<Nummer>" bzw. "propuesta" ohne Nummer.
 *
 * ----------------------------------------------------------------------------
 * ENTSCHEIDUNGEN, DIE DER PLAN OFFENLIESS:
 *
 * 1. Platzhalter-Format: @[Label](typ:uuid) statt des im Plan (Abschnitt 4.3,
 *    nur als Kommentar) skizzierten @{{typ:uuid}}. Grund: das Label MUSS Teil
 *    des gespeicherten Textes sein, sonst gibt es keinen Klartext-Fallback,
 *    wenn das Ziel später gelöscht wird ("Klartext-Fallback" ist hier also
 *    keine Zusatzfunktion, sondern liegt allein daran, dass das Label mit
 *    abgespeichert wird -- renderCommentBody() fragt beim Anzeigen NIE die
 *    Datenbank, ob das Ziel noch existiert). Kein Lookbehind im Parsing-
 *    Regex (HANDOFF.md-Vorgabe) -- das Format kommt ohne aus.
 *
 * 2. UUID-Erkennung im Regex ist auf das Standardformat (8-4-4-4-12 Hex-
 *    Zeichen) festgelegt, nicht nur "irgendein Zeichen ohne Klammer". Das
 *    verhindert, dass Nutzertext wie "@[Foo](bar)" versehentlich als
 *    Erwähnung geparst wird.
 *
 * 3. insertMentionPlaceholder() ersetzt KEINE bestehende "@Suchtext"-Eingabe
 *    -- es fügt den Platzhalter exakt an cursorPos ein, wie im Auftrag
 *    spezifiziert. Die aufrufende Oberfläche (document-detail.ts) muss beim
 *    @-Menü selbst wissen, ab welcher Position der Nutzer "@" plus Suchtext
 *    eingegeben hat, diesen Bereich vorher aus dem Text entfernen und
 *    cursorPos = Start dieses Bereichs übergeben. Diese Datei kennt kein
 *    <textarea> und keine Cursor-Historie, deshalb kann sie diese Suche
 *    nicht selbst durchführen.
 *
 * 4. searchMentionCandidates('') liefert bewusst [] statt der ersten N
 *    Personen/Dokumente -- das @-Menü soll erst nach dem ersten getippten
 *    Zeichen Vorschläge zeigen, nicht sofort eine lange Liste aufklappen.
 *    Deaktivierte Personen (is_active = false) werden NICHT vorgeschlagen --
 *    für neue Erwähnungen ergibt das keinen Sinn; ALTE Erwähnungen einer
 *    inzwischen deaktivierten Person bleiben trotzdem lesbar, weil ihr Name
 *    im Label des Platzhalters steckt, nicht in einer Live-Abfrage.
 *
 * 5. Versionen sind nicht über searchMentionCandidates() durchsuchbar (im
 *    Auftrag so vorgegeben) -- eine Versionsnummer ohne Dokumentkontext
 *    ergibt in einer globalen Suche keinen Sinn. Stattdessen exportiert
 *    diese Datei mentionForVersion() für den Fall, dass die Versionsliste
 *    schon offen ist und eine konkrete Zeile daraus erwähnt werden soll.
 *
 * 6. Chip-Text ist einheitlich "@" + Label für alle drei Typen (Person,
 *    Dokument, Version) -- das hält die Erkennung "das ist eine Erwähnung"
 *    beim Lesen konsistent. Visuelle Unterscheidung (Farbe, Icon je Typ)
 *    ist Sache des CSS der aufrufenden Seite; jeder Chip trägt dafür
 *    data-mention-type und data-mention-id.
 *
 * 7. Fehlt für einen erkannten Platzhalter-Typ der passende Klick-Handler in
 *    opts, wird ein <span> statt eines <button> erzeugt (kein funktionsloser
 *    Knopf im DOM).
 * ============================================================================
 */

export interface MentionCandidate {
  type: MentionTargetType;
  id: string;
  label: string;
}

export interface RenderCommentBodyOptions {
  onPersonClick?: (id: string) => void;
  onDocumentClick?: (id: string) => void;
  onVersionClick?: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Platzhalter-Format: @[Label](typ:uuid) -- siehe Entscheidung 1 im Dateikopf.
// Kein Lookbehind (HANDOFF.md). Für jeden Aufruf wird eine FRISCHE RegExp
// erzeugt (statt einer geteilten Modul-Konstante mit 'g'-Flag), damit
// aufeinanderfolgende Aufrufe sich nicht über lastIndex gegenseitig stören.
// ---------------------------------------------------------------------------
const MENTION_PATTERN_SOURCE =
  '@\\[([^\\]]+)\\]\\((person|document|version):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\\)';

function buildMentionRegex(): RegExp {
  return new RegExp(MENTION_PATTERN_SOURCE, 'g');
}

/** Entfernt Zeichen aus dem Label, die den Platzhalter selbst zerstören würden. */
function sanitizeLabel(label: string, fallbackId: string): string {
  const cleaned = label.replace(/[[\]]/g, '').trim();
  return cleaned || fallbackId.slice(0, 8);
}

function buildPlaceholder(type: MentionTargetType, id: string, label: string): string {
  return `@[${sanitizeLabel(label, id)}](${type}:${id})`;
}

// ---------------------------------------------------------------------------
// Parsen
// ---------------------------------------------------------------------------

/** Alle Platzhalter eines Texts, in Lesereihenfolge. */
export function parseMentions(body: string): { type: MentionTargetType; id: string }[] {
  const re = buildMentionRegex();
  const result: { type: MentionTargetType; id: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    result.push({ type: match[2] as MentionTargetType, id: match[3] });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Anzeigen
// ---------------------------------------------------------------------------

function buildMentionChip(
  type: MentionTargetType,
  id: string,
  label: string,
  opts: RenderCommentBodyOptions,
): HTMLElement {
  const handler = type === 'person' ? opts.onPersonClick : type === 'document' ? opts.onDocumentClick : opts.onVersionClick;
  const text = `@${label}`;

  // Ohne Handler ein <span> statt eines funktionslosen <button> -- siehe
  // Entscheidung 7 im Dateikopf.
  const el = document.createElement(handler ? 'button' : 'span');
  if (el instanceof HTMLButtonElement) el.type = 'button';
  el.className = `mention-chip mention-chip--${type}`;
  if (handler) el.classList.add('mention-chip--clickable');
  el.dataset.mentionType = type;
  el.dataset.mentionId = id;
  el.textContent = text; // textContent, NIE innerHTML -- Label ist ungeprüfter Nutzertext.
  // Lange Titel (Dateinamen, Dokumenttitel) werden per CSS abgeschnitten
  // (siehe .mention-chip in document-detail.css) -- der volle Text bleibt
  // trotzdem über den Tooltip erreichbar.
  el.title = text;
  if (handler) el.addEventListener('click', () => handler(id));
  return el;
}

/**
 * Wandelt Kommentartext in DOM-Knoten um: normaler Text bleibt Text,
 * Platzhalter werden zu Chips. Der Klartext-Fallback für gelöschte Ziele
 * ergibt sich von selbst, weil das Label im Platzhalter steht und hier nie
 * gegen die Datenbank geprüft wird (siehe Entscheidung 1).
 */
export function renderCommentBody(body: string, opts: RenderCommentBodyOptions = {}): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const re = buildMentionRegex();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(body.slice(lastIndex, match.index)));
    }
    const [, label, rawType, id] = match;
    fragment.appendChild(buildMentionChip(rawType as MentionTargetType, id, label, opts));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    fragment.appendChild(document.createTextNode(body.slice(lastIndex)));
  }

  return fragment;
}

// ---------------------------------------------------------------------------
// Texteingabe
// ---------------------------------------------------------------------------

/**
 * Fügt den Platzhalter für `mention` an `cursorPos` ein, gefolgt von einem
 * Leerzeichen (damit direkt weitergetippt werden kann). Ersetzt dabei KEINEN
 * bestehenden Text -- siehe Entscheidung 3 im Dateikopf zur Erwartung an den
 * Aufrufer beim @-Menü.
 */
export function insertMentionPlaceholder(
  text: string,
  cursorPos: number,
  mention: { type: MentionTargetType; id: string; label: string },
): { text: string; cursorPos: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const inserted = `${buildPlaceholder(mention.type, mention.id, mention.label)} `;
  return {
    text: before + inserted + after,
    cursorPos: before.length + inserted.length,
  };
}

// ---------------------------------------------------------------------------
// Suche fürs @-Menü
// ---------------------------------------------------------------------------

const CANDIDATE_LIMIT = 8;

/**
 * Durchsucht Personen (aktive Profile, display_name) UND Dokumente (title,
 * ilike) nach `query`. Bei leerer Anfrage [] -- siehe Entscheidung 4.
 * Versionen sind hier bewusst nicht durchsuchbar -- siehe mentionForVersion().
 */
export async function searchMentionCandidates(query: string): Promise<MentionCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const needle = q.toLowerCase();

  const profiles = await listProfiles();
  const personMatches: MentionCandidate[] = profiles
    .filter((p) => p.is_active && p.display_name.toLowerCase().includes(needle))
    .slice(0, CANDIDATE_LIMIT)
    .map((p) => ({ type: 'person' as const, id: p.id, label: p.display_name }));

  // Kein Volltextindex nötig bei dieser Datenmenge (Plan Abschnitt 5,
  // Auftrag) -- ilike genügt. deleted_at is null, damit Papierkorb-Einträge
  // nicht erwähnbar werden.
  const { data, error } = await supabase
    .from('documents')
    .select('id, title')
    .is('deleted_at', null)
    .ilike('title', `%${q}%`)
    .order('title', { ascending: true })
    .limit(CANDIDATE_LIMIT);
  if (error) fail(error);

  const documentMatches: MentionCandidate[] = ((data ?? []) as { id: string; title: string }[]).map((d) => ({
    type: 'document' as const,
    id: d.id,
    label: d.title,
  }));

  return [...personMatches, ...documentMatches];
}

/**
 * Erwähnungs-Kandidat für eine KONKRETE Version aus einer bereits offenen
 * Versionsliste -- siehe Entscheidung 5 im Dateikopf. Label "v<Nummer>",
 * oder "propuesta" solange die Version noch keine Nummer hat (Vorschlag/
 * abgelehnt), im selben Wortlaut wie doc_reactivate_version() in der
 * Migration ("(propuesta)").
 */
export function mentionForVersion(version: VersionRow): MentionCandidate {
  const label = version.version_no != null ? `v${version.version_no}` : 'propuesta';
  return { type: 'version', id: version.id, label };
}
