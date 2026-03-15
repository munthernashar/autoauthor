Hier ist eine **sauber formatierte README.md**, die du **direkt komplett kopieren und in dein Repo einfügen kannst**.

---

# AutoAuthor AI

AutoAuthor AI ist eine **statische Web-App für den kompletten Buch-Workflow im Browser**:
von Research und Marktanalyse über Titel, Persona, Proposed Book und Outline bis hin zu kapitelweisem Schreiben, Bildgenerierung und **KDP-fähigem DOCX-Export**.

Die App läuft **ohne Backend** und kann direkt über **GitHub Pages** betrieben werden.

---

# Features

## 1️⃣ KI Verbindung

* OpenAI direkt im Browser per API-Key
* Optional **Ollama lokal** als alternativer Provider
* Separates **Hauptmodell** und **Fast-Modell**
* Eigenes Modell für **Bildgenerierung**

Konfiguration in der App:

| Einstellung | Zweck                  |
| ----------- | ---------------------- |
| Hauptmodell | hochwertige Aufgaben   |
| Fast-Modell | schnelle Analyse-Tasks |
| Bildmodell  | Bilder & Cover         |

---

# 2️⃣ Projekt / Research

Erfassung der Buchbasis:

* Buchtitel
* Autorname / Pen Name
* Genre
* Hauptthema
* Stance / Unique Take
* Differenzierungsmerkmal
* Tonalität
* Zielgruppe

Zusätzlich für den Export:

* ISBN
* Widmung
* Danksagung
* Über den Autor

### Research-Strategie

Die App generiert ein **strategisches Buch-Briefing** mit:

* Kernthema
* Leserproblem
* Leserwunsch
* Marktpositionierung
* Transformation
* Tonalität
* Glaubwürdigkeitsanker

Dieses Briefing wird später von:

* Persona
* Proposed Book
* Outline
* Kapitelgenerierung

verwendet.

---

# 3️⃣ Market Analysis

Manuelle Wettbewerbsanalyse mit strukturierten Feldern.

Empfohlen:

**3–7 Wettbewerbsbücher**

Pro Buch können u.a. erfasst werden:

* Titel
* Autor
* Kategorie
* Beschreibung
* zentrales Versprechen
* Differenzierung
* Zielgruppe
* Tonalität
* Struktur
* Keywords
* Rezensionen
* Bestseller-Signale
* Reader Pain
* Reader Outcome

---

## Analyse-Pipeline

### 1. Competitor Breakdown

Analyse jedes einzelnen Wettbewerbsbuchs.

### 2. Pattern Extraction

Erkennt:

* Markt-Muster
* wiederkehrende Versprechen
* dominante Strukturen
* Zielgruppen-Cluster
* übernutzte Blickwinkel

### 3. Market Gap + USP Strategy

Ermittelt:

* Marktlücke
* Positionierung
* Unique Selling Proposition
* Selling Points

### 4. Complete Market Analysis

Verdichtete Gesamtstrategie.

---

# 4️⃣ Titelgenerator

Generiert **10 marktfähige Titel** basierend auf:

* Research
* Proposed Book
* Market Gap
* Marktanalyse

Titel können per Klick direkt ins Projekt übernommen werden.

---

# 5️⃣ Ressourcen

Zusätzlicher Kontext für die KI:

* URLs
* Textnotizen
* lokale Dateien

Alle Inhalte werden **lokal im Browser gespeichert**.

---

# 6️⃣ Author Persona

Erstellt eine konsistente Autorenstimme.

Input:

* Persona Name
* Referenzautoren
* Hintergrund
* Writing Sample

Output enthält:

* Stimme
* Ton
* Perspektive
* Satzstruktur
* Story-Muster
* Do / Don't Regeln

Diese Persona steuert:

* Outline
* Kapitelstil
* Buchtonalität

---

# 7️⃣ Proposed Book + Outline

## Proposed Book Concept

