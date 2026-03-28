# EVM Dashboard — Funktionsdokumentation

## Übersicht

Das EVM (Earned Value Management) Dashboard ist eine Single-Page-Application zur Projektverfolgung und -steuerung. Es berechnet klassische EVM-Kennzahlen, unterstützt Multi-Projekt-Management, PERT-Schätzungen und Baseline-Management mit Scope-Change-Tracking.

**Tech-Stack:** React 19 · Vite 7 · Tailwind CSS 4 · Recharts 3 · Lucide React · Supabase (Postgres)

---

## 1. Multi-Projekt-Management

### Projekt-Selektor
- Dropdown in der Kopfzeile zum Wechseln zwischen Projekten
- Projekte erstellen, duplizieren und löschen
- Aktuell gewähltes Projekt wird in `localStorage` gespeichert und beim nächsten Besuch wiederhergestellt

### Portfolio-Übersicht
- Aggregierte Kennzahlen über alle Projekte: Gesamt-BAC, Gesamt-Fortschritt, Portfolio-CPI
- Projekt-Karten mit Fortschrittsbalken, BAC, EV und CPI
- Klick auf eine Karte wechselt direkt zum Projekt

### Projekt-Einstellungen
Jedes Projekt speichert:

| Feld | Beschreibung |
|------|-------------|
| `name` | Projektname |
| `startDate` / `endDate` | Projektlaufzeit |
| `currency` | Währung (z.B. CHF) |
| `pvMethod` | PV-Berechnungsmethode (`time-based` oder `milestones`) |
| `reportingDate` | Stichtag für PV-Berechnung (Standard: heute) |
| `defaultRateId` | Standard-Kostensatz |
| `pertRoles` | PERT-Rollenverteilung in Prozent |
| `hoursPerWeek` | Arbeitsstunden pro Woche (für Dauerberechnung) |

---

## 2. Epics (Arbeitspakete)

### Datenmodell pro Epic

| Feld | Beschreibung |
|------|-------------|
| `summary` | Bezeichnung des Epics |
| `status` | `To Do`, `In Progress` oder `Done` |
| `startDate` / `endDate` | Geplanter Zeitraum |
| `currentEstimate` | Aktuelle Schätzung (Stunden) |
| `baselineEstimate` | Gesperrte Baseline-Schätzung (Stunden) |
| `timeSpent` | Tatsächlich aufgewendete Zeit (Stunden) |
| `isBaselineLocked` | Ob die Baseline gesperrt ist |
| `rateId` | Zugewiesener Kostensatz (oder Default) |
| `jiraKey` | Optionaler Jira-Schlüssel |
| `baselineId` | Zugehörige Baseline-ID |

### Epics Tab
- Tabellarische Ansicht aller Epics mit Start/Ende, Status, Rate, Baseline, Spent, EV, Kosten
- Statusfilter (Alle / Done / In Progress / To Do)
- Baseline-Sperre pro Epic einzeln umschaltbar (Lock/Unlock)
- **NEU-Badge**: Epics die nach einer Baseline hinzugefügt wurden, erhalten ein amber-farbiges "NEU"-Badge

### EV-Methode (50/50)
Die Earned-Value-Berechnung verwendet die 50/50-Methode:
- `To Do` → 0% des Schätzwerts
- `In Progress` → 50% des Schätzwerts
- `Done` → 100% des Schätzwerts

---

## 3. EVM-Kennzahlen

### Dashboard-Metriken

| Kennzahl | Formel | Beschreibung |
|----------|--------|-------------|
| **BAC** | Σ Baseline-Schätzungen | Budget at Completion — Gesamtbudget |
| **PV** | Zeitbasiert oder Meilensteine | Planned Value — Geplanter Wert bis Stichtag |
| **EV** | Σ (Baseline × Completion%) | Earned Value — Wert der geleisteten Arbeit |
| **AC** | Σ Time Spent | Actual Cost — Tatsächlicher Aufwand |
| **SPI** | EV ÷ PV | Schedule Performance Index (≥1 = im Plan) |
| **CPI** | EV ÷ AC | Cost Performance Index (≥1 = unter Budget) |
| **SV** | EV − PV | Schedule Variance |
| **CV** | EV − AC | Cost Variance |
| **EAC** | BAC ÷ CPI | Estimate at Completion |
| **ETC** | EAC − AC | Estimate to Complete |
| **VAC** | BAC − EAC | Variance at Completion |
| **TCPI** | (BAC − EV) ÷ (BAC − AC) | To Complete Performance Index |

