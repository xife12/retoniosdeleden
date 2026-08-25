/**
 * Prüft von außen nach, ob die Sicherheitsannahmen dieses Projekts gerade
 * tatsächlich gelten -- siehe PLAN-SICHERHEIT.md, Abschnitt "Phase 5 --
 * Nachweisen statt annehmen".
 *
 * Der Auslöser für dieses Skript war kein schlechter Entwurf, sondern eine
 * ungeprüfte Annahme: im Schema stand sinngemäß "authenticated darf alles",
 * in der Annahme, "authenticated" bedeute "die Nutzerin". Das stimmte nicht
 * -- jeder Mensch konnte sich über den öffentlichen anon-Key selbst ein
 * Konto anlegen und wurde damit "authenticated" (Befund B1). Ein
 * Dashboard-Schalter kann jederzeit wieder zurückfallen, eine neu angelegte
 * Tabelle kann versehentlich offene Vorgaberechte erben (B11), ein Deploy
 * kann eine Policy vergessen. Dieses Skript misst nach, statt zu glauben.
 *
 * Es tut dabei genau das, was auch eine fremde, nicht angemeldete Person mit
 * dem öffentlichen anon-Key tun könnte -- nicht mehr und nicht weniger: GET
 * und HEAD, keine Anmeldung, kein einziger Schreibzugriff. Es ist also
 * gefahrlos, dieses Skript regelmäßig und automatisiert laufen zu lassen
 * (siehe .github/workflows/sicherheit.yml).
 *
 * ------------------------------------------------------------------
 * Aufruf
 * ------------------------------------------------------------------
 *   PUBLIC_SUPABASE_ANON_KEY=eyJ... node scripts/pruefen-sicherheit.mjs
 *
 * Umgebungsvariablen:
 *   PUBLIC_SUPABASE_URL       Vorgabe: https://wgoukgndhpdfcgtwbpke.supabase.co
 *   PUBLIC_SUPABASE_ANON_KEY  Pflicht, kein Vorgabewert (siehe unten, warum)
 *   SITE_URL                  Vorgabe: https://www.retoniosdeleden.com
 *                             (die Apex-Domain leitet mit 308 auf www um --
 *                             gemessen wird die Seite, nicht die Weiterleitung)
 *
 * Exit-Code 0: alle Prüfungen bestanden.
 * Exit-Code 1: mindestens eine Prüfung durchgefallen, oder die Konfiguration
 *              fehlt, oder eine Anfrage ist unerwartet gescheitert.
 */

const ZEITLIMIT_MS = 15_000;

const SUPABASE_URL = (
  process.env.PUBLIC_SUPABASE_URL || 'https://wgoukgndhpdfcgtwbpke.supabase.co'
).replace(/\/+$/, '');
const SITE_URL = (process.env.SITE_URL || 'https://www.retoniosdeleden.com').replace(/\/+$/, '');
const ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;

// Ohne den anon-Key kann keine einzige Prüfung laufen -- und absichtlich gibt
// es dafür keinen Vorgabewert. Ein Vorgabewert würde bedeuten, dass entweder
// ein echter Schlüssel im Skript steht oder einer erraten werden müsste;
// beides ist falsch. Der Schlüssel ist zwar öffentlich (siehe .env.example),
// aber jedes Supabase-Projekt hat einen eigenen, und dieses Skript soll nicht
// heimlich gegen das falsche Projekt laufen, nur weil eine Umgebungsvariable
// vergessen wurde.
if (!ANON_KEY) {
  console.error(
    '\n  Es fehlt PUBLIC_SUPABASE_ANON_KEY -- ohne ihn kann keine Prüfung laufen.\n\n' +
      '  Lokal:\n' +
      '    PUBLIC_SUPABASE_ANON_KEY=eyJ... node scripts/pruefen-sicherheit.mjs\n\n' +
      '  In GitHub Actions:\n' +
      '    als Repository-Secret PUBLIC_SUPABASE_ANON_KEY hinterlegen\n' +
      '    (siehe .github/workflows/sicherheit.yml).\n\n' +
      '  Den Wert findest du im Supabase-Dashboard unter Settings -> API ->\n' +
      '  Project API keys -> "anon" "public", oder lokal in .env.\n',
  );
  process.exitCode = 1;
  process.exit();
}

/** Ergebnis jeder einzelnen Prüfung, in der Reihenfolge des Aufrufs. */
const ergebnisse = [];

function eintragen(name, erwartung, ist, bestanden, hinweis) {
  ergebnisse.push({ name, erwartung, ist, bestanden, hinweis });
}

