const $ = (id) => document.getElementById(id);

const state = {
  provider: localStorage.getItem("ai_provider") || "openai",
  apiKey: localStorage.getItem("openai_api_key") || "",
  textModel: localStorage.getItem("text_model") || "gpt-4.1-mini",
  imageModel: localStorage.getItem("image_model") || "gpt-image-1",
  ollamaBaseUrl: localStorage.getItem("ollama_base_url") || "http://localhost:11434",
  ollamaModel: localStorage.getItem("ollama_model") || "llama3.1:8b",
  ollamaTemperature: localStorage.getItem("ollama_temperature") || "",
 research: {},
researchStrategy: "",
competitors: [],
marketResearch: {
  competitorBreakdowns: [],
  patternAnalysis: "",
  marketGapAnalysis: "",
  uspStrategy: "",
},
resources: [],
  titles: [],
  persona: "",
  proposedBook: "",
  outline: null,
  flatSections: [],
  currentSectionIndex: 0,
  manuscriptSections: [],
  description: "",
  images: [],
};

function refreshApiUI() {
  $("provider").value = state.provider;
  $("apiKey").value = state.apiKey;
  $("textModel").value = state.textModel;
  $("imageModel").value = state.imageModel;
  $("ollamaBaseUrl").value = state.ollamaBaseUrl;
  $("ollamaModel").value = state.ollamaModel;
  $("ollamaTemperature").value = state.ollamaTemperature;

  const isOpenAI = state.provider === "openai";
  $("openaiConfig").style.display = isOpenAI ? "block" : "none";
  $("ollamaConfig").style.display = isOpenAI ? "none" : "block";

  if (isOpenAI) {
    $("apiStatus").textContent = state.apiKey
      ? "✅ OpenAI verbunden (API-Key gesetzt)"
      : "⚠️ OpenAI aktiv, aber kein API-Key gesetzt";
  } else {
    $("apiStatus").textContent = `✅ Ollama aktiv (${state.ollamaBaseUrl}, Modell: ${state.ollamaModel})`;
  }
}

function saveProjectToLocal() {
  localStorage.setItem("bookforge_project", JSON.stringify(state));
}

function loadProjectFromLocal() {
  const raw = localStorage.getItem("bookforge_project");
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    Object.assign(state, parsed);
  } catch (err) {
    console.warn("Project load failed", err);
  }
}

function extractTextFromResponse(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];

  // Primary: official Responses shape (assistant message -> content parts)
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text") {
        if (typeof part?.text === "string") chunks.push(part.text);
        else if (typeof part?.text?.value === "string") chunks.push(part.text.value);
      }
      if (part?.type === "text") {
        if (typeof part?.text === "string") chunks.push(part.text);
        else if (typeof part?.text?.value === "string") chunks.push(part.text.value);
      }
    }
  }

  // Secondary fallback: tolerate variant payloads by recursively looking for useful text.
  // Run only when primary extraction found nothing to avoid duplicated text blocks.
  if (!chunks.length) {
    const seen = new Set();
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (seen.has(node)) return;
      seen.add(node);

      if (typeof node.value === "string" && node.value.trim() && node.type === "output_text") {
        chunks.push(node.value);
      }
      if (typeof node.text === "string" && node.text.trim() && (node.type === "output_text" || node.type === "text")) {
        chunks.push(node.text);
      }

      for (const value of Object.values(node)) {
        if (value && typeof value === "object") walk(value);
      }
    };
    walk(data);
  }

  return chunks.join("\n").trim();
}

async function callOpenAI(prompt, { system = "", json = false } = {}) {
  if (!state.apiKey) throw new Error("Bitte API-Key setzen.");
  const body = {
    model: state.textModel,
    input: [
      system ? { role: "system", content: system } : null,
      { role: "user", content: prompt },
    ].filter(Boolean),
  };
  if (json) body.text = { format: { type: "json_object" } };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`OpenAI Fehler: ${res.status} ${msg}`);
  }
  const data = await res.json();
  const text = extractTextFromResponse(data);
  if (text) return text;

  throw new Error("OpenAI hat geantwortet, aber ohne auslesbaren Textinhalt.");
}