Strategisches Fundament des Buchs:

* Core Idea
* Target Audience
* Reader Problem
* Reader Transformation
* Central Promise
* USP
* Positioning Statement
* Framework / Approach
* Selling Points

---

## Outline Generator

Parameter:

* Zielwortzahl
* Kapitelanzahl
* Strukturtyp

Die Outline:

* wird als **JSON generiert**
* enthält **Kapitel und Sektionen**
* verteilt Zielwörter automatisch
* berücksichtigt:

  * Persona
  * Marktpositionierung
  * Proposed Book
  * Research Strategy

Die Wortverteilung passt sich automatisch auch für **kleine Bücher** an.

---

# 8️⃣ Buch schreiben – Kapitel für Kapitel

Kapitel werden **sequenziell generiert**.

Features:

* nächste Sektion schreiben
* aktuelle Sektion neu schreiben
* Fortschrittsanzeige
* Kontext der bisherigen Kapitel

Der Schreibprompt berücksichtigt:

* Genre
* Persona
* Proposed Book
* Market Gap
* Outline
* Research Strategy
* Ressourcen

Ziel:

**Buchqualität statt generischem KI-Text.**

---

# 9️⃣ Inline Editor Tools

Verbesserung einzelner Textabschnitte.

Tools:

* Formatieren
* Elaborate
* Call-to-Action
* Historische Einordnung
* Zitat hinzufügen
* Quelle ergänzen
* Daten hinzufügen
* Custom Prompt

---

# 🔟 Bilder & Cover

Generierung von:

* Innenillustrationen
* Diagrammen
* Buchcover

Hinweis:

Bildgenerierung funktioniert **nur mit OpenAI**.

---

# 11️⃣ Beschreibung & Export

## Buchbeschreibung

KI generiert eine marktfähige Beschreibung basierend auf:

* Research
* Proposed Book
* Marktstrategie
* Manuskript

---

## Exportformate

### Markdown

Komplettes Manuskript.

### JSON

Projektdatei zur Wiederherstellung.

### DOCX (KDP)

Der DOCX-Export enthält:

* Titelblatt
* Copyright
* Widmung
* Inhaltsverzeichnis
* Danksagung
* Kapitel
* Buchbeschreibung
* Über den Autor

Seitenformat:

**21,59 × 27,94 cm (KDP Standard)**

Markdown-Formatierungen werden automatisch zu:

* **Fett**
* *Kursiv*

im DOCX konvertiert.

---

# Modell-Setup (Empfohlen)

OpenAI:

```
Hauptmodell: gpt-4.1
Fast-Modell: gpt-4.1-mini
Bildmodell: gpt-image-1
```

---

# Task → Modell Mapping

| Task                | Modell       |
| ------------------- | ------------ |
| Competitor Analysis | Fast Model   |
| Pattern Extraction  | Fast Model   |
| Titelgenerator      | Fast Model   |
| Market Gap          | High Quality |
| Research Strategy   | High Quality |
| Persona             | High Quality |
| Proposed Book       | High Quality |
| Outline             | High Quality |
| Write Section       | High Quality |
| Buchbeschreibung    | High Quality |

---

# Projektstruktur

```
index.html
style.css
app.js
icon.ico
```

---

# Lokal starten

Python:

```bash
python3 -m http.server 4173
```

Browser:

```
http://localhost:4173
```

---

# GitHub Pages Deployment

1. Repository zu GitHub pushen
2. Repository Settings öffnen
3. **Pages** auswählen
4. Source: **Deploy from branch**
5. Branch: `main`
6. Ordner: `/root`

Danach ist die App über die GitHub Pages URL erreichbar.

---

# Hinweise

* Die App ist **100 % statisch**
* Kein Backend erforderlich
* API-Key wird im **localStorage** gespeichert
* Für produktive Nutzung mit echten Nutzern wäre ein **Backend-Proxy sicherer**