/**
 * fetch mit Zeitlimit. Ohne das würde ein antwortloser Server (oder ein
 * Netzwerkproblem in der CI) dieses Skript und damit den ganzen Workflow auf
 * unbestimmte Zeit hängen lassen, statt sauber mit Exit-Code 1 zu enden.
 */
function anfrage(url, optionen = {}) {
  return fetch(url, { ...optionen, signal: AbortSignal.timeout(ZEITLIMIT_MS) });
}

function alsFehlermeldung(fehler) {
  return `Netzwerkfehler: ${fehler.message}`;
}

/* ------------------------------------------------------------------ *
 * Prüfung 1 -- Selbstregistrierung und anonyme Anmeldung
 *
 * Das ist die wichtigste Prüfung im ganzen Skript (Befund B1 in
 * PLAN-SICHERHEIT.md). Steht disable_signup wieder auf false -- weil jemand
 * einen Dashboard-Schalter zurückgestellt hat, oder weil ein neues
 * Supabase-Projekt aus dieser Vorlage entstanden ist --, kann sich jeder
 * Mensch mit Internetzugang über den öffentlichen anon-Key ein Konto
 * anlegen und wird damit "authenticated". Ein Fehlschlag hier bedeutet: die
 * Datenbank steht offen.
 *
 * external.anonymous_users ist der zweite, bequemere Weg zum selben Ziel --
 * ganz ohne E-Mail-Bestätigung -- und muss deshalb ebenfalls aus sein.
 * ------------------------------------------------------------------ */
async function pruefenAuthEinstellungen() {
  const NAME_SIGNUP = 'Selbstregistrierung ist gesperrt (disable_signup)';
  const NAME_ANONYM = 'Anonyme Anmeldung ist aus (external.anonymous_users)';
  try {
    const antwort = await anfrage(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: ANON_KEY },
    });
    if (!antwort.ok) {
      const ist = `HTTP ${antwort.status}`;
      eintragen(NAME_SIGNUP, 'true', ist, false);
      eintragen(NAME_ANONYM, 'false', ist, false);
      return;
    }
    const daten = await antwort.json();
    const disableSignup = daten?.disable_signup;
    const anonymousUsers = daten?.external?.anonymous_users;

    eintragen(
      NAME_SIGNUP,
      'true',
      String(disableSignup),
      disableSignup === true,
      'KRITISCH: Jeder Mensch kann sich derzeit über POST /auth/v1/signup ein ' +
        'Konto anlegen und bekommt damit "authenticated"-Rechte. Abschalten: ' +
        'Supabase-Dashboard -> Authentication -> Sign In / Providers -> Email ' +
        '-> "Allow new users to sign up" ausschalten ' +
        '(PLAN-SICHERHEIT.md, Phase 0, Schritt 1).',
    );
    eintragen(
      NAME_ANONYM,
      'false',
      String(anonymousUsers),
      anonymousUsers === false,
      'Anonyme Supabase-Logins sind ein zweiter Weg zu einem ' +
        '"authenticated"-Token, ganz ohne E-Mail-Bestätigung. Abschalten im ' +
        'selben Dashboard-Bereich wie oben (Anonymous Sign-In).',
    );
  } catch (fehler) {
    const ist = alsFehlermeldung(fehler);
    eintragen(NAME_SIGNUP, 'true', ist, false);
    eintragen(NAME_ANONYM, 'false', ist, false);
  }
}

/* ------------------------------------------------------------------ *
 * Prüfung 2 -- Basistabellen für anon gesperrt
 *
 * anon darf auf workshops, casas und casa_images nicht das Geringste dürfen
 * -- lesen schon nicht, geschweige denn schreiben. Alles, was die Website
 * anzeigt, kommt ausschließlich über die beiden *_public-Views (Prüfung 3).
 * Ein 200 hier hieße: entweder ist eine Policy zu weit gefasst, oder eine
 * neu angelegte Tabelle hat die offenen Supabase-Vorgaberechte geerbt (B11).
 * ------------------------------------------------------------------ */