### Wertanzeige
- Wenn Kostensätze definiert sind: Anzeige in Währung (z.B. CHF) mit Stundenangabe als Subtitle
- Ohne Kostensätze: Anzeige in Stunden

### Performance-Status (Header-Badge)
- **On Track** (grün): SPI ≥ 1 und CPI ≥ 1
- **At Risk** (amber): SPI ≥ 0.9 und CPI ≥ 0.9
- **Behind** (rot): SPI < 0.9 oder CPI < 0.9

---

## 4. Planned Value (PV) Berechnung

### Methode 1: Zeitbasiert (Standard)
PV wird automatisch aus Start- und Enddatum jedes Epics berechnet:
```
progress = (Stichtag − Start) / (Ende − Start)  [0..1]
PV_epic = Baseline × progress
```
Epics ohne Datum werden ignoriert.

### Methode 2: Meilensteine (manuell)
PV wird aus manuell definierten Meilensteinen interpoliert:
- Jeder Meilenstein hat ein Datum und einen kumulativen PV-Wert (in Stunden)
- Zwischen Meilensteinen wird linear interpoliert
- Vor dem ersten Meilenstein: PV = 0
- Nach dem letzten Meilenstein: PV = letzter kumulativer Wert

### Meilensteine Tab
- Tabelle mit Datum, kumulativem PV und Notizen
- Meilensteine hinzufügen, bearbeiten und löschen
- Nur sichtbar wenn PV-Methode = "Meilensteine"

---

## 5. S-Kurve

### Linien

| Linie | Farbe | Beschreibung |
|-------|-------|-------------|
| **PV (Zeitbasiert)** | Blau (Fläche) | Geplanter Wert aus Epic-Zeiträumen |
| **PV (Meilensteine)** | Violett gestrichelt | Manuell gesetzte Meilensteine (wenn definiert) |
| **EV (Earned)** | Grün | Fertigstellungswert (50/50), nur bis heute |
| **AC (Actual)** | Rot/Rosa | Tatsächliche Kosten, nur bis heute |
| **BAC** | Violett gestrichelt | Referenzlinie Budget at Completion |
| **BAC (Baseline)** | Orange gestrichelt | Nur wenn Baseline aktiv und BAC abweicht |

### EV/AC-Berechnung für S-Kurve
Für jeden Zeitpunkt auf der Timeline wird EV und AC rückwirkend geschätzt:

**EV an Datum X:**
- Epic ist `Done` und Enddatum ≤ X → 100% des Estimates
- Epic hat gestartet (Startdatum ≤ X) und ist `In Progress` oder `Done` → 50%
- Sonst → 0%

**AC an Datum X:**
- `timeSpent` wird linear über die Epic-Laufzeit verteilt (Start bis Ende bei Done, Start bis heute bei In Progress)

EV und AC enden am heutigen Datum — keine Zukunftsprojektion.

### Dashboard: Grosse S-Kurve (400px)
Vollständige Darstellung mit allen Linien, BAC-Labels auf ReferenceLines.

### EVM Kennzahlen: Mini-S-Kurve (280px)
Kompakte Darstellung mit allen Linien, ohne Labels auf ReferenceLines.

### Timeline-Generierung
Datenpunkte werden automatisch aus Epic-Daten, Meilensteinen und Projektdaten generiert:
- > 365 Tage: 30-Tage-Intervall
- > 180 Tage: 14-Tage-Intervall
- Sonst: 7-Tage-Intervall

---

## 6. PERT-Schätzung

### PERT-Formel
Für jedes Epic mit O (optimistisch), M (wahrscheinlich), P (pessimistisch):

| Berechnung | Formel |
|------------|--------|
| **TE** (Expected) | (O + 4M + P) ÷ 6 |
| **σ** (Standardabweichung) | (P − O) ÷ 6 |
| **TE₉₅** (95%-Konfidenz) | TE + 2σ |
| **Dauer KW** | TE ÷ Stunden/Woche ÷ FTE |
| **CV** (Variationskoeffizient) | σ ÷ TE |

