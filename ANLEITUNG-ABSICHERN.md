# Anleitung: Absicherung scharf schalten

Schritt für Schritt, zum Mitklicken. Die Analyse dahinter steht in
[`PLAN-SICHERHEIT.md`](PLAN-SICHERHEIT.md) — hier steht nur, was zu tun ist.

Insgesamt etwa 45 Minuten. Nichts davon ist eilig genug, um es halb zu machen;
wenn zwischendurch etwas unklar ist, lieber anhalten und fragen.

---

## Reihenfolge — bitte nicht vertauschen

```
A. Migrationen in Supabase   (002 → 003 → 004)
B. Erst DANN deployen
C. GitHub-Secrets
D. Zweiter Faktor
E. aal2 scharf schalten
```

**Warum A vor B:** Das neue Panel fragt beim Laden nach der Spalte
`deleted_at`. Die legt Migration 004 an. Wird zuerst deployt, sucht das Panel
eine Spalte, die es noch nicht gibt, und die Liste bleibt leer mit einer
Fehlermeldung. Andersherum ist alles gutmütig: die Migrationen stören das
alte, noch laufende Panel nicht.

---

## A. Die drei Migrationen (ca. 20 Minuten)

Alle drei laufen im selben Fenster: **Supabase-Dashboard → SQL Editor →
New query**. Datei-Inhalt hineinkopieren, anpassen, **Run**.

Ein Paste = eine Transaktion. Geht irgendwo etwas schief, wird **alles**
zurückgerollt und die Datenbank steht exakt wie vorher. Es kann also nichts
halb passieren.

### A1 — Vorbereitung: die zwei Adressen holen

Zuerst allein diese Abfrage ausführen und das Ergebnis offen lassen:

```sql
select id, email, created_at, last_sign_in_at
  from auth.users order by created_at;
```

Erwartet: **zwei Zeilen** — du und deine Mutter. Steht dort eine dritte,
unbekannte Adresse, bitte anhalten und melden.

### A2 — Die Deploy-Hook-URL holen

Die brauchst du gleich zweimal (in 003 und 004). Du hast sie schon einmal
eingetragen; sie steht noch in der Datenbank:

```sql
select tgname, pg_get_triggerdef(oid) as definition
  from pg_trigger
 where not tgisinternal and tgname like '%deploy_hook%';
```

In der Ausgabe steht am Ende jeder Zeile so etwas wie
`EXECUTE FUNCTION notify_deploy_hook('https://api.vercel.com/v1/integrations/deploy/…')`.
Die URL zwischen den Anführungszeichen kopieren.

*Kommt nichts zurück?* Dann Vercel-Projekt → **Settings → Git → Deploy Hooks**
→ die vorhandene URL kopieren oder eine neue anlegen.

### A3 — `002_admin_allowlist.sql`

Inhalt der Datei einfügen. Zwei Platzhalter ersetzen — am einfachsten mit
Suchen & Ersetzen, dann erwischst du beide Vorkommen (Abschnitt 3 und
Abschnitt 4 brauchen dieselben Adressen):

| Suchen | Ersetzen durch |
|---|---|
| `DEINE-ADRESSE@example.com` | deine Adresse aus A1 |
| `ADRESSE-DER-MUTTER@example.com` | die Adresse deiner Mutter aus A1 |

Vor dem Run prüfen, dass nirgends mehr `example.com` steht. **Run.**

- Läuft es durch, meldet es `Allowlist enthaelt 2 Eintraege. Weiter.`
- Bricht es ab mit *„diese Adresse(n) gibt es in auth.users nicht"*, ist eine
  Adresse vertippt. Nichts wurde geändert — korrigieren und noch einmal.

Ab diesem Moment ist die kritische Lücke zu: wer nicht auf der Liste steht,
bekommt von der Datenbank nichts mehr, egal ob er ein Konto hat.

### A4 — `003_audit_und_deploy_bremse.sql`

Inhalt einfügen. `<DEPLOY-HOOK-URL>` durch die URL aus A2 ersetzen — vier
echte Stellen plus zwei Erwähnungen im Kommentar; Suchen & Ersetzen über
alles ist genau richtig.

Vor dem Run prüfen, dass nirgends mehr `<DEPLOY-HOOK-URL>` steht. **Run.**

### A5 — `004_soft_delete.sql`

Genauso: einfügen, `<DEPLOY-HOOK-URL>` per Suchen & Ersetzen austauschen,
prüfen, dass keiner mehr übrig ist, **Run.**

### A6 — Kontrolle

```sql
select
  (select count(*) from public.admins) as admins,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('workshops','casas','casa_images')
      and coalesce(qual, '') = 'true')  as policys_mit_true,
  (select allowed_mime_types from storage.buckets
    where id = 'casa-photos')           as bucket_mime;
```

Erwartet: `admins = 2`, `policys_mit_true = 0`, `bucket_mime = {image/jpeg}`.

---

