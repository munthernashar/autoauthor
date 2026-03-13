# BookForge AI (GitHub Pages Static App)

Eine **rein statische** Web-App (HTML/CSS/JS), die den Coauthor-ähnlichen Buch-Workflow abbildet – inklusive:

- Research / Positionierung
- Market Analysis
- Titelgenerierung
- Ressourcen-Upload (lokal)
- Author Persona
- Proposed Book + Outline
- Kapitel-für-Kapitel-Generierung
- Inline Editor Tools
- Bild- und Cover-Generierung
- Buchbeschreibung + Export

## Architektur (100% GitHub Pages kompatibel)

- Kein Backend
- Keine Server-Komponenten
- Nur statische Dateien: `index.html`, `style.css`, `app.js`
- OpenAI API wird direkt aus dem Browser aufgerufen
- Projektzustand lokal in `localStorage` + JSON Import/Export

> Wichtig: API-Key wird im Browser gespeichert. Für Produktion sollte ein Backend-Protect/Proxy genutzt werden; für reine GitHub Pages bleibt es clientseitig.

## Lokal starten

```bash
python3 -m http.server 4173
```

Dann im Browser öffnen: `http://localhost:4173`

## GitHub Pages Deployment (Schritt-für-Schritt)

1. Repo zu GitHub pushen.
2. In GitHub: **Settings → Pages**.
3. **Source: Deploy from a branch** wählen.
4. Branch `main` (oder dein Branch) + `/ (root)` auswählen.
5. Speichern.
6. Nach Build ist die App unter der GitHub-Pages-URL erreichbar.

## OpenAI Setup

1. OpenAI API-Key erstellen.
2. In der App im Block „OpenAI Verbindung“ einfügen.
3. Modell(e) anpassen (Text/Bild), speichern.

## Best Practice fürs Buchschreiben

Nutze **„Nächste Sektion generieren“** sequenziell (statt alles auf einmal), damit der Kontextfluss konsistent bleibt und Wiederholungen reduziert werden.