### Eingaben pro Epic

| Feld | Beschreibung |
|------|-------------|
| O | Optimistische Schätzung (Stunden) |
| M | Wahrscheinlichste Schätzung (Stunden) |
| P | Pessimistische Schätzung (Stunden) |
| FTE | Vollzeitäquivalente (Standard: 1) |
| Uplift | Risikozuschlag in Prozent |

### Risikoklassen
Basierend auf dem Variationskoeffizienten (σ/TE):

| Klasse | Bedingung | Farbe |
|--------|-----------|-------|
| **Tief** | CV < 0.15 | Grün |
| **Mittel** | 0.15 ≤ CV ≤ 0.25 | Amber |
| **Hoch** | CV > 0.25 | Rot |

### PERT Tab — 3 Sektionen

**1. PERT-Schätzung (Tabelle)**
- Zeilen pro Epic mit Eingabefeldern für O/M/P/FTE/Uplift
- Berechnete Spalten: TE, σ, TE₉₅, Dauer KW, Kosten, Budget mit Uplift, Risikoklasse
- Totalzeile mit Summen (σ wird quadratisch aggregiert: √Σσ²)

**2. Rollenverteilung (aufklappbar)**
- Prozentuale Verteilung auf Rollen: Dev, UX, Arch, QA, PM
- Konfigurierbare Stunden/Woche
- Validierung: Summe muss 100% ergeben

**3. Stundenverteilung nach Rolle (Tabelle)**
- Read-only Aufschlüsselung der TE-Stunden pro Epic nach Rolle
- Basierend auf der konfigurierten Rollenverteilung

---

## 7. Kostensätze

### Kostensätze Tab
- Tabelle aller definierten Kostensätze mit Name und Stundensatz
- Kostensätze hinzufügen, bearbeiten und löschen
- Default-Rate setzen (wird für Epics ohne explizite Rate verwendet)
- Default-Rate kann nicht gelöscht werden

### Zuordnung
- Im Epics Tab kann jedem Epic ein Kostensatz zugewiesen werden
- Epics ohne explizite Zuordnung verwenden den Default-Kostensatz
- Alle Kennzahlen werden sowohl in Stunden als auch in Währung berechnet

---

## 8. Baseline-Management & Scope-Change-Tracking

### Konzept
Eine Baseline ist ein Snapshot des Projektumfangs zu einem bestimmten Zeitpunkt. Sie ermöglicht es, den geplanten Scope vom tatsächlichen Scope zu unterscheiden und faire EVM-Metriken zu berechnen, auch wenn nachträglich Epics hinzugefügt werden.

### Baseline setzen
1. Klick auf "Baseline setzen" im Epics Tab → Dialog öffnet sich
2. Optionale Notiz eingeben
3. Bestätigen → Folgende Aktionen:
   - Alle Epics werden gesperrt (`isBaselineLocked: true`)
   - Baseline-Estimate wird aus Current-Estimate übernommen (falls nicht bereits gesetzt)
   - Alle Epics erhalten die `baselineId` der neuen Baseline
   - Snapshot wird gespeichert: Datum, BAC (h + Währung), Epic-Count, Epic-IDs, Notiz
   - Vorherige aktive Baseline wird deaktiviert

### Baseline-Snapshot (JSONB auf Projekt)
```
{
  id: "bl-1711612800000",
  date: "2026-03-28",
  bacH: 132,
  bacVal: 18240,
  epicCount: 10,
  epicIds: ["uuid1", "uuid2", ...],
  notes: "Initiale Baseline",
  isActive: true
}
```

### Scope-Change-Erkennung
Wenn eine aktive Baseline existiert:
- Epics die nicht in `activeBaseline.epicIds` enthalten sind = **Scope-Änderung**
- Diese Epics erhalten ein "NEU"-Badge im Epics Tab
- Im Dashboard erscheint ein **Scope-Alert** (amber-farbig):
  - Anzahl neuer Epics
  - BAC-Vergleich: Original → Aktuell (+Delta)
  - Button zum Re-Baselining