async function callOllama(prompt, { system = "" } = {}) {
  const baseUrl = (state.ollamaBaseUrl || "http://localhost:11434").replace(/\/$/, "");
  if (!state.ollamaModel) throw new Error("Bitte Ollama Modell setzen.");

  const payload = {
    model: state.ollamaModel,
    prompt,
    system,
    stream: false,
  };

  const temp = Number(state.ollamaTemperature);
  if (!Number.isNaN(temp)) {
    payload.options = { temperature: temp };
  }

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Ollama Fehler: ${res.status} ${msg}`);
  }

  const data = await res.json();
  const text = (data?.response || "").trim();
  if (text) return text;

  throw new Error("Ollama hat geantwortet, aber ohne Textinhalt.");
}

async function callTextModel(prompt, options = {}) {
  if (state.provider === "ollama") {
    return callOllama(prompt, options);
  }
  return callOpenAI(prompt, options);
}

async function generateImage(prompt) {
  if (state.provider !== "openai") {
    throw new Error("Bildgenerierung ist aktuell nur mit OpenAI verfügbar. Bitte Provider wechseln.");
  }
  if (!state.apiKey) throw new Error("Bitte API-Key setzen.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify({
      model: state.imageModel,
      prompt,
      size: "1024x1024",
    }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Bild Fehler: ${res.status} ${msg}`);
  }
  const data = await res.json();
  return `data:image/png;base64,${data.data[0].b64_json}`;
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function readResearchForm() {
  state.research = {
    bookTitle: $("bookTitle").value.trim(),
    authorName: $("authorName").value.trim(),
    genre: $("genre").value.trim(),
    topic: $("topic").value.trim(),
    stance: $("stance").value.trim(),
    differentiator: $("differentiator").value.trim(),
    tone: $("tone").value.trim(),
    audience: $("audience").value.trim(),
  };
}

function fillResearchForm() {
  const r = state.research || {};
  $("bookTitle").value = r.bookTitle || "";
  $("authorName").value = r.authorName || "";
  $("genre").value = r.genre || "";
  $("topic").value = r.topic || "";
  $("stance").value = r.stance || "";
  $("differentiator").value = r.differentiator || "";
  $("tone").value = r.tone || "";
  $("audience").value = r.audience || "";
}

function renderCompetitors() {
  const list = $("competitorList");
  const count = $("competitorCount");
  list.innerHTML = "";

  const total = state.competitors.length;
  count.textContent = `Wettbewerbsbücher: ${total} (empfohlen: 3–7)`;

  state.competitors.forEach((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${c.title || "Ohne Titel"}</strong>
      ${c.subtitle ? `<br /><small>Untertitel: ${c.subtitle}</small>` : ""}
      ${c.author ? `<br /><small>Autor: ${c.author}</small>` : ""}
      ${c.category ? `<br /><small>Kategorie: ${c.category}</small>` : ""}
      ${c.corePromiseGuess ? `<br /><small>Versprechen: ${c.corePromiseGuess}</small>` : ""}
      ${c.differentiationGuess ? `<br /><small>Differenzierung: ${c.differentiationGuess}</small>` : ""}
      ${c.url ? `<br /><a href="${c.url}" target="_blank">Link öffnen</a>` : ""}
      <br /><button data-del="${i}">Entfernen</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.competitors.splice(Number(btn.dataset.del), 1);
      renderCompetitors();
      saveProjectToLocal();
    });
  });
}

function renderResources() {
  const list = $("resourceList");
  list.innerHTML = "";
  state.resources.forEach((r, i) => {
    const li = document.createElement("li");
    li.textContent = `${r.type.toUpperCase()}: ${r.label}`;
    const del = document.createElement("button");
    del.textContent = "Entfernen";
    del.addEventListener("click", () => {
      state.resources.splice(i, 1);
      renderResources();
      saveProjectToLocal();
    });
    li.appendChild(document.createTextNode(" "));
    li.appendChild(del);
    list.appendChild(li);
  });
}

function refreshWritingView() {
  const total = state.flatSections.length;
  const idx = state.currentSectionIndex;
  $("writingProgress").textContent = total
    ? `Sektion ${Math.min(idx + 1, total)} von ${total}`
    : "Noch keine Outline erzeugt.";
  $("manuscript").value = state.manuscriptSections.join("\n\n");
}

function parseOutlineToFlatSections(outlineObj) {
  const flat = [];
  (outlineObj.chapters || []).forEach((ch, cIdx) => {
    (ch.sections || []).forEach((sec, sIdx) => {
      flat.push({
        chapterTitle: ch.title,
        sectionTitle: sec.title,
        targetWords: sec.targetWords || 700,
        subsections: sec.subsections || [],
        cIdx,
        sIdx,
      });
    });
  });
  return flat;
}