async function pruefenBasistabelleGesperrt(tabelle) {
  const name = `anon ohne Zugriff auf Basistabelle "${tabelle}"`;
  try {
    const antwort = await anfrage(`${SUPABASE_URL}/rest/v1/${tabelle}?select=id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const bestanden = antwort.status === 401;
    eintragen(
      name,
      'HTTP 401',
      `HTTP ${antwort.status}`,
      bestanden,
      `KRITISCH: anon kommt an "${tabelle}" heran, ohne sich anzumelden.`,
    );
  } catch (fehler) {
    eintragen(name, 'HTTP 401', alsFehlermeldung(fehler), false);
  }
}

/* ------------------------------------------------------------------ *
 * Prüfung 3 -- Öffentliche Views erreichbar
 *
 * Das Gegenstück zu Prüfung 2: genau diese beiden Views brauchen die
 * Website-Builds, um Workshops und Lehmhäuser überhaupt anzuzeigen (siehe
 * src/lib/supabase.ts). Ein Fehlschlag hier ist kein Sicherheits-, sondern
 * ein Betriebsproblem -- ohne diese Views findet der Build keine Inhalte
 * mehr.
 * ------------------------------------------------------------------ */
async function pruefenViewErreichbar(view) {
  const name = `Öffentliche View "${view}" liefert Daten`;
  try {
    const antwort = await anfrage(`${SUPABASE_URL}/rest/v1/${view}?select=slug&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const bestanden = antwort.status === 200;
    eintragen(
      name,
      'HTTP 200',
      `HTTP ${antwort.status}`,
      bestanden,
      'Ohne diese View liest der Website-Build keine Inhalte mehr -- das ist ' +
        'kein Sicherheits-, sondern ein Betriebsausfall.',
    );
  } catch (fehler) {
    eintragen(name, 'HTTP 200', alsFehlermeldung(fehler), false);
  }
}

/* ------------------------------------------------------------------ *
 * Prüfung 4 -- Allowlist-Tabelle "admins" unerreichbar
 *
 * Die Tabelle aus Phase 1 (public.admins) entscheidet, wer is_admin() ist.
 * Sie hat bewusst keine RLS-Policy -- über PostgREST darf sie niemand lesen,
 * auch "authenticated" nicht. Wer diese Tabelle lesen könnte, wüsste, welche
 * Person Admin-Rechte hat. 404 zählt ausdrücklich auch als bestanden: Phase 1
 * ist zum Zeitpunkt eines Testlaufs möglicherweise noch nicht in der
 * Datenbank angekommen, und "Tabelle existiert nicht" ist für anon ebenso
 * unerreichbar wie "Tabelle existiert, aber gesperrt".
 * ------------------------------------------------------------------ */
async function pruefenAdminsTabelleUnerreichbar() {
  const name = 'Allowlist-Tabelle "admins" ist über PostgREST unerreichbar';
  try {
    const antwort = await anfrage(`${SUPABASE_URL}/rest/v1/admins?select=user_id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    const bestanden = antwort.status === 401 || antwort.status === 404;
    eintragen(
      name,
      'HTTP 401 oder 404',
      `HTTP ${antwort.status}`,
      bestanden,
      'KRITISCH: Wer die Allowlist lesen kann, sieht, welche Person ' +
        'Admin-Rechte hat.',
    );
  } catch (fehler) {
    eintragen(name, 'HTTP 401 oder 404', alsFehlermeldung(fehler), false);
  }
}

/* ------------------------------------------------------------------ *
 * Prüfung 5 -- Sicherheits-Header der Startseite
 *
 * Läuft gegen die Live-Site, nicht gegen Supabase -- braucht also SITE_URL
 * statt des anon-Keys. Fehlende Header machen aus einer einzigen XSS-Lücke
 * potenziell einen dauerhaften Zugriff (das Supabase-Refresh-Token liegt in
 * localStorage) und öffnen Angriffe wie Clickjacking. Jeder fehlende Header
 * wird einzeln benannt, damit nicht geraten werden muss, welcher von
 * mehreren fehlt.
 *
 * Bei der Content-Security-Policy zählt auch der Report-Only-Modus als
 * bestanden -- das ist der vorgesehene erste Rollout-Schritt (Phase 2) und
 * kein Fehlschlag für sich genommen.
 * ------------------------------------------------------------------ */
const STARTSEITE_HEADER = [
  ['strict-transport-security', 'Startseite sendet Strict-Transport-Security (HSTS)'],
  ['x-content-type-options', 'Startseite sendet X-Content-Type-Options'],
  ['referrer-policy', 'Startseite sendet Referrer-Policy'],
];

async function pruefenStartseiteHeader() {
  try {
    const antwort = await anfrage(`${SITE_URL}/`, { method: 'HEAD' });
    for (const [header, name] of STARTSEITE_HEADER) {
      const wert = antwort.headers.get(header);
      eintragen(
        name,
        'vorhanden',
        wert || 'fehlt',
        Boolean(wert),
        'Siehe PLAN-SICHERHEIT.md, Befund B5 und Phase 2 (vercel.json).',
      );
    }
    const csp =
      antwort.headers.get('content-security-policy') ||
      antwort.headers.get('content-security-policy-report-only');
    eintragen(
      'Startseite sendet eine Content-Security-Policy',
      'vorhanden (aktiv oder als Content-Security-Policy-Report-Only)',
      csp || 'fehlt',
      Boolean(csp),
      'Siehe PLAN-SICHERHEIT.md, Befund B5 und Phase 2 (vercel.json).',
    );
  } catch (fehler) {
    const ist = alsFehlermeldung(fehler);
    for (const [, name] of STARTSEITE_HEADER) {
      eintragen(name, 'vorhanden', ist, false);
    }
    eintragen(
      'Startseite sendet eine Content-Security-Policy',
      'vorhanden (aktiv oder als Content-Security-Policy-Report-Only)',
      ist,
      false,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Prüfung 6 -- /admin/ nicht indexierbar
 *
 * Kein Sicherheitsschutz für sich genommen (RLS ist die eigentliche Tür,
 * siehe PLAN-SICHERHEIT.md Abschnitt 0), aber ohne diesen Header landet die
 * Login-Maske in Suchmaschinen und lädt Scanner sowie Passwort-Raterei ein
 * (Befund B6).
 * ------------------------------------------------------------------ */
async function pruefenAdminNichtIndexierbar() {
  const name = '"/admin/" trägt X-Robots-Tag mit "noindex"';
  try {
    const antwort = await anfrage(`${SITE_URL}/admin/`, { method: 'HEAD' });
    const wert = antwort.headers.get('x-robots-tag') || '';
    const bestanden = wert.toLowerCase().includes('noindex');
    eintragen(name, 'enthält "noindex"', wert || 'fehlt', bestanden);
  } catch (fehler) {
    eintragen(name, 'enthält "noindex"', alsFehlermeldung(fehler), false);
  }
}

/* ------------------------------------------------------------------ *
 * Ablauf und Ausgabe
 * ------------------------------------------------------------------ */
async function main() {
  console.log(`\n  Sicherheitsprüfung -- ${new Date().toISOString()}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Website:  ${SITE_URL}\n`);

  // Bewusst nacheinander statt Promise.all: die Konsolenausgabe bleibt in
  // der Reihenfolge der Prüfliste aus PLAN-SICHERHEIT.md lesbar, und ein
  // hängender Request blockiert dank Zeitlimit ohnehin nur sich selbst.
  //
  // Kein Abbruch beim ersten Fehlschlag -- jede Prüfung läuft in jedem Fall,
  // auch wenn SITE_URL nicht erreichbar ist oder eine frühere Prüfung schon
  // durchgefallen ist. Nur so zeigt ein einziger Lauf den vollständigen Stand.
  await pruefenAuthEinstellungen();
  await pruefenBasistabelleGesperrt('workshops');
  await pruefenBasistabelleGesperrt('casas');
  await pruefenBasistabelleGesperrt('casa_images');
  await pruefenViewErreichbar('workshops_public');
  await pruefenViewErreichbar('casas_public');
  await pruefenAdminsTabelleUnerreichbar();
  await pruefenStartseiteHeader();
  await pruefenAdminNichtIndexierbar();

  let bestanden = 0;
  ergebnisse.forEach((r, i) => {
    const marke = r.bestanden ? 'bestanden'.padEnd(13) : 'durchgefallen'.padEnd(13);
    const nr = String(i + 1).padStart(2, '0');
    console.log(`  ${nr}. [${marke}] ${r.name} -- erwartet: ${r.erwartung} -- ist: ${r.ist}`);
    if (!r.bestanden && r.hinweis) {
      console.log(`      ${r.hinweis}`);
    }
    if (r.bestanden) bestanden += 1;
  });

  const gesamt = ergebnisse.length;
  const durchgefallen = gesamt - bestanden;
  console.log(`\n  ${bestanden}/${gesamt} Prüfungen bestanden.`);

  if (durchgefallen > 0) {
    console.log(
      `  ${durchgefallen} Prüfung(en) durchgefallen -- Details und Hinweise stehen oben.\n`,
    );
    process.exitCode = 1;
  } else {
    console.log('  Alle nachgemessenen Annahmen aus PLAN-SICHERHEIT.md gelten gerade.\n');
  }
}

main().catch((fehler) => {
  console.error(`\n  Unerwarteter Abbruch: ${fehler.stack || fehler.message}\n`);
  process.exitCode = 1;
});