### Auswirkung auf EVM-Metriken
Wenn eine Baseline aktiv ist:
- **PV**: Wird nur aus Baseline-Epics berechnet (neue Epics generieren kein PV, da sie nicht geplant waren)
- **EV und AC**: Werden weiterhin aus allen Epics berechnet
- **SPI**: Bleibt fair — wird nicht durch Scope-Erweiterungen verzerrt
- **BAC MetricCard**: Zeigt "BAC (Aktuell)" mit Original-Wert als Subtitle

### S-Kurve mit Baseline
- **BAC (Aktuell)**: Violette gestrichelte Referenzlinie
- **BAC (Baseline)**: Orange gestrichelte Referenzlinie (nur wenn BAC abweicht)

### Baseline-Historie (Einstellungen)
- Chronologische Liste aller Baselines (neueste zuerst)
- Aktive Baseline hervorgehoben mit "Aktiv"-Badge
- Pro Eintrag: Datum, Epic-Count, BAC (h + Währung), Notiz

### Re-Baselining
Jederzeit möglich über "Baseline setzen" oder "Neu-Baseline setzen" (Scope-Alert). Die alte Baseline wird deaktiviert, bleibt aber in der Historie erhalten.

---

## 9. EVM Kennzahlen Tab

Zentraler Zahlen-Tab mit drei Sektionen:

### MetricCards (8 Kacheln)
| Kachel | Beschreibung |
|--------|-------------|
| BAC | Budget at Completion |
| PV | Planned Value |
| EV | Earned Value |
| AC | Actual Cost |
| SPI | Schedule Performance Index |
| CPI | Cost Performance Index |
| Fortschritt | Prozentual (EV/BAC) |
| TCPI | To Complete Performance Index |

### Mini-S-Kurve
Kompakte S-Kurve (280px) mit PV, EV, AC und BAC-Referenzlinien.

### Detail-Cards

| Card | Kennzahlen | Darstellung |
|------|-----------|-------------|
| **Varianzen** | SV, CV | Wert in schwarz, Trend farbig (↗/↘) |
| **Prognosen** | EAC, ETC, VAC | Wert in schwarz, Trend farbig (↗/↘) |
| **Performance Indizes** | SPI, CPI, TCPI | Gauge-Grafiken (volle Breite) |

---

## 10. Datenhaltung

### Supabase (Primär)
- **Tabelle `projects`**: Projektdaten mit JSONB-Feldern (settings, rates, milestones, baselines, jira_config)
- **Tabelle `epics`**: Arbeitspakete mit Fremdschlüssel auf Projekt
- Row Level Security aktiviert (Single-User: alles erlaubt)
- Auto-Update `updated_at` via Trigger

### Offline-Modus
- Bei fehlender Supabase-Verbindung: Read-only Modus aus localStorage-Cache
- Amber-Banner "Offline-Modus" wird angezeigt
- Alle Schreiboperationen sind deaktiviert

### Optimistic Updates
- UI wird sofort aktualisiert (State)
- Supabase-Update erfolgt im Hintergrund
- Bei Fehler: Konsolen-Logging (kein Rollback)

### Daten-Mapping
- DB verwendet `snake_case` (z.B. `baseline_estimate`)
- App verwendet `camelCase` (z.B. `baselineEstimate`)
- Mapping über `mapEpicFromDb` / `mapEpicToDb` und `mapProjectFromDb`

---

## 11. Sample Data & Seeding

Beim ersten Start (leere DB) werden automatisch 3 Beispielprojekte angelegt:

| Projekt | Epics | Zeitraum |
|---------|-------|----------|
| Web Portal Redesign | 10 | Jan – Apr 2025 |
| Mobile App v2 | 5 | Feb – Jun 2025 |
| API Gateway Migration | 6 | Jan – Mai 2025 |

Jedes Projekt hat vorkonfigurierte Kostensätze, Meilensteine und Epics mit verschiedenen Status.

React StrictMode Double-Rendering wird über einen `cancelled`-Flag im `useEffect` verhindert.

---

## 12. UI-Komponenten

| Komponente | Beschreibung |
|------------|-------------|
| `MetricCard` | Kachel mit Titel, Wert, Subtitle, Icon, Trend-Indikator und Datenquellen-Badge |
| `PerformanceGauge` | SVG-Kreisdiagramm für SPI/CPI/TCPI mit Farbcodierung |
| `StatusBadge` | Farbcodiertes Label für Epic-Status |
| `SourceBadge` | Datenquellen-Indikator (Jira/Sheets/Hybrid) |
| `ProjectSelector` | Dropdown mit Projekt-CRUD |
| `PortfolioOverview` | Aggregierte Portfolio-Ansicht |