function extractFirstJsonObject(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";

  // Fast path: already valid JSON
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}

  // Fallback: scan for first balanced {...} block while respecting strings/escapes.
  const start = trimmed.indexOf("{");
  if (start < 0) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;

    if (depth === 0) {
      const candidate = trimmed.slice(start, i + 1).trim();
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        return "";
      }
    }
  }

  return "";
}
function getGenrePromptInstructions(genre = "") {
  const g = (genre || "").trim().toLowerCase();

  if (g === "kinderbuch") {
    return `Genre-Regeln:
- Fokus auf einfache, klare, kindgerechte Sprache.
- Emotion, Moral und Verständlichkeit sind wichtiger als Komplexität.
- Die Inhalte sollen gut vorlesbar oder leicht selbst lesbar sein.
- Zielgruppe sind Kinder; oft lesen Eltern oder Lehrkräfte mit.
- Klare Handlung, klare Botschaft, keine unnötige Abstraktion.`;
  }

  if (g === "roman / fiction") {
    return `Genre-Regeln:
- Fokus auf Handlung, Konflikt, Dramaturgie und Figurenentwicklung.
- Zeigen statt erklären.
- Spannung, emotionale Entwicklung und Szenen sind zentral.
- Keine typische Ratgeber- oder Fachbuchsprache.`;
  }

  if (g === "self-help") {
    return `Genre-Regeln:
- Fokus auf Leserproblem, Lesertransformation und praktische Umsetzbarkeit.
- Konkrete Erkenntnisse, klare Schritte, starke Lesernähe.
- Motivierend, aber nicht oberflächlich oder floskelhaft.
- Keine generische Standard-Ratgeber-Sprache ohne Substanz.`;
  }

  if (g === "business") {
    return `Genre-Regeln:
- Fokus auf strategischen Nutzen, Klarheit und Autorität.
- Strukturierte Argumentation, praxisnahe Beispiele, klare Konzepte.
- Modelle, Frameworks und Entscheidungslogik bevorzugen.
- Keine vage oder esoterische Sprache.`;
  }

  if (g === "fachbuch") {
    return `Genre-Regeln:
- Fokus auf Präzision, Struktur, Genauigkeit und didaktische Klarheit.
- Begriffe sauber definieren.
- Wissen systematisch und nachvollziehbar aufbauen.
- Keine unnötige Ausschmückung oder emotionale Überdramatisierung.`;
  }

  if (g === "religion / spiritualität") {
    return `Genre-Regeln:
- Respektvolle, würdevolle und sensible Sprache.
- Fokus auf Werte, Sinn, spirituelle Entwicklung und moralische Orientierung.
- Keine flapsige, zynische oder unpassend verkaufsorientierte Sprache.
- Inhalt soll glaubens- und werteorientiert konsistent bleiben.`;
  }

  if (g === "ratgeber / lifestyle") {
    return `Genre-Regeln:
- Fokus auf praktischen Nutzen, Alltagstauglichkeit und Motivation.
- Konkrete Tipps, leicht verständliche Sprache, anschauliche Beispiele.
- Leser sollen schnell erkennen, wie sie Inhalte anwenden können.
- Keine unnötig abstrakte oder akademische Sprache.`;
  }

  if (g === "biografie") {
    return `Genre-Regeln:
- Fokus auf persönliche Entwicklung, Erfahrungen und authentische Stimme.
- Ereignisse sollen erzählerisch und nachvollziehbar verbunden sein.
- Ehrlichkeit, Perspektive und emotionale Tiefe sind wichtig.
- Keine generische Ratgeber- oder Fachsprache, wenn sie nicht passt.`;
  }

  return `Genre-Regeln:
- Passe Stil, Struktur, Sprache und Zielsetzung sauber an das angegebene Genre an.
- Vermeide generische Standard-Non-Fiction-Sprache, wenn sie nicht zum Genre passt.`;
}

