# EVM Multi-Project Dashboard

Earned Value Management Dashboard for tracking multiple projects with PERT estimation, role-based costing, and timeline projections.

![Dashboard](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-7-purple) ![Tailwind](https://img.shields.io/badge/Tailwind-4-cyan) ![Supabase](https://img.shields.io/badge/Supabase-Backend-green)

## Features

### EVM-Kennzahlen
- **BAC, EV, AC, PV** — Grundwerte des Earned Value Management
- **SPI / CPI** — Schedule & Cost Performance Index
- **EAC, ETC, VAC, TCPI** — Prognose-Kennzahlen
- **50/50-Methode** — To Do = 0%, In Progress = 50%, Done = 100%

### Zeitprognose
- **SPI-Prognose** — Projiziertes Enddatum: geplante Dauer / SPI
- **FTE-Prognose** — Restaufwand / (Stunden/Woche x aktive FTEs), 5-Tage-Woche
- Farbcodierte Verzugs-Indikatoren (gruen/amber/rot)
- Mini-Zeitschiene mit visuellen Markern

### S-Kurven Projektion
- PV (zeitbasiert + meilensteinbasiert), EV, AC als kumulative Linien
- **EV-Prognose** — gestrichelte Projektion ab heute bis BAC
- Vertikale Referenzlinien fuer "Heute" und "Geplantes Ende"

### PERT-Schaetzung
- Drei-Punkt-Schaetzung (Optimistisch / Wahrscheinlich / Pessimistisch)
- TE, Standardabweichung, TE95 (95%-Konfidenz)
- FTE-basierte Dauer in Kalenderwochen
- Uplift/Risikozuschlag pro Epic
- Risikoklassifizierung (Tief/Mittel/Hoch/Kritisch)

### Child Features
- Optionale Unterteilung von Epics in Features
- Jedes Feature mit eigener Rolle (= Kostensatz) und PERT-Werten
- Epic-Totals werden automatisch aus Features berechnet
- Expandierbare Zeilen im PERT-Tab

### Multi-Projekt & Portfolio
- Mehrere Projekte parallel verwalten
- Portfolio-Uebersicht mit Fortschritts-Badges
- Projekt-spezifische Einstellungen, Rollen und Meilensteine

### MoSCoW-Priorisierung
- **MUST / SHOULD / COULD / WON'T** — Farbcodierte Dropdown-Spalte direkt in der Epics-Tabelle
- **Kapazitaets-Check (60%-Regel)** — Automatische Pruefung ob MUST-Haves ≤ 60% des Gesamtaufwands
- Stundensummen pro Kategorie basierend auf PERT-Schaetzung (`getEffectiveEstimate`)
- Hinweis auf Epics ohne MoSCoW-Zuordnung
- Optional: MoSCoW-Wert aus Jira Custom Field synchronisieren

### Governance & Ampelsystem
- **Dreistufige Ampel** — Gruen (≥ 1.0), Gelb (0.9–1.0), Rot (< 0.9) fuer SPI und CPI
- **Exception Report Alert** — Rotes Banner bei SPI/CPI < 0.9, sofortiger Bericht an GL erforderlich
- **Highlight Report Hinweis** — Dezenter gelber Hinweis bei Gelb-Status

### Kostenprognose
- **BAC / EAC / VAC / ETC** — Kompakter Prognose-Block auf dem Dashboard
- Farbcodierte Anzeige: gruen bei "Unter Budget", rot bei "Ueber Budget"
- CHF-Konsequenz der aktuellen Performance auf einen Blick

### Stage Gate
- **Stage Gate Kriterium** — Messbares Kriterium in den Einstellungen definieren
- **Status-Tracking** — Offen / Erreicht / Nicht erreicht
- **Dashboard-Anzeige** — Kriterium, Status-Badge und Zieldatum auf dem Dashboard

### Weitere Features
- **Jira-Integration** — Epics aus Jira importieren und synchronisieren (inkl. MoSCoW-Feld)
- **Baseline Management** — Snapshots setzen, Scope Changes erkennen
- **Kostensaetze / Rollen** — Rollenbasierte Stundensaetze (Dev, QA, Design...)
- **Meilensteine** — Meilensteinbasierte PV-Berechnung
- **Offline-Faehig** — Lokale Demo-Daten, Supabase optional
- **EVM Glossar** — Integrierte Erklaerung aller Begriffe inkl. Governance, MoSCoW, Stage Gate

## Tech Stack

| Technologie | Version | Zweck |
|---|---|---|
| React | 19 | UI Framework |
| Vite | 7 | Build Tool / Dev Server |
| Tailwind CSS | 4 | Styling |
| Recharts | 3 | S-Kurve & Charts |
| Supabase | 2 | Backend / Datenbank (optional) |
| Lucide | 1 | Icons |

## Quickstart

```bash
# Repository klonen
git clone https://github.com/trockendock/evm-dashboard.git
cd evm-dashboard

# Dependencies installieren
npm install

# Dev Server starten
npm run dev
```

Das Dashboard startet mit Demo-Daten und funktioniert sofort ohne Backend.

### Supabase einrichten (optional)

1. Supabase-Projekt erstellen unter [supabase.com](https://supabase.com)
2. SQL aus `supabase-schema.sql` im SQL-Editor ausfuehren
3. `.env` Datei anlegen:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Dev Server neu starten

### Deployment auf Shared Hosting (LAMP)

Die App ist eine statische SPA — kein Node.js auf dem Server noetig.

1. Lokal bauen:
   ```bash
   npx vite build
   ```
2. Inhalt von `dist/` per FTP/SFTP auf den Webserver hochladen
3. Fertig — Supabase laeuft als Cloud-Dienst, die Verbindung geht direkt vom Browser zur Supabase-API

Optional `.htaccess` fuer saubere URLs (nicht zwingend noetig, da die App Tab-basiert navigiert):

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## Projektstruktur

```
src/
  App.jsx          # Gesamte Applikation (Single-File Architecture)
  main.jsx         # Entry Point
  index.css        # Tailwind Imports
supabase-schema.sql  # Datenbank-Schema (projects, epics, features)
start.command        # macOS Quick-Start Script
```

## EVM auf einen Blick

| Kennzahl | Formel | Bedeutung |
|---|---|---|
| BAC | Summe aller Schaetzungen | Budget at Completion |
| EV | Schaetzung x Fertigstellungsgrad | Earned Value |
| PV | Geplanter Wert zum Stichtag | Planned Value |
| AC | Tatsaechlicher Aufwand | Actual Cost |
| SPI | EV / PV | Termineffizienz |
| CPI | EV / AC | Kosteneffizienz |
| EAC | BAC / CPI | Prognostizierte Gesamtkosten |

## Lizenz

Private.
