# Retoños del Edén — Website

Mobile-First-Scrollytelling-Website für die erste Bio-Pistazienplantage Uruguays.
Die Biene **Meli** erzählt beim Scrollen die Geschichte der Chacra ab 2025 —
zweisprachig (ES/EN), im Aquarell-und-Tusche-Look, komplett mit handgebauten SVGs.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # statischer Build nach dist/
npm run preview    # Build lokal testen
```

## Struktur

| Pfad | Inhalt |
|---|---|
| `src/styles/tokens.css` | Design-Tokens („Sistema Edén": Pigmente, Typo, Raum, Motion) |
| `src/components/WatercolorDefs.astro` | Globale SVG-Filter für den Aquarell-Look |
| `src/components/BeeMeli.astro` | Meli, die Erzählerin |
| `src/i18n/` | Übersetzungen Spanisch (Default) und Englisch |
| `src/data/workshops.ts` | Die 5 Demo-Workshops (Preise/Termine sind Platzhalter) |
| `src/scripts/scroll-story.ts` | GSAP-Scroll-Choreografie (respektiert `prefers-reduced-motion`) |
| `/design` | Styleguide-Seite des Design-Systems |

## Deployment auf Vercel

Das Projekt ist ein rein statischer Astro-Build — Vercel erkennt Astro automatisch:

1. Repository zu GitHub/GitLab pushen und in Vercel importieren, **oder**
2. direkt per CLI: `npx vercel` im Projektordner ausführen.

Keine Umgebungsvariablen nötig. `/` leitet auf `/es/` weiter.

## Demo-Hinweise

- Buchungs- und Kontaktformulare sind **reine Demos** (kein Backend, keine Zahlung).
- Workshop-Preise, -Termine und Teilnehmerzahlen sind erfunden.
- Für den Livegang: offene Punkte aus dem Referenzdokument klären
  (Pflanzjahr, Produktnamen, echte Workshop-Konditionen).
