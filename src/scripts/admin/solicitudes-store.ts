import { supabase } from '../../lib/supabase';
import { withSession, fail } from './documents-store';

/**
 * Datenzugriff für den Anfragebereich (#/solicitudes).
 *
 * Setzt den offenen Punkt 1 aus der Übergabe-PR um: Anfragen aus
 * "Las abejas educan" (und seit 008_on_tour.sql auch "On Tour") landen in
 * public.solicitudes, aber bislang kennt niemand im Panel diese Tabelle.
 * Anfragen sind live, seit das Formular ausgeliefert ist -- ohne diesen
 * Bereich kann niemand sie beantworten.
 *
 * Bewusst KEIN eigener withSession()/fail() wie in store.ts: dieselben zwei
 * Hilfsmittel stehen schon exportiert in documents-store.ts (dort für
 * documents-upload.ts freigegeben) und tun hier genau dasselbe -- Sitzung
 * vor jedem Schreibvorgang prüfen, bei Ablauf einmal erneut versuchen, einen
 * bereits übersetzten Fehler werfen. Eine dritte Kopie wäre nur Abschrift.
 *
 * ----------------------------------------------------------------------------
 * WAS DIESER STORE NICHT TUT
 * ----------------------------------------------------------------------------
 * Kein list()-Analogon zu store.ts: Anfragen kennen weder sort_order noch
 * Entwurf/Veröffentlicht -- es gibt nichts zu sortieren und nichts zu
 * veröffentlichen. Der Bearbeitungsstand ist `estado`, gesetzt von der
 * Person, die die Anfrage bearbeitet, nicht von der Website.
 *
 * Kein echtes update() für beliebige Spalten: die einzige erlaubte Änderung
 * durch das Panel ist der Bearbeitungsstand (setEstado). Die übrigen Spalten
 * sind das, was die anfragende Person geschrieben hat -- daran ändert eine
 * Verwaltungsoberfläche nichts, das wäre eine Verfälschung des Nachweises
 * (siehe consentimiento_texto in Migration 005).
 *
 * Löschen läuft NICHT über ein einfaches .delete() wie bei den anderen
 * Tabellen, sondern über die RPC-Funktion public.borrar_solicitud() aus
 * 005_solicitudes.sql: sie ist security definer und die einzige Stelle, die
 * das Recht dazu hat (siehe Kommentar dort -- echtes Löschen nach Art. 15
 * Ley 18.331, kein Soft-Delete wie bei workshops/casas/modulos).
 */

export type SolicitudEstado = 'neu' | 'beantwortet' | 'confirmado' | 'cancelado';
export type SolicitudOrigen = 'escuelas' | 'on_tour';

export interface SolicitudRow {
  id: string;
  creado_en: string;
  origen: SolicitudOrigen;
  modulos: string[];
  fecha_1: string;
  fecha_2: string | null;

  /* --- Schulanfrage (origen = 'escuelas') --- */
  alumnos: number | null;
  clase: string | null;
  escuela: string | null;

  /* --- On-Tour-Anfrage (origen = 'on_tour') --- */
  personas: number | null;
  zona: string | null;
  organizacion: string | null;
  lugar: string | null;

  /* --- immer --- */
  docente: string;
  mail: string;
  telefono: string | null;
  nota: string | null;
  consentimiento: boolean;
  consentimiento_en: string;
  consentimiento_texto: string;
  estado: SolicitudEstado;
}

/**
 * Alle Anfragen, neueste zuerst -- passend zum Index
 * `solicitudes_estado_creado_idx` aus Migration 005. Gefiltert wird in der
 * Ansicht (solicitudes-view.ts), nicht hier: es sind wenige Zeilen, und eine
 * einzige geladene Liste erlaubt der Ansicht, die Anzahl je Status direkt an
 * den Filterknöpfen zu zeigen.
 */
export async function listSolicitudes(): Promise<SolicitudRow[]> {
  const { data, error } = await supabase
    .from('solicitudes')
    .select('*')
    .order('creado_en', { ascending: false });
  if (error) fail(error);
  return (data ?? []) as SolicitudRow[];
}

export async function getSolicitud(id: string): Promise<SolicitudRow | null> {
  const { data, error } = await supabase.from('solicitudes').select('*').eq('id', id).maybeSingle();
  if (error) fail(error);
  return (data as SolicitudRow | null) ?? null;
}

/** Die einzige Spalte, die diese Oberfläche ändern darf -- siehe Dateikopf. */
export async function setEstado(id: string, estado: SolicitudEstado): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.from('solicitudes').update({ estado }).eq('id', id);
    if (error) fail(error);
  });
}

/**
 * Endgültiges Löschen über die RPC-Funktion aus 005_solicitudes.sql.
 * Wirft mit `errcode = 'P0002'`, wenn die Zeile inzwischen (etwa aus einem
 * zweiten geöffneten Tab) schon weg ist -- fail() übersetzt das wie jeden
 * anderen Datenbankfehler.
 */
export async function borrarSolicitud(id: string): Promise<void> {
  return withSession(async () => {
    const { error } = await supabase.rpc('borrar_solicitud', { p_id: id });
    if (error) fail(error);
  });
}
