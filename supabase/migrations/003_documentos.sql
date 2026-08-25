-- ============================================================================
-- Migration 003 — Dokumentenablage: Ordner, Dokumente, Versionen, Kommentare,
-- Aufgaben, RPCs, RLS und der private Storage-Bucket "documentos".
--
-- Für BESTEHENDE Installationen. Im Supabase SQL Editor als Ganzes
-- ausführen, NACH 002_roles.sql (diese Migration benutzt public.profiles
-- und die Rollenprüfung von dort). Das Skript ist idempotent: ein zweiter
-- Lauf ändert nichts mehr und macht nichts kaputt.
--
-- Siehe PLAN-DOCUMENTOS.md für den vollständigen Hintergrund. Kurzfassung:
-- Eine Tabelle (doc_versions) trägt ALLE Fassungen eines Dokuments -- die
-- aktuelle, alte, eingereichte Vorschläge und abgelehnte Vorschläge -- und
-- unterscheidet sie nur über `state`. Zustandswechsel laufen ausschließlich
-- über die RPC-Funktionen weiter unten, nie über einen Mehrschritt-
-- Schreibvorgang im Browser, damit die Invariante "genau eine current-Version
-- je Dokument" niemals kurzzeitig verletzt wird.
--
-- KEIN DEPLOY-HOOK AUF DIESEN TABELLEN. Die Website (der Astro-Build) zeigt
-- keine Dokumente -- ein Kommentar oder eine neue Version darf niemals einen
-- Vercel-Build auslösen. Die bestehenden Trigger aus SETUP-BACKEND.md
-- Abschnitt D hängen ausschließlich an `workshops` und `casas`. Falls das
-- hier jemand "nachrüsten" möchte: nicht tun, das ist Absicht, nicht Lücke.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. doc_folders — Ordner, beliebig tief verschachtelbar
-- ----------------------------------------------------------------------------
create table if not exists public.doc_folders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.doc_folders (id),   -- null = oberste Ebene
  name        text not null,
  -- Voreinstellung für neue Uploads in diesem Ordner. 'original' rührt
  -- Dateien nie an -- der sichere Standard, siehe PLAN-DOCUMENTOS.md
  -- Abschnitt 7. Kein Constraint verbietet einen Ordner als eigenen
  -- Vorfahren -- bei der Menge an Ordnern hier lohnt der Aufwand einer
  -- rekursiven Prüfung nicht; die Oberfläche baut den Baum ohnehin selbst.
  upload_mode text not null default 'original'
    constraint doc_folders_upload_mode_check
    check (upload_mode in ('original', 'foto')),
  sort_order  numeric not null default 0,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz                               -- Papierkorb
);

create index if not exists doc_folders_parent_sort_idx
  on public.doc_folders (parent_id, sort_order);

-- ----------------------------------------------------------------------------
-- 2. documents — der Titel ist unabhängig vom Dateinamen umbenennbar
-- ----------------------------------------------------------------------------
create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  folder_id        uuid not null references public.doc_folders (id),
  title            text not null,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  -- Von Triggern weiter unten gepflegt: Sortierung "zuletzt passiert" für
  -- Ordnerlisten und das spätere Chat-Panel, ohne teuren Join bei jeder
  -- Anzeige.
  last_activity_at timestamptz not null default now()
);

create index if not exists documents_folder_idx
  on public.documents (folder_id);

create index if not exists documents_last_activity_idx
  on public.documents (last_activity_at desc);