function bindEvents() {
  $("provider").addEventListener("change", () => {
    state.provider = $("provider").value;
    localStorage.setItem("ai_provider", state.provider);
    refreshApiUI();
    saveProjectToLocal();
  });

  $("saveApiKey").addEventListener("click", () => {
    state.provider = "openai";
    state.apiKey = $("apiKey").value.trim();
    state.textModel = $("textModel").value.trim() || "gpt-4.1-mini";
    state.imageModel = $("imageModel").value.trim() || "gpt-image-1";
    localStorage.setItem("ai_provider", state.provider);
    localStorage.setItem("openai_api_key", state.apiKey);
    localStorage.setItem("text_model", state.textModel);
    localStorage.setItem("image_model", state.imageModel);
    refreshApiUI();
    saveProjectToLocal();
  });

  $("saveOllama").addEventListener("click", () => {
    state.provider = "ollama";
    state.ollamaBaseUrl = $("ollamaBaseUrl").value.trim() || "http://localhost:11434";
    state.ollamaModel = $("ollamaModel").value.trim() || "llama3.1:8b";
    state.ollamaTemperature = $("ollamaTemperature").value.trim();
    localStorage.setItem("ai_provider", state.provider);
    localStorage.setItem("ollama_base_url", state.ollamaBaseUrl);
    localStorage.setItem("ollama_model", state.ollamaModel);
    localStorage.setItem("ollama_temperature", state.ollamaTemperature);
    refreshApiUI();
    saveProjectToLocal();
  });

  $("clearApiKey").addEventListener("click", () => {
    state.apiKey = "";
    localStorage.removeItem("openai_api_key");
    refreshApiUI();
  });

  $("saveResearch").addEventListener("click", () => {
    readResearchForm();
    saveProjectToLocal();
    alert("Research gespeichert");
  });
  
  $("generateResearchStrategy").addEventListener("click", async () => {
  readResearchForm();

  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const prompt = `Du bist ein erfahrener Buch-Strategieeditor.

Analysiere den folgenden Buchprojekt-Input und erstelle ein strategisches Briefing, das als Grundlage für alle weiteren Buchschritte dient.

Projektinput:
${JSON.stringify(state.research, null, 2)}

Genre:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

Erstelle ein strategisches Briefing mit:

1. Kernthema des Buchs
2. Zielgruppe
3. Hauptproblem des Lesers
4. Hauptwunsch des Lesers
5. Zentrales Versprechen des Buchs
6. Einzigartiger Ansatz
7. Marktpositionierung
8. Tonalität und Stimme
9. Glaubwürdigkeitsanker
10. Erwartete Transformation des Lesers
11. Offene Unklarheiten oder strategische Lücken

Regeln:
- Passe deine Analyse konsequent an das Genre an.
- Schreibe konkret, nicht generisch.
- Erfinde keine harten Fakten.
- Wenn etwas unklar ist, markiere es als Annahme oder Lücke.
- Schreibe so, dass der Text direkt in Folgeprompts weiterverwendet werden kann.`;

  $("researchStrategy").value = "Generiere...";

  try {
    const out = await callTextModel(prompt);
    state.researchStrategy = out;
    $("researchStrategy").value = out;
    saveProjectToLocal();
  } catch (e) {
    $("researchStrategy").value = e.message;
  }
});

 $("addCompetitor").addEventListener("click", () => {
  const competitor = {
    title: $("competitorTitle").value.trim(),
    author: $("competitorAuthor").value.trim(),
    subtitle: $("competitorSubtitle").value.trim(),
    url: $("competitorUrl").value.trim(),
    category: $("competitorCategory").value.trim(),
    description: $("competitorDescription").value.trim(),
    targetAudienceGuess: $("competitorTargetAudienceGuess").value.trim(),
    corePromiseGuess: $("competitorCorePromiseGuess").value.trim(),
    differentiationGuess: $("competitorDifferentiationGuess").value.trim(),
    notes: $("competitorNotes").value.trim(),
    reviewCount: $("competitorReviewCount").value.trim(),
    rating: $("competitorRating").value.trim(),
    bestsellerRankOrSignal: $("competitorBestsellerSignal").value.trim(),
    keywords: $("competitorKeywords").value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    tableOfContentsNotes: $("competitorTableOfContentsNotes").value.trim(),
    toneGuess: $("competitorToneGuess").value.trim(),
    structureGuess: $("competitorStructureGuess").value.trim(),
    keySellingPointsGuess: $("competitorKeySellingPointsGuess").value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    readerPainGuess: $("competitorReaderPainGuess").value.trim(),
    readerOutcomeGuess: $("competitorReaderOutcomeGuess").value.trim(),
    source: "manual",
  };

  if (!competitor.title) return;

  state.competitors.push(competitor);

  $("competitorTitle").value = "";
  $("competitorAuthor").value = "";
  $("competitorSubtitle").value = "";
  $("competitorUrl").value = "";
  $("competitorCategory").value = "";
  $("competitorDescription").value = "";
  $("competitorTargetAudienceGuess").value = "";
  $("competitorCorePromiseGuess").value = "";
  $("competitorDifferentiationGuess").value = "";
  $("competitorNotes").value = "";
  $("competitorReviewCount").value = "";
  $("competitorRating").value = "";
  $("competitorBestsellerSignal").value = "";
  $("competitorKeywords").value = "";
  $("competitorTableOfContentsNotes").value = "";
  $("competitorToneGuess").value = "";
  $("competitorStructureGuess").value = "";
  $("competitorKeySellingPointsGuess").value = "";
  $("competitorReaderPainGuess").value = "";
  $("competitorReaderOutcomeGuess").value = "";

  renderCompetitors();
  saveProjectToLocal();
});

$("analyzeMarket").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const prompt = `Du bist ein erfahrener Buchmarkt-Analyst und Positionierungsstratege.

Aufgabe:
Analysiere die folgenden manuell recherchierten Wettbewerbsbücher und entwickle daraus
eine vollständige Marktanalyse für das neue Buchprojekt.

NEUES BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

WETTBEWERBSBÜCHER:
${JSON.stringify(state.competitors, null, 2)}

WICHTIG:
- Nutze ausschließlich die gelieferten Wettbewerbsdaten.
- Analysiere Strategie, Positionierung, Muster und Lücken.
- Kopiere keine Texte.
- Wenn Daten unklar oder dünn sind, markiere Unsicherheiten offen.

Liefere die Analyse in dieser Struktur:

1. Competitive Landscape
- Wie sieht der Markt insgesamt aus?
- Welche Arten von Büchern dominieren?
- Welche Positionierungen sind sichtbar?

2. Competitor Breakdown
- Analysiere jedes Wettbewerbsbuch einzeln:
  - Core concept
  - Target audience
  - Core promise
  - Tone
  - Structure
  - Differentiation
  - Likely reason it sells

3. Pattern Extraction
- Welche Muster wiederholen sich über die Bücher hinweg?
- Welche Versprechen, Töne, Strukturen und Positionierungen dominieren?

4. Overused Angles
- Welche Perspektiven wirken austauschbar oder übernutzt?

5. Market Gap
- Welche Lücken oder Chancen sind im Markt sichtbar?
- Was fehlt für Leser aktuell?

6. Positioning Strategy for the New Book
- Wie sollte das neue Buch positioniert werden?
- Welche Marktchance ist am stärksten?

7. Unique Selling Proposition
- Formuliere eine klare USP für das neue Buch.

8. Competitive Strategy
- Was sollte vom Markt gelernt / übernommen werden?
- Was sollte bewusst vermieden werden?
- Was sollte neu oder anders gemacht werden?

9. Key Selling Points
- Formuliere 5 bis 7 konkrete Key Selling Points für Marketing und Positionierung.

Regeln:
- Passe die Analyse konsequent an das Genre an.
- Arbeite konkret statt generisch.
- Keine erfundenen Bestseller-Fakten.
- Wenn wenige Wettbewerbsdaten vorliegen, mache das transparent.`;

  const target = $("marketAnalysis");
  const button = $("analyzeMarket");
  target.value = "Generiere...";
  button.disabled = true;

  try {
    const out = await callTextModel(prompt);
    target.value = (out || "").trim();

    state.marketResearch = {
      competitorBreakdowns: [],
      patternAnalysis: "",
      marketGapAnalysis: "",
      uspStrategy: target.value,
    };

    if (!target.value) {
      target.value = "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }

    saveProjectToLocal();
  } catch (e) {
    target.value = e.message;
  } finally {
    button.disabled = false;
  }
});

  $("generateTitles").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const prompt = `Generiere 10 prägnante Buchtitel für dieses Projekt, jeweils in einer neuen Zeile ohne Nummerierung.

Projekt:
${JSON.stringify(state.research, null, 2)}

Strategie-Briefing:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

Genre:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

Regeln:
- Die Titel müssen zum Genre passen.
- Sie sollen merkfähig und nicht generisch sein.
- Sie sollen das zentrale Versprechen, den Kernkonflikt oder den inhaltlichen Kern des Buchs andeuten.
- Keine Nummerierung, keine Erklärungen, nur Titelzeilen.`;

  const list = $("titleOptions");
  list.innerHTML = "<li>Generiere...</li>";
  try {
    const out = await callTextModel(prompt);
    state.titles = out
      .split("\n")
      .map((s) => s.replace(/^[-\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 10);
    list.innerHTML = "";
    state.titles.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      li.addEventListener("click", () => {
        $("bookTitle").value = t;
        readResearchForm();
        saveProjectToLocal();
      });
      list.appendChild(li);
    });
    saveProjectToLocal();
  } catch (e) {
    list.innerHTML = `<li>${e.message}</li>`;
  }
});

  $("addResourceUrl").addEventListener("click", () => {
    const url = $("resourceUrl").value.trim();
    if (!url) return;
    state.resources.push({ type: "url", label: url, content: url });
    $("resourceUrl").value = "";
    renderResources();
    saveProjectToLocal();
  });

  $("addResourceText").addEventListener("click", () => {
    const txt = $("resourceText").value.trim();
    if (!txt) return;
    state.resources.push({ type: "text", label: txt.slice(0, 70), content: txt });
    $("resourceText").value = "";
    renderResources();
    saveProjectToLocal();
  });

  $("resourceFile").addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) {
      const content = await file.text();
      state.resources.push({
        type: "file",
        label: file.name,
        content: content.slice(0, 30000),
      });
    }
    renderResources();
    saveProjectToLocal();
  });

  $("generatePersona").addEventListener("click", async () => {
  const input = {
    name: $("personaName").value.trim(),
    refs: $("personaRefs").value.trim(),
    background: $("personaBackground").value.trim(),
    sample: $("writingSample").value.trim(),
    research: state.research,
    researchStrategy: state.researchStrategy,
    genre: state.research.genre || "",
    genreInstructions: getGenrePromptInstructions(state.research.genre),
  };

  $("personaResult").value = "Generiere...";

  try {
    const out = await callTextModel(
      `Erzeuge eine detaillierte Author Persona für dieses Buchprojekt:\n${JSON.stringify(input, null, 2)}\n
Struktur:
- Stimme
- Ton
- Perspektive
- Satzlänge
- Story-Muster
- Do/Don't-Regeln

Regeln:
- Passe die Persona an Genre und strategisches Briefing an.
- Die Persona soll später als konsistente Schreibgrundlage für Outline und Kapitel dienen.
- Vermeide generische Standard-Non-Fiction-Stimme, wenn sie nicht zum Genre passt.`,
    );
    state.persona = out;
    $("personaResult").value = out;
    saveProjectToLocal();
  } catch (e) {
    $("personaResult").value = e.message;
  }
});

 $("generateProposedBook").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const prompt = `Erstelle ein "Proposed Book" für dieses Buchprojekt.

Projekt:
${JSON.stringify(state.research, null, 2)}

Strategie-Briefing:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

Genre:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

Persona:
${state.persona}

Marktanalyse:
${$("marketAnalysis").value}

Tags:
${$("focusTags").value}

Liefere:
1. Unique Selling Point
2. Marktpositionierung
3. Key Selling Points
4. Zielgruppe
5. Tonalität
6. Kernaussage des Buchs
7. Warum dieses Buch in diesem Markt relevant ist

Regeln:
- Passe Struktur, Nutzenversprechen und Ton an das Genre an.
- Arbeite konkret und differenzierend.
- Vermeide generische Standardformulierungen.`;

  $("proposedBook").value = "Generiere...";
  try {
    const out = await callTextModel(prompt);
    state.proposedBook = out;
    $("proposedBook").value = out;
    saveProjectToLocal();
  } catch (e) {
    $("proposedBook").value = e.message;
  }
});

  $("generateOutline").addEventListener("click", async () => {
    readResearchForm();
    const spec = {
  targetWords: Number($("targetWords").value || 25000),
  chapterCount: Number($("chapterCount").value || 10),
  structure: $("structure").value.trim(),
  research: state.research,
  researchStrategy: state.researchStrategy,
  genre: state.research.genre || "",
  genreInstructions: getGenrePromptInstructions(state.research.genre),
  persona: state.persona,
  proposedBook: $("proposedBook").value,
  resources: state.resources.slice(0, 30),
};


const system = "Du bist ein Bucharchitekt. Antworte nur als valides JSON.";
const prompt = `Erstelle ein JSON mit diesem Schema:
{
  "chapters":[
    {
      "title":"Kapitel Titel",
      "targetWords":"<Wörter für dieses Kapitel>",
      "sections":[
        {
          "title":"Sektion Titel",
          "targetWords":"<Wörter für diese Sektion>",
          "subsections":["Unterthema 1","Unterthema 2"]
        }
      ]
    }
  ]
}

Anforderungen:
- Variable Kapitel- und Sektionslängen
- Nicht repetitiv
- Handlungsorientiert, wenn das Genre dazu passt
- Struktur, Dramaturgie und Abschnittstypen müssen zum Genre passen
- Die Outline muss das Strategie-Briefing klar widerspiegeln
- Keine generische Standard-Non-Fiction-Struktur, wenn sie nicht zum Genre passt
- Kapitel und Sektionen sollen logisch aufeinander aufbauen
- Die Summe aller Kapitel soll ungefähr dem Gesamtziel aus Input.targetWords entsprechen
- Die Wortverteilung soll sinnvoll auf Input.chapterCount und die Dramaturgie des Buchs verteilt werden
- targetWords in Kapiteln und Sektionen müssen als Zahlen ausgegeben werden

Input:
${JSON.stringify(spec, null, 2)}`;

    $("outline").value = "Generiere JSON...";
    try {
      const out = await callTextModel(prompt, { system, json: true });
      const jsonText = extractFirstJsonObject(out);
      if (!jsonText) {
        throw new Error("Outline konnte nicht als gültiges JSON gelesen werden. Bitte erneut versuchen.");
      }
      const parsed = JSON.parse(jsonText);
      state.outline = parsed;
      state.flatSections = parseOutlineToFlatSections(parsed);
      state.currentSectionIndex = 0;
      state.manuscriptSections = [];
      $("outline").value = JSON.stringify(parsed, null, 2);
      refreshWritingView();
      saveProjectToLocal();
    } catch (e) {
      $("outline").value = e.message;
    }
  });

  async function writeSection(isRewrite = false) {
    if (!state.flatSections.length) {
      alert("Bitte zuerst Outline generieren.");
      return;
    }
    const idx = state.currentSectionIndex;
    const sec = state.flatSections[idx];
    if (!sec) return;

    const previous = state.manuscriptSections.join("\n\n").slice(-12000);
    const resourceContext = state.resources
      .map((r) => `${r.type}:${r.label}\n${r.content?.slice(0, 1200) || ""}`)
      .join("\n\n")
      .slice(0, 12000);

    const genreInstructions = getGenrePromptInstructions(state.research.genre);

const prompt = `Schreibe die nächste Buchsektion in deutscher Sprache.

Regeln:
- Keine Wiederholungen mit vorherigem Text.
- Nutze Persona, Stance und Strategie-Briefing konsequent.
- Länge ungefähr ${sec.targetWords} Wörter.
- Stil, Struktur und Sprache müssen zum Genre passen.
- Schreibe substanziell, klar und konkret.
- Ende mit einer kurzen natürlichen Brücke zur nächsten Sektion, wenn es passt.

Genre:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

Projekt:
${JSON.stringify(state.research, null, 2)}

Strategie-Briefing:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

Persona:
${state.persona}

Subsections:
${sec.subsections.join(", ")}

Aktuelle Sektion:
Kapitel "${sec.chapterTitle}" / Sektion "${sec.sectionTitle}"

Vorheriger Text:
${previous}

Ressourcen:
${resourceContext}`;


    $("currentSection").value = "Generiere...";
    try {
      const out = await callTextModel(prompt);
      $("currentSection").value = out;
      if (isRewrite) {
        state.manuscriptSections[idx] = `## ${sec.chapterTitle} – ${sec.sectionTitle}\n\n${out}`;
      } else {
        state.manuscriptSections.push(`## ${sec.chapterTitle} – ${sec.sectionTitle}\n\n${out}`);
        state.currentSectionIndex += 1;
      }
      refreshWritingView();
      saveProjectToLocal();
    } catch (e) {
      $("currentSection").value = e.message;
    }
  }

  $("generateNextSection").addEventListener("click", () => writeSection(false));
  $("rewriteCurrent").addEventListener("click", () => {
    if (state.currentSectionIndex === 0 && state.manuscriptSections.length === 0) {
      alert("Noch nichts zum Umschreiben.");
      return;
    }
    if (state.currentSectionIndex > 0) state.currentSectionIndex -= 1;
    writeSection(true);
  });

  const editPrompts = {
    format: "Verbessere Grammatik, Struktur und Lesbarkeit ohne Sinnänderung.",
    elaborate: "Elaboriere den Abschnitt mit mehr Tiefe, Beispielen und Nuancen.",
    cta: "Füge einen starken motivierenden Call-to-Action am Ende hinzu.",
    history: "Füge relevante historische Einordnung und Kontext hinzu.",
    quote: "Ergänze ein passendes, glaubwürdiges Zitat (mit Kennzeichnung als Beispielzitat, falls unklar).",
    source: "Ergänze belastbare Quellenhinweise und mache Unsicherheiten transparent.",
    data: "Stärke den Abschnitt mit konkreten Datenpunkten und vorsichtiger Quellenangabe.",
  };

  document.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const txt = $("editorInput").value.trim();
      if (!txt) return;
      $("editorOutput").value = "Generiere...";
      try {
        const out = await callTextModel(`${editPrompts[btn.dataset.edit]}\n\nText:\n${txt}`);
        $("editorOutput").value = out;
      } catch (e) {
        $("editorOutput").value = e.message;
      }
    });
  });

  $("customEditBtn").addEventListener("click", async () => {
    const txt = $("editorInput").value.trim();
    const custom = $("customEditPrompt").value.trim();
    if (!txt || !custom) return;
    $("editorOutput").value = "Generiere...";
    try {
      const out = await callTextModel(`${custom}\n\nText:\n${txt}`);
      $("editorOutput").value = out;
    } catch (e) {
      $("editorOutput").value = e.message;
    }
  });

  $("generateImage").addEventListener("click", async () => {
    const prompt = $("imagePrompt").value.trim();
    if (!prompt) return;
    try {
      const url = await generateImage(prompt);
      state.images.push({ type: "interior", prompt, url });
      renderImages();
      saveProjectToLocal();
    } catch (e) {
      alert(e.message);
    }
  });

  $("generateCover").addEventListener("click", async () => {
    const title = state.research.bookTitle || "Untitled";
    const subtitle = `A practical guide on ${state.research.topic || "your topic"}`;
    const prompt = `Professional book cover design, readable typography, title: "${title}", subtitle: "${subtitle}", author: "${state.research.authorName || "Author"}", modern non-fiction, clean layout`;
    try {
      const url = await generateImage(prompt);
      state.images.push({ type: "cover", prompt, url });
      renderImages();
      saveProjectToLocal();
    } catch (e) {
      alert(e.message);
    }
  });

 $("generateDescription").addEventListener("click", async () => {
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const prompt = `Erstelle eine starke Buchbeschreibung für dieses Projekt.

Buch:
${JSON.stringify(state.research, null, 2)}

Strategie-Briefing:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

Genre:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

Proposed Book:
${state.proposedBook}

Manuskript Auszug:
${state.manuscriptSections.join("\n\n").slice(0, 8000)}

Regeln:
- Passe Sprache, Ton und Aufbau an das Genre an.
- Für Self-Help, Business, Fachbuch und Ratgeber darf die Beschreibung klar nutzenorientiert und verkaufsstark sein.
- Für Kinderbuch, Roman / Fiction, Religion / Spiritualität und Biografie soll die Beschreibung stilistisch passender und weniger wie aggressive Sales-Copy wirken.
- Keine generischen Phrasen.
- Arbeite mit klarem Nutzen, klarer Positionierung oder klarem emotionalem Reiz — je nach Genre.`;

  $("bookDescription").value = "Generiere...";
  try {
    const out = await callTextModel(prompt);
    state.description = out;
    $("bookDescription").value = out;
    saveProjectToLocal();
  } catch (e) {
    $("bookDescription").value = e.message;
  }
});

  $("downloadMarkdown").addEventListener("click", () => {
    readResearchForm();
    const md = `# ${state.research.bookTitle || "Untitled"}\n\n## Author\n${state.research.authorName || ""}\n\n## Description\n${$(
      "bookDescription",
    ).value}\n\n## Manuscript\n\n${state.manuscriptSections.join("\n\n")}`;
    download("bookforge-manuscript.md", md, "text/markdown;charset=utf-8");
  });

  $("downloadDocHtml").addEventListener("click", () => {
    readResearchForm();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${
      state.research.bookTitle || "Book"
    }</title></head><body><h1>${state.research.bookTitle || "Untitled"}</h1><h2>${
      state.research.authorName || ""
    }</h2><pre>${state.manuscriptSections.join("\n\n").replace(/[<>&]/g, (m) => ({
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
    }[m]))}</pre></body></html>`;
    download("bookforge-manuscript.doc", html, "application/msword");
  });

  $("saveProjectJson").addEventListener("click", () => {
    download("bookforge-project.json", JSON.stringify(state, null, 2), "application/json");
  });

  $("loadProjectJson").addEventListener("click", () => $("projectFile").click());

  $("projectFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    Object.assign(state, data);
    fillResearchForm();
    renderCompetitors();
    renderResources();
    $("personaResult").value = state.persona || "";
    $("proposedBook").value = state.proposedBook || "";
    $("researchStrategy").value = state.researchStrategy || "";
    $("outline").value = state.outline ? JSON.stringify(state.outline, null, 2) : "";
    refreshWritingView();
    renderImages();
    $("bookDescription").value = state.description || "";
    saveProjectToLocal();
  });
}

function renderImages() {
  const root = $("imageResults");
  root.innerHTML = "";
  state.images.forEach((img) => {
    const figure = document.createElement("figure");
    figure.innerHTML = `<img src="${img.url}" alt="${img.type}" /><figcaption>${img.type}: ${img.prompt}</figcaption>`;
    root.appendChild(figure);
  });
}

function init() {
  loadProjectFromLocal();
  refreshApiUI();
  fillResearchForm();
  renderCompetitors();
  renderResources();
  $("personaResult").value = state.persona || "";
  $("proposedBook").value = state.proposedBook || "";
  $("researchStrategy").value = state.researchStrategy || "";
  $("outline").value = state.outline ? JSON.stringify(state.outline, null, 2) : "";
  $("bookDescription").value = state.description || "";
  refreshWritingView();
  renderImages();
  bindEvents();
}

init();