---

## 13. Tabs-Übersicht

| Tab | Beschreibung | Bedingung |
|-----|-------------|-----------|
| Dashboard | Grosse S-Kurve (PV/EV/AC), Aktueller Status (Schedule/Cost/Prognose), Epic Status | Immer |
| Epics | Tabelle aller Epics mit Inline-Editing, CRUD, Jira-Sync | Immer |
| PERT | PERT-Schätzung, Rollenverteilung, Stundenverteilung | Immer |
| Meilensteine | Manuelle PV-Meilensteine | Nur bei PV-Methode "Meilensteine" |
| EVM Kennzahlen | 8 MetricCards, Mini-S-Kurve, Detail-Cards (Varianzen/Prognosen/Performance Indizes) | Immer |
| Kostensätze | Stundensätze verwalten | Immer |
| Einstellungen | Projekt-Config, PV-Methode, Baseline-Historie, Jira-Integration | Immer |

---

## 14. Epic CRUD & Inline-Editing

### Epic erstellen
- "Neues Epic" Button (grün) im Epics Tab
- Erstellt Epic mit Defaults, Summary sofort editierbar
- Optimistic Insert mit temporärer ID, nach DB-Response mit echter UUID ersetzt

### Epic löschen
- Trash-Icon pro Zeile (letzte Spalte)
- Baseline-gesperrte Epics können nicht gelöscht werden

### Inline-Editing
| Feld | Strategie |
|------|-----------|
| Summary | Click-to-edit (Klick → Input, Blur/Enter = speichern) |
| Start/Ende | Immer sichtbares Datum-Input |
| Status | Immer sichtbares Dropdown (To Do / In Progress / Done) |
| Schätzung | Immer sichtbares Zahlen-Input |
| Time Spent | Immer sichtbares Zahlen-Input |

---

## 15. PERT → EVM Verbindung

Epics mit PERT-Werten (O, M, P > 0) verwenden automatisch TE₉₅ als Schätzung:
```
TE₉₅ = (O + 4M + P) / 6 + 2 × (P − O) / 6
```
Fallback: `currentEstimate` für Epics ohne PERT-Werte.

Die Funktion `getEffectiveEstimate(epic)` wird überall verwendet wo Schätzwerte benötigt werden (PV, EV, BAC, Baseline).

---

## 16. Jira Integration

### Supabase Edge Function: `jira-proxy`
- Proxy für Jira REST API (löst CORS-Problem)
- Empfängt: domain, email, apiToken, jql, fields
- Ruft `https://{domain}/rest/api/3/search` auf

### Jira-Konfiguration (Einstellungen)
- Verbindung: Domain, E-Mail, API Token, Initiative Key
- Erweiterte Felder: Link Type Name, Start Date Field, End Date Field
- Status Mapping: Jira-Status → App-Status (To Do / In Progress / Done)

### Sync-Logik
- JQL basierend auf Initiative Key und Link Type
- Neue Issues → neue Epics, bestehende → Update
- Field-Mapping: summary, status, dates, timeoriginalestimate, timespent
- Entfernte Issues → "ENTFERNT" Badge
- Quick-Sync Button im Epics Tab (wenn Jira konfiguriert)

---

## 17. Dashboard

### Aufbau
1. **Projekt-Header** mit Stichtag und Portfolio-Info
2. **Scope-Change-Alert** (wenn neue Epics seit Baseline)
3. **Grosse S-Kurve** (400px) mit PV, EV, AC, BAC-Referenzlinien
4. **Aktueller Status** — Schedule/Cost/Prognose mit Ist-vs-Soll-Vergleich
5. **Epic Status** — Done/In Progress/To Do mit Fortschrittsbalken

### Aktueller Status
| Box | Inhalt | Vergleich |
|-----|--------|-----------|
| Schedule | Voraus/Im Verzug (SV in Stunden) | EV vs PV (in Stunden) |
| Cost | Unter/Über Budget (CV in Währung) | EV vs AC (in Währung) |
| Prognose | Unter/Über Budget (VAC) | EAC vs BAC |