-- ----------------------------------------------------------------------------
-- 3. doc_versions — der Kern. Trägt current/superseded/proposal/rejected
--    in einer einzigen Tabelle, siehe PLAN-DOCUMENTOS.md Abschnitt 4.2.
-- ----------------------------------------------------------------------------
create table if not exists public.doc_versions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents (id) on delete cascade,
  state          text not null
    constraint doc_versions_state_check
    check (state in ('current', 'superseded', 'proposal', 'rejected')),
  version_no     integer,        -- null solange Vorschlag oder abgelehnt
  -- Welche Version er ersetzen sollte/ersetzt hat. deferrable initially
  -- deferred, weil sonst ein kaskadierendes Löschen aller Versionen eines
  -- Dokuments (documents.id -> doc_versions.document_id on delete cascade)
  -- mitten in der Reihenfolge an dieser selbstreferenzierenden Fremdschlüssel-
  -- Prüfung scheitern könnte -- die ganze Kette gehört zum selben Dokument
  -- und wird in einem Zug gelöscht; die Prüfung darf deshalb erst am
  -- Transaktionsende laufen, wenn die ganze Kette bereits weg ist.
  targets_id     uuid references public.doc_versions (id)
    deferrable initially deferred,

  -- ORIGINALDATEI. Wird nie verändert, nie neu kodiert, nie überschrieben.
  -- storage_provider ist bewusst OHNE check-Constraint: die Spalte hält die
  -- Tür zu einem zweiten Ablageort offen (Cloudflare R2, siehe
  -- PLAN-DOCUMENTOS.md Abschnitt 7) -- ein zusätzlicher erlaubter Wert
  -- soll dafür keine weitere Migration brauchen.
  storage_provider text not null default 'supabase',
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null,
  byte_size        bigint not null,
  checksum         text,         -- SHA-256 des Originals, für Deduplizierung

  -- ZUSÄTZLICHES Vorschaubild, klein und verlustbehaftet. Ersetzt das
  -- Original nicht, sondern entlastet nur Ladezeit und Datenverkehr.
  -- Null, wenn für diesen Dateityp keine Vorschau erzeugt werden konnte.
  preview_path       text,
  preview_byte_size  bigint,

  -- Woher die Datei kommt. 'generated' ist der Haken für das spätere
  -- CI-Designsystem (PLAN-DOCUMENTOS.md Abschnitt 10): erzeugte Dokumente
  -- sind ganz normale Versionen und erben Historie, Kommentare und
  -- Aufgaben, ohne dass dafür etwas Zweites gebaut werden müsste.
  source         text not null default 'upload'
    constraint doc_versions_source_check
    check (source in ('upload', 'generated')),
  source_payload jsonb,

  note           text not null default '',   -- "Statik-Nachweis ergänzt"
  uploaded_by    uuid not null references auth.users (id),
  uploaded_at    timestamptz not null default now(),

  -- Entscheidung über einen Vorschlag (nur bei state in ('current' nach
  -- Annahme, 'rejected'))
  decided_by     uuid references auth.users (id),
  decided_at     timestamptz,
  reject_reason  text
);

-- Genau eine gültige Fassung je Dokument -- von der Datenbank erzwungen,
-- nicht von der Oberfläche erhofft.
create unique index if not exists doc_versions_one_current
  on public.doc_versions (document_id) where state = 'current';

create unique index if not exists doc_versions_no
  on public.doc_versions (document_id, version_no) where version_no is not null;

create index if not exists doc_versions_document_state_idx
  on public.doc_versions (document_id, state);

create index if not exists doc_versions_targets_idx
  on public.doc_versions (targets_id);

-- ----------------------------------------------------------------------------
-- 4. Kommentare, Erwähnungen, Aufgaben, Gelesen-Stand
-- ----------------------------------------------------------------------------
create table if not exists public.doc_comments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  author_id   uuid not null references auth.users (id),
  body        text not null,   -- Text mit Platzhaltern @{{person:uuid}} usw.
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

create index if not exists doc_comments_document_idx
  on public.doc_comments (document_id, created_at);

-- Eigene Zeile je Erwähnung. Nur so ist die Rückrichtung abfragbar:
-- "welche Kommentare verweisen auf DIESE Version?"
create table if not exists public.doc_mentions (
  id                 uuid primary key default gen_random_uuid(),
  comment_id         uuid not null references public.doc_comments (id) on delete cascade,
  target_type        text not null
    constraint doc_mentions_target_type_check
    check (target_type in ('person', 'document', 'version')),
  target_user_id     uuid references auth.users (id),
  target_document_id uuid references public.documents (id) on delete cascade,
  target_version_id  uuid references public.doc_versions (id) on delete cascade
);

create index if not exists doc_mentions_comment_idx
  on public.doc_mentions (comment_id);
create index if not exists doc_mentions_user_idx
  on public.doc_mentions (target_user_id);
create index if not exists doc_mentions_document_idx
  on public.doc_mentions (target_document_id);
create index if not exists doc_mentions_version_idx
  on public.doc_mentions (target_version_id);

