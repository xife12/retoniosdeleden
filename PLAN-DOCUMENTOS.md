# Plan — Dokumentenablage im Backend

**Stand: 24. August 2026.** Planung, noch nicht umgesetzt. Ergänzt den
bestehenden Bereich `/admin` um eine dritte Sektion neben Talleres und
Casas de barro.

---

## 1. Warum es dieses Modul gibt

Catalina und die Schwiegertochter tauschen Dokumente über WhatsApp aus —
Baupläne, Anträge, Verträge. Niemand weiß mehr, wo eine Datei liegt und
welche Fassung die aktuelle ist. Das Modul soll **eine verlässliche Quelle
der Wahrheit** sein, die zwei Fragen jederzeit beantwortet:

1. Welches ist die aktuell gültige Fassung dieses Dokuments?
2. Wer muss daran noch etwas tun?

Alles andere im Plan ist diesen beiden Fragen untergeordnet.

**Zwei Vorgaben stehen über allem anderen:**

- **Beliebig viele Personen** können dazukommen, wenn Maxi sie hinzufügt.
- **Die Qualität von Druckdateien darf nicht leiden.** Originale werden nie
  angetastet. Siehe Abschnitt 7 — dieser Punkt verändert die Speicherstrategie
  grundlegend.

---

## 2. Was schon da ist — Bestandsaufnahme

Damit dieser Plan nicht an der Wirklichkeit vorbeigeht, zuerst der geprüfte
Ist-Zustand. Alles hier ist aus dem Repository gelesen, nicht angenommen.

### Das Projekt

Retoños del Edén ist die erste Bio-Pistazienplantage Uruguays, betrieben von
einer Familie über vier Generationen (`src/data/nosotros.ts`). Die Website ist
ein rein statischer Astro-Build im Aquarell-und-Tusche-Look, zweisprachig
Spanisch/Englisch, mit der Biene Meli als Erzählerin.

Für dieses Modul relevant: **Stefan baut die Lehmhäuser von Hand**, **Catalina
führt die Workshops und betreut die Bienenstöcke**. Genau dort entstehen die
Dokumente, um die es geht — Baupläne, Baugenehmigungen, Verträge.

### Der Backend-Bereich `/admin`