## B. Deployen (ca. 5 Minuten)

Die ganze Arbeit liegt auf dem Branch `claude/sicherheit-admin-db`. Damit sie
live geht, muss sie nach `main`:

```bash
git checkout main && git merge claude/sicherheit-admin-db && git push
```

Vercel baut daraufhin automatisch. Danach prüfen:

```bash
npm run seguridad
```

Erwartet: **13 von 13 Prüfungen bestanden**. Die Header-Prüfungen (9–13)
können erst ab jetzt grün sein, vorher gab es die Header schlicht nicht.

Danach einmal `/admin` öffnen, anmelden und schauen, ob Talleres und Casas
normal laden. Falls die Liste leer bleibt: Migration 004 ist nicht gelaufen
(siehe A5).

---

## C. GitHub-Secrets (ca. 5 Minuten)

**GitHub → Repository → Settings → Secrets and variables → Actions →
New repository secret.** Zwei Stück:

| Name | Wert | Wo her |
|---|---|---|
| `PUBLIC_SUPABASE_ANON_KEY` | der anon-Key | Supabase → Settings → API → Project API keys → „anon public" |
| `SUPABASE_DB_URL` | Verbindungszeichenkette | Supabase → Connect → **Session Pooler** |

Zu `SUPABASE_DB_URL`: unbedingt den **Session Pooler** nehmen (Host in der Art
`aws-0-<region>.pooler.supabase.com`), nicht „Direct connection". Die direkte
Verbindung gibt es nur über IPv6, und GitHub-Runner haben kein IPv6 — die
Sicherung würde jede Nacht scheitern.

Danach einmal von Hand testen: **Actions → „Sicherung Datenbank" → Run
workflow**. Läuft er grün durch, liegt unten ein Artefakt mit dem Dump.

---

## D. Zweiter Faktor (ca. 10 Minuten, pro Person)

Das ist der Schritt, der ein gestohlenes Passwort wertlos macht.

1. Auf dem Handy eine Authenticator-App installieren, falls noch keine da ist
   (Google Authenticator, Aegis, oder der Passwortmanager, den ihr ohnehin
   benutzt).
2. `/admin` öffnen, anmelden.
3. Oben rechts auf **Seguridad**. Steht dort ein kleiner Punkt, ist noch kein
   Faktor eingerichtet.
4. **Empezar** → QR-Code mit der App scannen → den sechsstelligen Code
   eintippen → **Activar**.
5. Einmal abmelden und neu anmelden. Jetzt fragt das Panel nach dem Passwort
   **und** nach dem Code. Genau so soll es sein.

**Beide Personen machen das für sich.** Erst wenn es bei beiden funktioniert,
weiter zu E.

> Geht ein Telefon verloren, bevor E gemacht ist, kommt man weiterhin mit dem
> Passwort allein hinein — der Faktor ist dann nur eine zusätzliche Abfrage.
> Nach E ist er Pflicht. Deshalb E wirklich erst machen, wenn beide es
> eingerichtet haben.

---

## E. Zweiten Faktor zur Pflicht machen (ca. 2 Minuten)

**Erst ausführen, wenn D bei BEIDEN funktioniert hat.** Danach kommt ohne
Code niemand mehr an die Daten — auch ihr nicht.

SQL Editor:

```sql
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $fn$
  select exists (
           select 1 from public.admins a where a.user_id = auth.uid()
         )
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and (auth.jwt() ->> 'aal') = 'aal2';
$fn$;
```

Danach `/admin` neu laden und einmal durchklicken.

**Wenn etwas klemmt:** dieselbe Funktion ohne die letzte Zeile
(`and (auth.jwt() ->> 'aal') = 'aal2';` streichen, die Zeile davor mit `;`
abschliessen) erneut ausführen — dann ist der Zwang wieder weg. Der SQL-Editor
läuft als `postgres` und ist von diesen Regeln nie betroffen; ausgesperrt sein
kann man also nie endgültig.

---

## Wenn etwas nicht klappt

| Symptom | Ursache | Abhilfe |
|---|---|---|
| Panel-Liste bleibt leer, Fehlermeldung über eine Spalte | 004 nicht gelaufen | A5 nachholen |
| „No autorizado" beim Speichern oder Veröffentlichen | Person steht nicht in `admins` | A3 mit der richtigen Adresse wiederholen |
| Anmeldung geht, aber nichts lädt | aal2 ist scharf (E), Faktor fehlt aber | Bei E beschriebene Rücknahme, dann D nachholen |
| Website baut nach „Publicar" nicht neu | Deploy-Hook-URL falsch ersetzt | A2 und A4/A5 prüfen |
| Nächtliche Sicherung scheitert | „Direct connection" statt Session Pooler | `SUPABASE_DB_URL` in C korrigieren |

Nach jeder Änderung an der Datenbank oder am Hosting ist `npm run seguridad`
die schnelle Gegenprobe — es misst nach, statt zu glauben.
