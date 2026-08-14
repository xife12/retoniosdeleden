# Backend einrichten (einmalig)

Diese Schritte richten das Supabase-Backend für Workshops und Lehmhäuser ein.
Danach pflegt sich der Inhalt nur noch über `/admin` — dieses Dokument wird
nur für die Ersteinrichtung oder falls ein zweites Projekt aufgesetzt wird
gebraucht.

## 1. Supabase-Projekt

Falls noch nicht geschehen: Projekt auf [supabase.com](https://supabase.com) anlegen.

## 2. Datenbank-Schema einspielen

Im Supabase-Dashboard → **SQL Editor**, in dieser Reihenfolge ausführen:

1. Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run**.
   Legt die Tabellen `workshops`, `casas`, `casa_images`, die Sicherheitsregeln
   (Row Level Security) und den Storage-Bucket `casa-photos` an.
2. Inhalt von [`supabase/seed.sql`](supabase/seed.sql) einfügen und **Run**.
   Überträgt die bisherigen 5 Workshops und 3 Lehmhäuser unverändert in die
   Datenbank (Startpunkt, damit die Seite nach der Umstellung genauso aussieht
   wie vorher).

Beide Skripte sind idempotent-unkritisch für eine leere Datenbank, aber nicht
darauf ausgelegt, zweimal ausgeführt zu werden (die Tabellen existieren dann
schon bzw. Inhalte würden doppelt angelegt).

## 3. Login-Nutzerin anlegen

Dashboard → **Authentication → Users → Add user** (Add user → Create new user).
E-Mail-Adresse und ein Passwort für die Mutter vergeben, "Auto Confirm User"
aktivieren (kein Bestätigungs-Mail-Versand nötig).

Dieser Login ist der einzige Zugang zu `/admin`.

## 4. Projekt-Keys besorgen

Dashboard → **Settings → API**:
- **Project URL**
- **anon / public** Key (der `service_role`-Key wird nirgends gebraucht —
  niemals in Code oder Vercel-Einstellungen eintragen)

## 5. Lokale Entwicklung

`.env` im Projektordner anlegen (siehe `.env.example`):

```
PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Danach `npm run dev` — `/admin` ist unter `http://localhost:4321/admin/` erreichbar.

## 6. Vercel Deploy Hook

Vercel-Projekt → **Settings → Git → Deploy Hooks**: neuen Hook anlegen
(Name z. B. "Supabase Content Update", Branch = der Branch, der live deployt,
üblicherweise `main`). Die erzeugte URL kopieren.

## 7. Supabase-Webhook → Vercel

Supabase-Dashboard → **Database → Webhooks** → **Create a new hook**, für
jede der drei Tabellen `workshops`, `casas`, `casa_images`:
- Events: `INSERT`, `UPDATE`, `DELETE`
- Type: **HTTP Request**
- URL: die Vercel-Deploy-Hook-URL aus Schritt 6
- Method: `POST`

Damit löst jede Änderung im Backend automatisch einen neuen Vercel-Build aus
(live nach ca. 30–90 Sekunden).

## 8. Vercel-Umgebungsvariablen

Vercel-Projekt → **Settings → Environment Variables**, für **Production**
(und optional Preview):

| Name | Wert |
|---|---|
| `PUBLIC_SUPABASE_URL` | Project URL aus Schritt 4 |
| `PUBLIC_SUPABASE_ANON_KEY` | anon/public Key aus Schritt 4 |

Danach einmal manuell neu deployen (Vercel-Dashboard → Deployments → Redeploy),
damit der erste Build mit den neuen Variablen läuft.

## Danach: laufender Betrieb

Nichts weiter nötig. Login unter `/admin`, Workshops/Lehmhäuser bearbeiten,
speichern — die Seite aktualisiert sich von selbst.