| Punkt | Ist-Zustand |
|---|---|
| Adresse | `/admin`, eine einzige statische Seite (`src/pages/admin/index.astro`) |
| Anmeldung | Supabase Auth. **Genau ein Zugang**, im Dashboard von Hand angelegt (siehe `SETUP-BACKEND.md`, Schritt 3 — „für die Mutter") |
| Navigation | Zwei Knöpfe: `Talleres` und `Casas de barro` |
| Sprache | **Spanisch** („Cerrar sesión", „Publicar", „Descartar cambios") |
| Aufbau | Hash-Router (`router.ts`), Ansichten werden zur Laufzeit gebaut, kein Modal |
| Ansichts-Vertrag | `AdminView` in `main.ts`: `mountList()`, `mountEditor()`, `unmount()` |
| Datenzugriff | Generischer Store (`store.ts`) mit Sitzungswache vor jedem Schreibvorgang |
| Rechte | RLS: `anon` hat auf den Basistabellen **gar keine** Rechte, `authenticated` darf **alles** |
| Veröffentlichen | Arbeitsstand vs. `published_payload`; die Website liest nur den Schnappschuss |
| Deploy-Hook | Trigger **nur** auf `workshops` und `casas`, feuert nur bei Publish/Sortieren/Löschen |
| Storage | Ein Bucket `casa-photos`, **öffentlich** (`public: true`) |
| Bildupload | `image-upload.ts` verkleinert client-seitig auf 2000 px, JPEG-Qualität 0,82 |

Wiederverwendbar ohne Änderung: `auth.ts`, `dialog.ts` (Reauth nach
Sitzungsablauf), `errors.ts` (übersetzte Fehlermeldungen), `toast.ts`,
`sortable.ts`, `dirty.ts`.

### Ein bereits vorhandenes Designsystem

Für das später geplante Erstellen von Dokumenten in der Firmen-CI ist das
Fundament schon da: `src/styles/tokens.css` („Sistema Edén" — Pigmente,
Typografie, Raum, Motion), die Aquarell-Filter in `WatercolorDefs.astro` und
die Styleguide-Seite unter `/design`. Ein Dokumentengenerator müsste diese
Tokens benutzen, nicht eigene erfinden.

---

## 3. Zugänge und Rollen

Kommentare, Vorschläge und Aufgaben brauchen einen echten Urheber. „Wer hat
diese Version hochgeladen?" ist mit einem geteilten Login nicht beantwortbar —
und genau diese Frage ist der halbe Zweck des Moduls. Jede Person bekommt also
einen eigenen Supabase-Auth-Zugang.

### Warum ein Rollenmodell nicht optional ist

Die heutige RLS-Regel lautet „`authenticated` darf alles". Solange nur die
Familie Zugang hat, wäre das vertretbar. **Sobald beliebige Personen dazukommen
können, ist es das nicht mehr:** Wer einen Login für die Dokumentenablage
bekäme, könnte damit auch Workshops und Lehmhäuser der öffentlichen Website
bearbeiten, veröffentlichen und löschen.

Das Rollenmodell gehört deshalb in **Phase 0**, nicht in eine spätere Phase.

```sql
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,          -- "Catalina", "Stefan", "Maxi"
  initials     text not null,          -- 1–2 Zeichen für den Avatar
  role         text not null default 'member'
                 check (role in ('owner', 'editor', 'member')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
```

| Rolle | Darf | Wer |
|---|---|---|
| `owner` | alles, **plus Personen hinzufügen und entfernen** | Maxi |
| `editor` | Dokumente **und** die öffentliche Website (Talleres, Casas) | Catalina |
| `member` | nur Dokumente | alle übrigen |

Die bestehenden Regeln auf `workshops` und `casas` ändern sich dabei von
`using (true)` auf eine Rollenprüfung:

```sql
create or replace function public.may_edit_site()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and is_active and role in ('owner', 'editor')
  );
$$;

drop policy if exists workshops_authenticated_all on public.workshops;
create policy workshops_site_editors
  on public.workshops for all to authenticated
  using (public.may_edit_site()) with check (public.may_edit_site());
-- ebenso für casas und casa_images
```

> **Achtung bei der Migration.** Das berührt bestehende, funktionierende
> Tabellen. Der bestehende Zugang muss **vor** dem Umstellen der Policies ein
> Profil mit Rolle `editor` (oder `owner`) bekommen — sonst sperrt die Migration
> Catalina aus ihrem eigenen Backend aus. Reihenfolge in der Migration:
> `profiles` anlegen → Profile für alle vorhandenen `auth.users` erzeugen →
> erst dann die Policies tauschen.

### Wie Personen dazukommen

**Zunächst von Hand** (Phase 0, kein Code nötig): Supabase-Dashboard →
Authentication → Users → Add user, „Auto Confirm" aktivieren. Ein Trigger legt
beim ersten Login automatisch ein Profil mit Rolle `member` an; Maxi setzt
Anzeigename und ggf. eine höhere Rolle.

**Später eine eigene Ansicht** `#/documentos/personas` (Phase 5): Liste aller
Personen, Rolle ändern, deaktivieren, neue einladen. Das Einladen braucht die
Supabase-Admin-API und damit den `service_role`-Schlüssel — der darf **niemals**
in den Browser. Nötig ist dafür eine Supabase Edge Function (kostenlos bis
500.000 Aufrufe im Monat), die den Schlüssel serverseitig hält.

### Wenn Externe dazukommen

Sobald jemand von außen Zugang bekommt — Architekt, Buchhaltung, Behörde —
reicht „member sieht alles" nicht mehr. Dafür ist das Modell vorbereitet, aber
noch nicht ausgebaut:

```sql
-- Erst nötig, wenn jemand nur einzelne Ordner sehen soll (Phase 6).
create table public.doc_folder_access (
  folder_id uuid references public.doc_folders(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  can_write boolean not null default false,
  primary key (folder_id, user_id)
);
```

Solange die Tabelle leer ist, gilt die einfache Regel „`member` sieht alle
Ordner". Sobald für einen Ordner Einträge existieren, zählen nur noch diese.
Damit ist der Ausbau eine Ergänzung, kein Umbau.

---

## 4. Datenmodell

Im Muster des bestehenden Schemas: UUID-Primärschlüssel, `numeric` für
Sortierung per Drag & Drop, Zustandsübergänge als RPC-Funktion statt als
Mehrschritt-Schreibvorgang im Browser.

### 4.1 Ordner und Dokumente

```sql
create table public.doc_folders (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.doc_folders(id),   -- Verschachtelung möglich
  name        text not null,
  -- Voreinstellung für neue Uploads in diesem Ordner. 'original' rührt
  -- Dateien nie an -- der sichere Standard, siehe Abschnitt 7.
  upload_mode text not null default 'original'
                check (upload_mode in ('original', 'foto')),
  sort_order  numeric not null default 0,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz                               -- Papierkorb
);

create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  folder_id        uuid not null references public.doc_folders(id),
  title            text not null,   -- unabhängig vom Dateinamen umbenennbar
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  -- Von Triggern gepflegt: Sortierung "zuletzt passiert" ohne teuren Join.
  last_activity_at timestamptz not null default now()
);
```

Das Datenmodell kann Verschachtelung von Anfang an; die Oberfläche zeigt
zunächst nur eine Ebene. Tiefere Ordner später einzubauen kostet dann keine
Migration.

### 4.2 Versionen — der Kern

Eine Tabelle trägt **alle** Fassungen: die aktuelle, alte, eingereichte
Vorschläge und abgelehnte Vorschläge. Der Unterschied liegt allein im Zustand.

```sql
create table public.doc_versions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.documents(id) on delete cascade,
  state          text not null check (state in
                   ('current', 'superseded', 'proposal', 'rejected')),
  version_no     integer,        -- NULL solange Vorschlag oder abgelehnt
  targets_id     uuid references public.doc_versions(id),  -- welche Version er ersetzen sollte

  -- ORIGINALDATEI. Wird nie verändert, nie neu kodiert, nie überschrieben.
  -- storage_provider hält die Tür zu einem zweiten Ablageort offen
  -- (siehe Abschnitt 7, Cloudflare R2).
  storage_provider text not null default 'supabase',
  storage_path     text not null,
  file_name        text not null,
  mime_type        text not null,
  byte_size        bigint not null,
  checksum         text,         -- SHA-256 des Originals, für Deduplizierung

  -- ZUSÄTZLICHES Vorschaubild, klein und verlustbehaftet. Ersetzt das
  -- Original nicht, sondern entlastet nur Ladezeit und Datenverkehr.
  -- NULL, wenn für diesen Dateityp keine Vorschau erzeugt werden konnte.
  preview_path       text,
  preview_byte_size  bigint,

  -- Woher die Datei kommt. 'generated' ist der Haken für das spätere
  -- CI-Designsystem: erzeugte Dokumente sind ganz normale Versionen und
  -- erben Historie, Kommentare und Aufgaben, ohne dass dafür etwas
  -- Zweites gebaut werden müsste.
  source         text not null default 'upload'
                   check (source in ('upload', 'generated')),
  source_payload jsonb,

  note           text not null default '',   -- "Statik-Nachweis ergänzt"
  uploaded_by    uuid not null references auth.users(id),
  uploaded_at    timestamptz not null default now(),

  -- Entscheidung über einen Vorschlag
  decided_by     uuid references auth.users(id),
  decided_at     timestamptz,
  reject_reason  text
);

-- Genau eine gültige Fassung je Dokument — von der Datenbank erzwungen,
-- nicht von der Oberfläche erhofft.
create unique index doc_versions_one_current
  on public.doc_versions (document_id) where state = 'current';

create unique index doc_versions_no
  on public.doc_versions (document_id, version_no) where version_no is not null;
```

#### Zustände

| Zustand | Bedeutung |
|---|---|
| `proposal` | Hochgeladen, sichtbar für alle, aber noch nicht gültig. Wartet auf Abstimmung. Hat noch keine Nummer. |
| `current` | Die gültige Fassung. Genau eine je Dokument. Erscheint in der Ordnerliste. |
| `superseded` | War einmal gültig, wurde abgelöst. Behält ihre Nummer, bleibt ansehbar und herunterladbar. |
| `rejected` | Abgelehnter Vorschlag mit Begründung. Hängt an der Version, die er ersetzen sollte. Bleibt einsehbar. |

#### Übergänge (je eine RPC-Funktion, wie `publish_workshop`)

| Funktion | Wirkung |
|---|---|
| `doc_submit_proposal` | Datei hoch → `proposal`, `targets_id` = aktuelle Version |
| `doc_accept_proposal` | `proposal` → `current` mit nächster Nummer; bisherige aktuelle → `superseded` |
| `doc_reject_proposal` | `proposal` → `rejected` mit `reject_reason`, `decided_by`, `decided_at` |
| `doc_publish_version` | Direkt-Upload ohne Abstimmung: neue Zeile sofort `current` |
| `doc_reactivate_version` | Neue Zeile mit **demselben** `storage_path` → `current` |

Reaktivieren spult die Historie nie zurück, sondern erzeugt eine neue Version.
Nur so bleibt nachvollziehbar, was wann galt — und weil die Datei dieselbe
bleibt, kostet es keinen zusätzlichen Speicher.

> **Folge fürs Löschen:** Weil Reaktivieren und Deduplizierung dieselbe Datei
> mehrfach referenzieren können, darf ein Storage-Objekt erst gelöscht werden,
> **wenn keine Versionszeile mehr darauf zeigt**. Die Reihenfolge bleibt wie
> beim bestehenden Foto-Code: erst Storage, dann Zeile. Für `preview_path` gilt
> dasselbe.

### 4.3 Kommentare, Erwähnungen, Aufgaben

```sql
create table public.doc_comments (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  author_id   uuid not null references auth.users(id),
  body        text not null,   -- Text mit Platzhaltern @{{person:uuid}} usw.
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);

-- Eigene Zeile je Erwähnung. Nur so ist die Rückrichtung abfragbar:
-- "welche Kommentare verweisen auf DIESE Version?"
create table public.doc_mentions (
  id                 uuid primary key default gen_random_uuid(),
  comment_id         uuid not null references public.doc_comments(id) on delete cascade,
  target_type        text not null check (target_type in
                       ('person', 'document', 'version')),
  target_user_id     uuid references auth.users(id),
  target_document_id uuid references public.documents(id) on delete cascade,
  target_version_id  uuid references public.doc_versions(id) on delete cascade
);

create table public.doc_tasks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  comment_id  uuid references public.doc_comments(id) on delete set null,
  title       text not null,
  assignee_id uuid references auth.users(id),
  due_date    date,
  status      text not null default 'open' check (status in ('open', 'done')),
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references auth.users(id)
);

-- Gelesen-Stand je Person und Dokument. Trägt "neu seit deinem letzten
-- Besuch" schon lange bevor das Chat-Panel existiert.
create table public.doc_reads (
  user_id      uuid references auth.users(id),
  document_id  uuid references public.documents(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, document_id)
);
```

### 4.4 Verlauf als View, nicht als Tabelle

Der aufklappbare Ereignis-Verlauf je Version und später der Chat-Thread
brauchen dieselbe Zeitleiste aus Uploads, Entscheidungen, Kommentaren und
Aufgaben. Statt einer zweiten, ständig zu synchronisierenden Ereignistabelle
liefert eine `union all`-View das aus den bestehenden Zeilen — bei dieser
Datenmenge mühelos, und ohne die Möglichkeit, aus dem Tritt zu geraten.

```sql
create view public.doc_activity as
  select document_id, uploaded_at as at, 'version' as kind, ... from doc_versions
  union all
  select document_id, created_at,        'comment',        ... from doc_comments
  union all
  select document_id, created_at,        'task',           ... from doc_tasks;
```

---

## 5. Sicherheit

`anon` bekommt auf allen neuen Tabellen keinerlei Rechte. `authenticated` wird
über die Rollen aus Abschnitt 3 gefiltert. Bei Dokumenten kommt ein Punkt
hinzu, den man leicht falsch macht.

> **Der Bucket muss privat sein.** `casa-photos` ist `public: true` — Hausfotos
> sollen ja im Netz stehen. Der Dokumenten-Bucket muss `public: false` sein.
> Sonst wäre jeder Mietvertrag unter einer erratbaren Adresse abrufbar, ohne
> Login, dauerhaft.

```sql
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Nur angemeldete Personen, lesend wie schreibend. Kein anon.
create policy documentos_authenticated_all
  on storage.objects for all to authenticated
  using (bucket_id = 'documentos')
  with check (bucket_id = 'documentos');
```

Anzeigen und Herunterladen laufen deshalb **nicht** über `getPublicUrl()` wie
bei den Fotos, sondern über `createSignedUrl(path, 60)` — eine Adresse, die
nach einer Minute verfällt und für jede Vorschau frisch erzeugt wird.

Pfadaufbau, an `image-upload.ts` angelehnt:

```
{document_id}/{version_id}.{ext}            Original
{document_id}/{version_id}.preview.jpg      Vorschaubild (falls vorhanden)
```

Die Version im Pfad ist wichtig — Dateien werden nie überschrieben, nur neue
angelegt. Das macht jede alte Fassung dauerhaft abrufbar und Deduplizierung
überhaupt erst möglich.

**Deploy-Hook:** Für diese Tabellen wird **keiner** eingerichtet. Die Website
zeigt keine Dokumente; ein Kommentar darf keinen Vercel-Build auslösen. Die
bestehenden Trigger hängen an `workshops` und `casas` und sind nicht betroffen.

---

## 6. Vorschau

| Typ | Lösung | Aufwand |
|---|---|---|
| PDF | `<iframe src={signedUrl}>` — der Browser bringt seinen eigenen Betrachter samt Seitennavigation, Zoom und Suche mit | keiner |
| Bilder | `<img>` mit der Vorschau, „Original ansehen" lädt die volle Datei | keiner |
| Word, Excel | Dateisymbol, Größe, Datum, „Descargar" | keiner |

**Große Dateien werden nicht automatisch geladen.** Ab etwa 5 MB zeigt die
Detailansicht zunächst nur „Vista previa (48 MB) — cargar" statt die Datei
sofort zu ziehen. Ohne diese Bremse verbraucht jedes versehentliche Öffnen
eines Druck-PDFs so viel Datenverkehr wie zwanzig normale Dokumente. Das ist
die wirksamste einzelne Maßnahme gegen die Datenverkehrsgrenze — und sie kostet
nichts.

Zwei Einschränkungen: auf iOS ist das eingebettete PDF unzuverlässig — deshalb
immer zusätzlich „In neuem Tab öffnen" anbieten. Und für Office-Dateien gibt es
keine datenschutzkonforme kostenlose Vorschau; der Microsoft-Betrachter bräuchte
eine **öffentliche** Adresse und scheidet damit aus.

---

## 7. Speicher — und warum Originale unangetastet bleiben

### Die Grundregel

**Das Original wird nie verändert.** Keine Neukodierung, keine Skalierung,
keine Qualitätsstufe. Was hochgeladen wurde, kommt Byte für Byte identisch
wieder heraus — prüfbar über die gespeicherte SHA-256-Prüfsumme.

Kompression findet nur in Form eines **zusätzlichen, kleinen Vorschaubildes**
statt (`preview_path`). Das entlastet Ladezeit und Datenverkehr, ersetzt aber
nie die Datei. Wer „Descargar" drückt, bekommt immer das Original.

> **Damit ist ein früherer Vorschlag dieses Plans hinfällig.** Das automatische
> Verkleinern beim Upload — wie es `image-upload.ts` für Hausfotos macht — wäre
> für Druckdateien zerstörerisch und ist hier **nicht** vorgesehen. Es bleibt als
> ausdrückliche, benannte Option für Handyfotos von Papieren erhalten (siehe
> unten), niemals als Voreinstellung.

### Zwei Upload-Wege, sicher voreingestellt

| Weg | Was passiert | Wann |
|---|---|---|
| **Original behalten** *(Voreinstellung)* | Datei unverändert gespeichert, zusätzlich ein Vorschaubild | Druckdateien, Baupläne, Verträge, Scans — alles im Zweifel |
| **Als Foto behandeln** *(ausdrücklich zu wählen)* | Bild auf 2000 px verkleinert, JPEG 0,82 — spart etwa 90 % | Handyfoto eines Papiers, wo es nur um Lesbarkeit geht |

Die Voreinstellung ist je Ordner setzbar (`doc_folders.upload_mode`): ein
Ordner „Fotos vom Bau" kann standardmäßig verkleinern, „Druckdaten" nie. Beim
Hochladen zeigt die Oberfläche vorher an, was passieren wird, und bei „Als Foto
behandeln" beide Größen im Vergleich.

*Verlustfreie Optimierung (JPEG-Huffman, PNG-Neupackung) bringt nur 5–10 % und
braucht zusätzliche Bibliotheken — das Verhältnis von Aufwand zu Wirkung lohnt
gegenüber den Maßnahmen unten nicht.*

### Was das für den Speicherbedarf bedeutet

| Grenze | Free | Pro (25 $/Monat) | Cloudflare R2 (kostenlos) |
|---|---|---|---|
| Dateispeicher | 1 GB | 100 GB | 10 GB |
| Datenverkehr/Monat | 5 GB | 250 GB | **unbegrenzt, kostenlos** |
| Max. Dateigröße | **50 MB** | sehr hoch | 5 GB (mehrteilig) |
| Datenbank | 500 MB | 8 GB | — |
| Pause bei Inaktivität | nach 1 Woche | nie | — |

*Supabase-Werte: supabase.com/pricing, geprüft am 24.08.2026.*

Die Antwort auf „reicht der kostenlose Tarif?" hängt jetzt an einer einzigen
Frage — **liegen Druckdateien mit in der Ablage?**

**Fall A — keine Druckdateien.** Scans, Verträge, Anträge, Handyfotos:
Ø etwa 3 MB, davon ein guter Teil als Foto behandelbar.

| Stand | Fassungen | Bedarf |
|---|---:|---:|
| Nach dem Umzug aus WhatsApp | 100 | ≈ 200 MB |
| Nach einem Jahr | 220 | ≈ 430 MB |
| Nach drei Jahren | 450 | ≈ 880 MB |

→ Der kostenlose Tarif reicht **etwa drei Jahre**.

**Fall B — mit Druckdateien.** Ein druckfertiges PDF eines Bauplans in A1 mit
300 dpi liegt schnell bei 20–60 MB, unkomprimierbar.

| Stand | Alltagsdateien | Druckdateien | Bedarf |
|---|---:|---:|---:|
| Nach dem Umzug aus WhatsApp | 100 (≈ 200 MB) | 10 × 25 MB | ≈ 450 MB |
| Nach einem Jahr | 220 (≈ 430 MB) | 25 × 25 MB | **≈ 1,06 GB — voll** |
| Nach drei Jahren | 450 (≈ 880 MB) | 70 × 25 MB | ≈ 2,6 GB |

→ Der kostenlose Tarif reicht **etwa ein Jahr**.

> **Und die 50-MB-Grenze blockiert einzelne Dateien ganz.** Im kostenlosen Tarif
> lässt sich eine 60-MB-Druckdatei gar nicht erst hochladen — nicht langsam,
> sondern überhaupt nicht. Falls solche Dateien vorkommen, ist der Tarifwechsel
> keine Frage des Speicherplatzes mehr, sondern eine Voraussetzung.

Der Datenverkehr ist in Fall B ebenfalls kritischer: eine einzelne
Druckdatei-Vorschau kostet so viel wie zwanzig normale Dokumente. Dagegen hilft
die Ladebremse aus Abschnitt 6 — sie ist deshalb kein Feinschliff, sondern
gehört in Phase 1.

### Kostenlose Maßnahmen, die die Qualität nicht anrühren

**1 · Vorschaubild statt Originalabruf.**
Listen und Detailansicht laden nur das kleine Vorschaubild. Das Original wird
erst geholt, wenn jemand es wirklich ansehen oder herunterladen will. Wirkt vor
allem gegen den Datenverkehr — die Grenze, die zuerst weh tut.

**2 · Ladebremse ab 5 MB.**
Siehe Abschnitt 6. Kostet nichts, verhindert die teuersten Versehen.

**3 · Deduplizierung über Prüfsumme.**
Vor dem Hochladen im Browser den SHA-256 der Datei bilden
(`crypto.subtle.digest`, eingebaut, keine Bibliothek). Existiert die Prüfsumme
schon, verweist die neue Versionszeile auf dasselbe Storage-Objekt, statt ein
zweites anzulegen. Bei großen, unkomprimierbaren Druckdateien ist das die
wertvollste Maßnahme überhaupt — dieselbe 40-MB-Datei zweimal hochzuladen
passiert erfahrungsgemäß leicht. Reaktivieren nutzt denselben Mechanismus und
kostet dadurch gar nichts.

**4 · Papierkorb, der wirklich leert.**
Gelöschtes 30 Tage aufheben, dann endgültig entfernen — Storage-Objekt zuerst,
dann Zeile, und nur wenn keine andere Version mehr darauf zeigt. Zunächst als
Knopf „Vaciar papelera"; automatisieren ließe sich das später mit `pg_cron`
(in Supabase kostenlos enthalten) plus einer Edge Function für den
Storage-Teil.

**5 · Cloudflare R2 als Ablageort für die Originale.**
R2 bietet dauerhaft kostenlos 10 GB Speicher, **keinerlei Gebühren für
ausgehenden Datenverkehr** und erlaubt Dateien bis 5 GB — es räumt damit alle
drei Engpässe zugleich ab. Der Weg dorthin ist vorbereitet: die Spalte
`storage_provider` steht von Anfang an in `doc_versions`. Neue Uploads gehen
nach R2, alte bleiben liegen, wo sie sind; nichts muss migriert werden. Was
dazukommt: R2 braucht vorsignierte Upload-Adressen, und die darf nur ein Server
erzeugen — dafür genügt dieselbe Supabase Edge Function, die auch die
Personenverwaltung bedient. Etwa ein halber Tag Arbeit.

### Empfehlung

**Wenn Druckdateien dazugehören** (Fall B), R2 gleich in Phase 1 mitplanen —
nicht wegen des Speicherplatzes, sondern wegen der 50-MB-Grenze, die sonst
einzelne Dateien komplett ausschließt. Die Alternative ist Pro für 25 $ im
Monat, das zugleich das Pausieren-Problem beendet und tägliche Sicherungen
bringt; für eine Ablage, an der Bauunterlagen hängen, ist das kein
unangemessener Betrag.

**Wenn keine Druckdateien dazugehören** (Fall A), mit dem kostenlosen Tarif
starten, Maßnahmen 1–4 in Phase 1 mitbauen, R2 als geplante Reserve liegen
lassen.

> **Betriebsrisiko unabhängig davon.** Kostenlose Projekte werden nach einer
> Woche ohne Zugriff pausiert, und dann bricht auch der Website-Build ab. Diese
> Ablage wird regelmäßig benutzt und schützt insofern eher davor. Die Kopplung
> sollte man trotzdem kennen: längerer Urlaub ohne Login kann die Website kosten.

Für die Suche später: `pg_trgm` und Volltextsuche (`to_tsvector('spanish', …)`)
sind in Postgres kostenlos enthalten. Dafür braucht es keinen externen
Suchdienst.

---

## 8. Einbau in den bestehenden Admin

### Adressen

```
#/documentos                  Ordnerübersicht (Einstieg)
#/documentos/carpeta/<id>     Dokumente in einem Ordner
#/documentos/doc/<id>         Dokument-Detail: Vorschau, Versionen, Kommentare
#/documentos/tareas           Meine Aufgaben, ordnerübergreifend
#/documentos/papelera         Papierkorb
#/documentos/personas         Personenverwaltung (nur owner)
#/documentos/chat             Chat-Panel (Phase 7)
```

> **Kleiner Umbau nötig.** Der Vertrag `AdminView` in `main.ts` kennt heute nur
> `mountList()` und `mountEditor()` — zwei Ebenen. Dieses Modul hat sieben
> Ansichten. Sauberste minimale Änderung: die Schnittstelle um
> `mount(container, route)` erweitern und die bestehenden Ansichten
> unverändert darauf abbilden.

### Dateien

```
supabase/
  migrations/002_roles.sql            [neu]  profiles, Rollen, Policies umstellen
  migrations/003_documentos.sql       [neu]  Tabellen, Views, RPCs, RLS, Bucket

src/scripts/admin/
  documents-view.ts                   [neu]  Montage der Ansichten
  documents-store.ts                  [neu]  Datenzugriff, Muster von store.ts
  documents-upload.ts                 [neu]  Prüfsumme, Original, Vorschaubild
  documents-preview.ts                [neu]  signierte Adressen, Ladebremse
  documents-comments.ts               [neu]  Kommentarliste und Eingabe
  documents-tasks.ts                  [neu]  Aufgaben je Dokument, Ordner, Person
  people-view.ts                      [neu]  Personenverwaltung
  mentions.ts                         [neu]  @-Menü, Platzhalter lesen/schreiben
  router.ts                           [mod]  Route-Typ erweitern
  main.ts                             [mod]  AdminView-Vertrag, Navigationsknopf

src/styles/admin/
  documents.css                       [neu]

src/pages/admin/
  index.astro                         [mod]  Navigation: dritter Knopf "Documentos"
```

### Sprache der Oberfläche

**Spanisch**, wie der übrige Admin: *Documentos, Carpeta, Versión, Propuesta,
Rechazada, Tarea, Papelera, Personas, Subir nueva versión, Mantener original,
Tratar como foto, Descargar, Reactivar.*

---

## 9. Phasen

Jede Phase ist für sich benutzbar. Nach Phase 1 ist das WhatsApp-Problem
bereits gelöst — alles Weitere macht es besser, nicht erst brauchbar.

### Phase 0 — Zugänge und Rollen

- Tabelle `profiles` mit `role` und `is_active`
- **Reihenfolge beachten:** Profile für vorhandene Nutzerinnen anlegen, *dann*
  die Policies auf `workshops` / `casas` auf `may_edit_site()` umstellen
- Trigger, der beim ersten Login automatisch ein Profil (`member`) anlegt
- Personen im Supabase-Dashboard anlegen; Maxi vergibt Namen und Rollen

### Phase 1 — Ablage-Kern *(löst das eigentliche Problem)*

- Migration: `doc_folders`, `documents`, `doc_versions`, Indizes, RLS, **privater** Bucket
- RPCs `doc_publish_version`, `doc_reactivate_version`
- Upload: Original unverändert + Prüfsumme + Vorschaubild; Weiche
  „Original behalten" / „Als Foto behandeln" mit sicherer Voreinstellung
- Ordnerübersicht, Dokumentliste, Dokument-Detail mit Vorschau und Ladebremse
- Versionshistorie: ansehen, herunterladen, reaktivieren
- Papierkorb mit endgültigem Löschen
- *Bei Fall B (Druckdateien): R2-Anbindung schon hier*

### Phase 2 — Vorschläge

- Zustände `proposal` und `rejected`, RPCs zum Annehmen und Ablehnen
- Upload-Weiche: „Direkt festlegen" oder „Als Vorschlag"
- Vorschlagskarte mit Ansehen, Annehmen, Ablehnen samt Pflichtgrund
- Abgelehnte kompakt unter der Zielversion, ansehbar und herunterladbar

### Phase 3 — Kommentare und @-Verweise

- `doc_comments`, `doc_mentions`, View `doc_activity`
- @-Menü für Personen, Dokumente und einzelne Versionen
- Rückverweise: „erwähnt im Kommentar von …" bei der Zielversion
- Ereignis-Verlauf je Version zum Aufklappen

### Phase 4 — Aufgaben

- `doc_tasks`, „Kommentar in Aufgabe umwandeln"
- Aufgaben je Dokument, ausklappbar auf Ordnerebene
- Ordnerübergreifende Ansicht „Meine Aufgaben" mit Fälligkeiten

### Phase 5 — Personenverwaltung und Suche

- Ansicht `#/documentos/personas`: Rollen ändern, deaktivieren
- Einladen per Edge Function (`service_role` bleibt serverseitig)
- Volltextsuche über Titel, Dateinamen und Kommentare (`tsvector`)
- Umbenennen, Verschieben, Ordner sortieren
- „Neu seit deinem letzten Besuch" über `doc_reads`

### Phase 6 — Ordnerrechte *(sobald Externe dazukommen)*

- Tabelle `doc_folder_access`, RLS-Regeln erweitern
- Ordner freigeben, Zugriff je Person lesend oder schreibend

### Phase 7 — Chat-Modul

Ausführlich durchgeplant in [PLAN-CHAT.md](PLAN-CHAT.md), inklusive
eigenständiger, installierbarer Web-App fürs Handy (nicht nur eingebettet
in `/admin`). Kurzfassung:

- Icon in der Admin-Hülle öffnet `#/documentos/chat`; dieselbe Chat-Logik
  läuft zusätzlich als eigenständige PWA unter `/chat`
- Dokumente bleiben die Gesprächspartner (nicht Personen), sortiert nach
  `documents.last_activity_at`; Nachrichten sind `doc_comments`
- `doc_reads` wird erstmals tatsächlich beschrieben (Ungelesen-Zähler)
- Live-Aktualisierung über Supabase Realtime als eigene Teilphase (7b),
  Web-Push-Benachrichtigungen bewusst als optionale, spätere Teilphase (7d)

---

## 10. Später: Dokumente in der Firmen-CI erstellen

Kein Teil dieses Plans, aber der Grund für zwei Entscheidungen darin:

- `doc_versions.source` unterscheidet `upload` von `generated`, und
  `source_payload` nimmt die strukturierten Inhalte auf, aus denen ein
  Dokument erzeugt wurde.
- Ein Generator schreibt damit eine **ganz normale Version**. Versionierung,
  Kommentare, Vorschläge und Aufgaben funktionieren unverändert weiter, ohne
  dass dafür ein zweiter Mechanismus gebaut werden müsste.

Die Gestaltungsgrundlage existiert bereits: `src/styles/tokens.css`
(„Sistema Edén"), die Aquarell-Filter aus `WatercolorDefs.astro` und die
Styleguide-Seite `/design`. Erzeugte Druck-PDFs unterliegen derselben Regel
wie hochgeladene: das Original bleibt unangetastet.

---

## 11. Offene Entscheidungen

1. **Liegen Druckdateien mit in der Ablage?** Das ist die Frage mit den größten
   Folgen — sie entscheidet zwischen Fall A und Fall B in Abschnitt 7 und damit
   darüber, ob der kostenlose Tarif drei Jahre oder ein Jahr trägt und ob R2
   schon in Phase 1 gebraucht wird. Ein paar echte Dateigrößen zur Stichprobe
   würden das klären.
2. **Wer bekommt welche Rolle?** Der Plan setzt Maxi als `owner`, Catalina als
   `editor` (weil ihr der bestehende Zugang gehört und sie die Workshops
   pflegt), alle übrigen als `member`. Zu bestätigen.
3. **Ordnertiefe in der Oberfläche.** Das Modell kann Verschachtelung; die
   Ansicht zeigt zunächst eine Ebene. Reicht das?
4. **Dürfen Vorschläge übergangen werden?** Aktuell kann jede Person auch ohne
   Abstimmung „Direkt festlegen" wählen. Alternative: bei bestimmten Ordnern
   nur Vorschläge zulassen.
5. **Startbildschirm des Moduls** — Ordnerübersicht oder später das Chat-Panel?
   Solange Phase 7 nicht steht, ist es ohnehin die Ordnerübersicht.

---

## 12. Was in diesem Plan Annahme ist

Ehrlichkeitshalber getrennt von den geprüften Angaben oben.

**Belegt** (aus dem Repository gelesen): der gesamte Ist-Zustand in Abschnitt 2,
die Rollen von Catalina und Stefan aus `src/data/nosotros.ts`, die Tatsache
genau eines Zugangs aus `SETUP-BACKEND.md`, die Supabase-Tarifgrenzen aus
supabase.com/pricing.

**Angenommen:**

- **Die Dateigrößen** in beiden Rechnungen (Ø 3 MB Alltagsdateien, Ø 25 MB
  Druckdateien) sind Erfahrungswerte, keine Messung an euren echten Dokumenten.
  Bei Druckdateien ist die Streuung riesig — von 8 MB bis über 100 MB ist alles
  möglich. Siehe Abschnitt 11, Punkt 1.
- **Die Nutzungshäufigkeit** für die Datenverkehrs-Abschätzung ist geschätzt.
- **Die Dokumentarten** (Baupläne, Baugenehmigungen, Verträge) sind aus dem
  Anlass abgeleitet und daraus, dass Stefan die Lehmhäuser baut. Falls
  hauptsächlich andere Dokumente anfallen — Rechnungen, Buchhaltung,
  Behördenpost — ändert das die Ordnerstruktur, aber nichts am Datenmodell.
- **Ob Catalina die Person ist, die sich beschwert hat**, steht so nicht im
  Repository; es folgt aus dem Gespräch und daraus, dass ihr der bestehende
  Zugang gehört.

Nicht angenommen, sondern bewusst offengelassen: die genaue Zuordnung der
übrigen Familienmitglieder. `nosotros.ts` nennt Jasmin als jemanden, der zur
Familie dazugekommen ist, sagt aber nicht, zu wem — deshalb steht im Plan
nirgends eine Zuordnung, die daraus geraten wäre.
