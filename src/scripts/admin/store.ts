import { supabase } from '../../lib/supabase';
import { hasValidSession } from './auth';
import { reauthDialog } from './dialog';
import { humanError, sessionCancelledError } from './errors';

/**
 * Datenzugriff des Backends -- einmal generisch statt zweimal abgeschrieben.
 *
 * Im alten Backend lagen `workshops-panel.ts` und `casas-panel.ts` mit je 559
 * Zeilen nebeneinander und waren zu rund siebzig Prozent identisch (Problem
 * P14). Laden, Anlegen, Ändern, Archivieren, Löschen und Sortieren sind für
 * beide Inhaltsarten dasselbe und stehen deshalb genau hier.
 *
 * Zwei Dinge macht dieser Store anders als das alte Panel:
 *
 * 1. **Session-Wache (Problem P13).** Lief das JWT während des Tippens ab,
 *    schlug früher das Speichern mit einer rohen englischen Meldung fehl und
 *    die Eingaben waren verloren. Hier wird vor jedem Schreibvorgang die
 *    Sitzung geprüft, bei Ablauf erscheint der Reauth-Dialog, und danach läuft
 *    derselbe Vorgang genau einmal erneut.
 *
 * 2. **Veröffentlichen in einem Aufruf.** Der Browser macht keine
 *    Mehrschritt-Schreibvorgänge; Schnappschuss, Zeitstempel und Status setzt
 *    eine Datenbankfunktion (siehe supabase/schema.sql).
 */

export type EntityStatus = 'draft' | 'published' | 'archived';

export interface Entity {
  id: string;
  sort_order: number;
  status: EntityStatus;
  has_unpublished_changes: boolean;
  published_at: string | null;
}

export type StoreTable = 'workshops' | 'casas';

export interface Store<T extends Entity> {
  list(): Promise<T[]>;
  create(patch: Partial<T>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<void>;
  remove(id: string): Promise<void>;
  setSortOrder(id: string, value: number): Promise<void>;
  publish(id: string): Promise<void>;
  discardChanges(id: string): Promise<void>;
  setStatus(id: string, status: EntityStatus): Promise<void>;
}

/**
 * Der Client kennt kein generiertes `Database`-Typargument, deshalb kollidiert
 * die Spaltenprüfung von supabase-js mit unserem `Partial<T>`. Welche Spalten
 * gültig sind, prüft ohnehin Postgres -- an dieser einen Stelle wird die
 * Prüfung darum bewusst umgangen, statt überall `any` zu streuen.
 */
function columns<T>(patch: Partial<T>): never {
  return patch as never;
}

/**
 * Führt einen Schreibvorgang aus und wiederholt ihn nach erfolgreicher
 * Neuanmeldung genau einmal. Bricht die Nutzerin den Dialog ab, kommt ein
 * erkennbarer Fehler zurück -- der Aufrufer lässt das Formular dann einfach
 * stehen, damit nichts verloren geht.
 */
async function withSession<R>(run: () => Promise<R>): Promise<R> {
  if (!(await hasValidSession())) {
    const ok = await reauthDialog();
    if (!ok) throw sessionCancelledError();
  }
  return run();
}

/** Wirft die Supabase-Meldung als bereits übersetzten Satz weiter. */
function fail(error: unknown): never {
  const human = humanError(error);
  const err = new Error(human.message);
  if (human.detail) err.cause = human.detail;
  throw err;
}

const rpcNames = {
  workshops: { publish: 'publish_workshop', discard: 'discard_workshop_changes' },
  casas: { publish: 'publish_casa', discard: 'discard_casa_changes' },
} as const;

export function createStore<T extends Entity>(table: StoreTable): Store<T> {
  const rpc = rpcNames[table];

  return {
    /** Alle Einträge, auch Entwürfe und Archiviertes -- das ist die Backend-Sicht. */
    async list(): Promise<T[]> {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) fail(error);
      return (data ?? []) as T[];
    },

    async create(patch: Partial<T>): Promise<T> {
      return withSession(async () => {
        const { data, error } = await supabase
          .from(table)
          .insert(columns(patch))
          .select()
          .single();
        if (error) fail(error);
        return data as T;
      });
    },

    async update(id: string, patch: Partial<T>): Promise<void> {
      return withSession(async () => {
        const { error } = await supabase.from(table).update(columns(patch)).eq('id', id);
        if (error) fail(error);
      });
    },

    async remove(id: string): Promise<void> {
      return withSession(async () => {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) fail(error);
      });
    },

    /**
     * Genau ein UPDATE. Der Wert kommt aus `fractionalOrder()` und liegt
     * zwischen den neuen Nachbarn -- die übrigen Zeilen bleiben unberührt.
     */
    async setSortOrder(id: string, value: number): Promise<void> {
      return withSession(async () => {
        const { error } = await supabase
          .from(table)
          .update(columns<Entity>({ sort_order: value }))
          .eq('id', id);
        if (error) fail(error);
      });
    },

    async publish(id: string): Promise<void> {
      return withSession(async () => {
        const { error } = await supabase.rpc(rpc.publish, { p_id: id });
        if (error) fail(error);
      });
    },

    async discardChanges(id: string): Promise<void> {
      return withSession(async () => {
        const { error } = await supabase.rpc(rpc.discard, { p_id: id });
        if (error) fail(error);
      });
    },

    async setStatus(id: string, status: EntityStatus): Promise<void> {
      return withSession(async () => {
        const { error } = await supabase
          .from(table)
          .update(columns<Entity>({ status }))
          .eq('id', id);
        if (error) fail(error);
      });
    },
  };
}