create table if not exists public.doc_tasks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  comment_id  uuid references public.doc_comments (id) on delete set null,
  title       text not null,
  assignee_id uuid references auth.users (id),
  due_date    date,
  status      text not null default 'open'
    constraint doc_tasks_status_check
    check (status in ('open', 'done')),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references auth.users (id)
);

create index if not exists doc_tasks_document_idx
  on public.doc_tasks (document_id, status);
create index if not exists doc_tasks_assignee_idx
  on public.doc_tasks (assignee_id, status);

-- Gelesen-Stand je Person und Dokument. Trägt "neu seit deinem letzten
-- Besuch" schon lange bevor das Chat-Panel existiert.
create table if not exists public.doc_reads (
  user_id      uuid references auth.users (id),
  document_id  uuid references public.documents (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

-- ----------------------------------------------------------------------------
-- 5. doc_activity — Ereignis-Verlauf als View, nicht als Tabelle.
--
-- Gemeinsame Spalten, damit Versionen, Kommentare und Aufgaben in EINER
-- Zeitleiste erscheinen können: document_id/at fürs Einsortieren, kind fürs
-- Unterscheiden, event_id/actor_id/version_id für Verweise und Avatare,
-- state für Status-Badges (Versionszustand bzw. Aufgabenstatus, bei
-- Kommentaren immer null) und summary als kurzer Anzeigetext (Notiz,
-- Kommentartext bzw. Aufgabentitel).
-- ----------------------------------------------------------------------------
drop view if exists public.doc_activity;
create view public.doc_activity as
  select
    v.id           as event_id,
    v.document_id  as document_id,
    'version'::text as kind,
    v.uploaded_at  as at,
    v.uploaded_by  as actor_id,
    v.id           as version_id,
    v.state        as state,
    v.note         as summary
  from public.doc_versions v
  union all
  select
    c.id,
    c.document_id,
    'comment'::text,
    c.created_at,
    c.author_id,
    null::uuid,
    null::text,
    c.body
  from public.doc_comments c
  union all
  select
    t.id,
    t.document_id,
    'task'::text,
    t.created_at,
    t.created_by,
    null::uuid,
    t.status,
    t.title
  from public.doc_tasks t;

-- ----------------------------------------------------------------------------
-- 6. Trigger: documents.last_activity_at bei Versionen/Kommentaren/Aufgaben
--    nachziehen. Eine gemeinsame Funktion für alle drei Tabellen -- jede
--    hat eine document_id-Spalte, mehr braucht die Funktion nicht zu wissen.
-- ----------------------------------------------------------------------------
create or replace function public.doc_touch_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.documents
     set last_activity_at = now()
   where id = coalesce(new.document_id, old.document_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists doc_versions_touch_activity on public.doc_versions;
create trigger doc_versions_touch_activity
  after insert or update on public.doc_versions
  for each row execute function public.doc_touch_activity();

drop trigger if exists doc_comments_touch_activity on public.doc_comments;
create trigger doc_comments_touch_activity
  after insert or update on public.doc_comments
  for each row execute function public.doc_touch_activity();

drop trigger if exists doc_tasks_touch_activity on public.doc_tasks;
create trigger doc_tasks_touch_activity
  after insert or update on public.doc_tasks
  for each row execute function public.doc_touch_activity();

-- ----------------------------------------------------------------------------
-- 7. Zustandsübergänge für doc_versions -- je EIN Aufruf aus dem Browser,
--    im Muster von publish_workshop/publish_casa in supabase/schema.sql.
--
--    Bewusste Einschränkung (siehe Abschnitt 9 unten): authenticated bekommt
--    auf doc_versions NUR select-Rechte. Jede neue Zeile und jeder
--    Zustandswechsel läuft ausschließlich über diese Funktionen -- damit
--    die Invariante "genau eine current-Version je Dokument" nie über einen
--    Mehrschritt-Schreibvorgang im Browser kurzzeitig verletzt werden kann.
--    Die Funktionen selbst laufen security definer und sind davon nicht
--    betroffen.
-- ----------------------------------------------------------------------------

/** Direkt-Upload ohne Abstimmung: neue Zeile sofort current. */
create or replace function public.doc_publish_version(
  p_document_id       uuid,
  p_storage_path      text,
  p_file_name         text,
  p_mime_type         text,
  p_byte_size         bigint,
  p_checksum          text default null,
  p_preview_path      text default null,
  p_preview_byte_size bigint default null,
  p_source            text default 'upload',
  p_source_payload    jsonb default null,
  p_note              text default '',
  p_storage_provider  text default 'supabase'
)
returns public.doc_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_current_id uuid;
  v_next_no         integer;
  v_row             public.doc_versions;
begin
  if not exists (
    select 1 from public.documents
     where id = p_document_id and deleted_at is null
  ) then
    raise exception 'No existe el documento %', p_document_id using errcode = 'no_data_found';
  end if;

  select id into v_prev_current_id
    from public.doc_versions
   where document_id = p_document_id and state = 'current';

  select coalesce(max(version_no), 0) + 1 into v_next_no
    from public.doc_versions
   where document_id = p_document_id;

  -- Bisherige aktuelle Version ablösen, BEVOR die neue eingefügt wird --
  -- der partielle Unique-Index doc_versions_one_current lässt sonst keine
  -- zweite "current"-Zeile zu.
  update public.doc_versions
     set state = 'superseded'
   where document_id = p_document_id
     and state = 'current';

  insert into public.doc_versions (
    document_id, state, version_no, targets_id,
    storage_provider, storage_path, file_name, mime_type, byte_size, checksum,
    preview_path, preview_byte_size,
    source, source_payload, note, uploaded_by
  ) values (
    p_document_id, 'current', v_next_no, v_prev_current_id,
    p_storage_provider, p_storage_path, p_file_name, p_mime_type, p_byte_size, p_checksum,
    p_preview_path, p_preview_byte_size,
    p_source, p_source_payload, p_note, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

/** Datei hoch -> proposal, targets_id = aktuelle Version. Keine Nummer. */
create or replace function public.doc_submit_proposal(
  p_document_id       uuid,
  p_storage_path      text,
  p_file_name         text,
  p_mime_type         text,
  p_byte_size         bigint,
  p_checksum          text default null,
  p_preview_path      text default null,
  p_preview_byte_size bigint default null,
  p_source            text default 'upload',
  p_source_payload    jsonb default null,
  p_note              text default '',
  p_storage_provider  text default 'supabase'
)
returns public.doc_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_id uuid;
  v_row        public.doc_versions;
begin
  if not exists (
    select 1 from public.documents
     where id = p_document_id and deleted_at is null
  ) then
    raise exception 'No existe el documento %', p_document_id using errcode = 'no_data_found';
  end if;

  select id into v_current_id
    from public.doc_versions
   where document_id = p_document_id and state = 'current';

  insert into public.doc_versions (
    document_id, state, version_no, targets_id,
    storage_provider, storage_path, file_name, mime_type, byte_size, checksum,
    preview_path, preview_byte_size,
    source, source_payload, note, uploaded_by
  ) values (
    p_document_id, 'proposal', null, v_current_id,
    p_storage_provider, p_storage_path, p_file_name, p_mime_type, p_byte_size, p_checksum,
    p_preview_path, p_preview_byte_size,
    p_source, p_source_payload, p_note, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

/** proposal -> current mit nächster Nummer; bisherige aktuelle -> superseded. */
create or replace function public.doc_accept_proposal(p_version_id uuid)
returns public.doc_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_next_no     integer;
  v_row         public.doc_versions;
begin
  select document_id into v_document_id
    from public.doc_versions
   where id = p_version_id and state = 'proposal';

  if v_document_id is null then
    raise exception 'No existe la propuesta % (o ya fue decidida)', p_version_id
      using errcode = 'no_data_found';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next_no
    from public.doc_versions
   where document_id = v_document_id;

  update public.doc_versions
     set state = 'superseded'
   where document_id = v_document_id
     and state = 'current';

  update public.doc_versions
     set state      = 'current',
         version_no = v_next_no,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_version_id
  returning * into v_row;

  return v_row;
end;
$$;

/**
 * proposal -> rejected mit reject_reason/decided_by/decided_at.
 * targets_id wird dabei auf die zu DIESEM Zeitpunkt aktuelle Version gesetzt
 * -- die kann eine andere sein als die, die beim Einreichen aktuell war,
 * falls in der Zwischenzeit eine andere Propuesta angenommen wurde.
 */
create or replace function public.doc_reject_proposal(p_version_id uuid, p_reason text)
returns public.doc_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_current_id  uuid;
  v_row         public.doc_versions;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'El motivo de rechazo es obligatorio';
  end if;

  select document_id into v_document_id
    from public.doc_versions
   where id = p_version_id and state = 'proposal';

  if v_document_id is null then
    raise exception 'No existe la propuesta % (o ya fue decidida)', p_version_id
      using errcode = 'no_data_found';
  end if;

  select id into v_current_id
    from public.doc_versions
   where document_id = v_document_id and state = 'current';

  update public.doc_versions
     set state         = 'rejected',
         targets_id    = v_current_id,
         reject_reason = p_reason,
         decided_by    = auth.uid(),
         decided_at    = now()
   where id = p_version_id
  returning * into v_row;

  return v_row;
end;
$$;

/**
 * Reaktiviert eine alte Version: legt eine NEUE Zeile mit demselben
 * storage_path an (die Datei wird nicht kopiert) und macht sie current.
 * Schreibt NIE die alte Zeile um -- sonst ginge Historie verloren, siehe
 * PLAN-DOCUMENTOS.md Abschnitt 4.2.
 */
create or replace function public.doc_reactivate_version(p_version_id uuid)
returns public.doc_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source  public.doc_versions;
  v_next_no integer;
  v_row     public.doc_versions;
begin
  select * into v_source
    from public.doc_versions
   where id = p_version_id;

  if v_source.id is null then
    raise exception 'No existe la versión %', p_version_id using errcode = 'no_data_found';
  end if;

  if v_source.state = 'current' then
    raise exception 'La versión % ya es la vigente', p_version_id;
  end if;

  if v_source.state = 'proposal' then
    raise exception 'Una propuesta sin decidir no se puede reactivar -- acéptala o recházala primero';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_next_no
    from public.doc_versions
   where document_id = v_source.document_id;

  update public.doc_versions
     set state = 'superseded'
   where document_id = v_source.document_id
     and state = 'current';

  insert into public.doc_versions (
    document_id, state, version_no, targets_id,
    storage_provider, storage_path, file_name, mime_type, byte_size, checksum,
    preview_path, preview_byte_size,
    source, source_payload, note, uploaded_by
  ) values (
    v_source.document_id, 'current', v_next_no, v_source.id,
    v_source.storage_provider, v_source.storage_path, v_source.file_name,
    v_source.mime_type, v_source.byte_size, v_source.checksum,
    v_source.preview_path, v_source.preview_byte_size,
    v_source.source, v_source.source_payload,
    'Reactivada desde la versión ' || coalesce(v_source.version_no::text, '(propuesta)'),
    auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. is_active_member() -- aktives, angemeldetes Profil? Trennt "hat einen
--    Login" von "darf die Dokumentenablage noch benutzen": eine deaktivierte
--    Person (profiles.is_active = false) verliert damit sofort den Zugriff,
--    ohne dass ihr Auth-Zugang gelöscht werden müsste. security definer aus
--    demselben Grund wie may_edit_site() in 002_roles.sql.
-- ----------------------------------------------------------------------------
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and is_active
  );
$$;

-- ----------------------------------------------------------------------------
-- 9. RLS & Rechte
--
-- anon bekommt auf ALLEN neuen Tabellen und der View keinerlei Rechte.
-- authenticated bekommt Zugriff, aber gefiltert über is_active_member() --
-- ein Login allein reicht nicht, das Profil muss aktiv sein.
--
-- doc_versions ist die einzige Ausnahme von "volles CRUD": dort gibt es nur
-- select, siehe Kommentar vor Abschnitt 7. Neue Zeilen und Zustandswechsel
-- laufen ausschließlich über die RPC-Funktionen (security definer, daher
-- von dieser Einschränkung nicht betroffen).
-- ----------------------------------------------------------------------------
alter table public.doc_folders enable row level security;
alter table public.documents enable row level security;
alter table public.doc_versions enable row level security;
alter table public.doc_comments enable row level security;
alter table public.doc_mentions enable row level security;
alter table public.doc_tasks enable row level security;
alter table public.doc_reads enable row level security;

grant usage on schema public to anon, authenticated;

revoke all on public.doc_folders from anon;
revoke all on public.documents from anon;
revoke all on public.doc_versions from anon;
revoke all on public.doc_comments from anon;
revoke all on public.doc_mentions from anon;
revoke all on public.doc_tasks from anon;
revoke all on public.doc_reads from anon;

grant select, insert, update, delete on public.doc_folders to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select on public.doc_versions to authenticated;
grant select, insert, update, delete on public.doc_comments to authenticated;
grant select, insert, update, delete on public.doc_mentions to authenticated;
grant select, insert, update, delete on public.doc_tasks to authenticated;
grant select, insert, update, delete on public.doc_reads to authenticated;

-- Supabase vergibt per ALTER DEFAULT PRIVILEGES automatisch ALL auf neue
-- Objekte an anon. Deshalb erst wegnehmen, dann gezielt nur select geben.
revoke all on public.doc_activity from anon, authenticated;
grant select on public.doc_activity to authenticated;

drop policy if exists doc_folders_active_members on public.doc_folders;
create policy doc_folders_active_members
  on public.doc_folders for all
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

drop policy if exists documents_active_members on public.documents;
create policy documents_active_members
  on public.documents for all
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

drop policy if exists doc_versions_active_members_read on public.doc_versions;
create policy doc_versions_active_members_read
  on public.doc_versions for select
  to authenticated
  using (public.is_active_member());

drop policy if exists doc_comments_active_members on public.doc_comments;
create policy doc_comments_active_members
  on public.doc_comments for all
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

drop policy if exists doc_mentions_active_members on public.doc_mentions;
create policy doc_mentions_active_members
  on public.doc_mentions for all
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

drop policy if exists doc_tasks_active_members on public.doc_tasks;
create policy doc_tasks_active_members
  on public.doc_tasks for all
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

drop policy if exists doc_reads_active_members on public.doc_reads;
create policy doc_reads_active_members
  on public.doc_reads for all
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

revoke all on function public.is_active_member() from public;
grant execute on function public.is_active_member() to authenticated;

revoke all on function public.doc_publish_version(uuid, text, text, text, bigint, text, text, bigint, text, jsonb, text, text) from public;
revoke all on function public.doc_submit_proposal(uuid, text, text, text, bigint, text, text, bigint, text, jsonb, text, text) from public;
revoke all on function public.doc_accept_proposal(uuid) from public;
revoke all on function public.doc_reject_proposal(uuid, text) from public;
revoke all on function public.doc_reactivate_version(uuid) from public;

grant execute on function public.doc_publish_version(uuid, text, text, text, bigint, text, text, bigint, text, jsonb, text, text) to authenticated;
grant execute on function public.doc_submit_proposal(uuid, text, text, text, bigint, text, text, bigint, text, jsonb, text, text) to authenticated;
grant execute on function public.doc_accept_proposal(uuid) to authenticated;
grant execute on function public.doc_reject_proposal(uuid, text) to authenticated;
grant execute on function public.doc_reactivate_version(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Storage: privater Bucket "documentos"
--
-- ACHTUNG, SICHERHEITSKRITISCH: public MUSS false sein. casa-photos ist
-- public = true, weil Hausfotos auf der Website landen sollen -- hier ist
-- das Gegenteil der Fall. Wäre dieser Bucket öffentlich, wäre jeder
-- Mietvertrag unter einer erratbaren Adresse abrufbar, ganz ohne Login,
-- dauerhaft. "on conflict do update" statt "do nothing": falls der Bucket
-- durch einen früheren, fehlerhaften Versuch schon mit public = true
-- existieren sollte, korrigiert diese Migration das -- bei einer derart
-- sicherheitskritischen Einstellung darf ein zweiter Lauf nicht bei einem
-- falschen Bestand stehen bleiben.
--
-- Anzeigen/Herunterladen läuft NICHT über getPublicUrl() wie bei den
-- Fotos, sondern über createSignedUrl(path, 60) im Client-Code -- eine
-- Adresse, die nach einer Minute verfällt.
--
-- Pfadaufbau (an image-upload.ts angelehnt), von documents-upload.ts
-- gebaut, nicht von der Datenbank erzwungen:
--   {document_id}/{version_id}.{ext}          Original
--   {document_id}/{version_id}.preview.jpg    Vorschaubild (falls vorhanden)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do update set public = false;

-- Nur angemeldete, aktive Personen, lesend wie schreibend. Kein anon.
drop policy if exists documentos_active_members on storage.objects;
create policy documentos_active_members
  on storage.objects for all
  to authenticated
  using (bucket_id = 'documentos' and public.is_active_member())
  with check (bucket_id = 'documentos' and public.is_active_member());
