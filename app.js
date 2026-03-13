const $ = (id) => document.getElementById(id);

const state = {
  apiKey: localStorage.getItem("openai_api_key") || "",
  textModel: localStorage.getItem("text_model") || "gpt-4.1-mini",
  imageModel: localStorage.getItem("image_model") || "gpt-image-1",
  research: {},
  competitors: [],
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
  $("apiKey").value = state.apiKey;
  $("textModel").value = state.textModel;
  $("imageModel").value = state.imageModel;
  $("apiStatus").textContent = state.apiKey
    ? "✅ API-Key gesetzt"
    : "⚠️ Kein API-Key gesetzt";
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
  return data.output_text || "";
}

async function generateImage(prompt) {
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
  list.innerHTML = "";
  state.competitors.forEach((c, i) => {
    const li = document.createElement("li");
    li.innerHTML = `${c.title}${c.url ? ` – <a href="${c.url}" target="_blank">Link</a>` : ""} <button data-del="${i}">Entfernen</button>`;
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

function bindEvents() {
  $("saveApiKey").addEventListener("click", () => {
    state.apiKey = $("apiKey").value.trim();
    state.textModel = $("textModel").value.trim() || "gpt-4.1-mini";
    state.imageModel = $("imageModel").value.trim() || "gpt-image-1";
    localStorage.setItem("openai_api_key", state.apiKey);
    localStorage.setItem("text_model", state.textModel);
    localStorage.setItem("image_model", state.imageModel);
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

  $("addCompetitor").addEventListener("click", () => {
    const title = $("competitorTitle").value.trim();
    const url = $("competitorUrl").value.trim();
    if (!title) return;
    state.competitors.push({ title, url });
    $("competitorTitle").value = "";
    $("competitorUrl").value = "";
    renderCompetitors();
    saveProjectToLocal();
  });

  $("analyzeMarket").addEventListener("click", async () => {
    readResearchForm();
    const prompt = `Erstelle eine präzise Marktanalyse für ein Non-Fiction Buchprojekt.

Projekt:\n${JSON.stringify(state.research, null, 2)}

Wettbewerber:\n${JSON.stringify(state.competitors, null, 2)}

Liefere:
1) Wettbewerbs-Muster
2) Lücken/Chancen
3) Differenzierungsstrategie
4) 7 klare USP-Ideen`;
    $("marketAnalysis").value = "Generiere...";
    try {
      const out = await callOpenAI(prompt);
      $("marketAnalysis").value = out;
    } catch (e) {
      $("marketAnalysis").value = e.message;
    }
  });

  $("generateTitles").addEventListener("click", async () => {
    readResearchForm();
    const prompt = `Generiere 10 prägnante Buchtitel für dieses Projekt, jeweils in einer neuen Zeile ohne Nummerierung:\n${JSON.stringify(
      state.research,
      null,
      2,
    )}`;
    const list = $("titleOptions");
    list.innerHTML = "<li>Generiere...</li>";
    try {
      const out = await callOpenAI(prompt);
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
    };
    $("personaResult").value = "Generiere...";
    try {
      const out = await callOpenAI(
        `Erzeuge eine detaillierte Author Persona für ein Sachbuchprojekt:\n${JSON.stringify(input, null, 2)}\n
Struktur: Stimme, Ton, Perspektive, Satzlänge, Story-Muster, Do/Don't-Regeln.`,
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
    const prompt = `Erstelle ein "Proposed Book" inkl. Unique Selling Point, Marktpositionierung, Key Selling Points, Zielgruppe, Tonalität.

Projekt: ${JSON.stringify(
      state.research,
      null,
      2,
    )}
Persona: ${state.persona}
Marktanalyse: ${$("marketAnalysis").value}
Tags: ${$("focusTags").value}`;
    $("proposedBook").value = "Generiere...";
    try {
      const out = await callOpenAI(prompt);
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
      persona: state.persona,
      proposedBook: $("proposedBook").value,
      resources: state.resources.slice(0, 30),
    };

    const system = "Du bist ein Bucharchitekt. Antworte nur als valides JSON.";
    const prompt = `Erstelle ein JSON mit diesem Schema:
{
  "chapters":[
    {
      "title":"...",
      "targetWords":2000,
      "sections":[
        {"title":"...","targetWords":700,"subsections":["...","..."]}
      ]
    }
  ]
}
Anforderungen: variable Kapitel- und Sektionslängen, nicht repetitiv, handlungsorientiert, für Non-Fiction.
Input:\n${JSON.stringify(spec, null, 2)}`;

    $("outline").value = "Generiere JSON...";
    try {
      const out = await callOpenAI(prompt, { system, json: true });
      const parsed = JSON.parse(out);
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

    const prompt = `Schreibe die nächste Buchsektion in deutscher Sprache.

Regeln:
- Non-Fiction, hochwertige Substanz, konkrete Beispiele.
- Keine Wiederholungen mit vorherigem Text.
- Nutze Persona und Stance konsequent.
- Länge ungefähr ${sec.targetWords} Wörter.
- Ende mit kurzer Brücke zur nächsten Sektion.

Projekt: ${JSON.stringify(state.research, null, 2)}
Persona:\n${state.persona}
Subsections: ${sec.subsections.join(", ")}
Aktuelle Sektion: Kapitel "${sec.chapterTitle}" / Sektion "${sec.sectionTitle}".
Vorheriger Text:\n${previous}
Ressourcen:\n${resourceContext}`;

    $("currentSection").value = "Generiere...";
    try {
      const out = await callOpenAI(prompt);
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
        const out = await callOpenAI(`${editPrompts[btn.dataset.edit]}\n\nText:\n${txt}`);
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
      const out = await callOpenAI(`${custom}\n\nText:\n${txt}`);
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
    const prompt = `Erstelle eine verkaufsstarke Buchbeschreibung mit Struktur:
Headline, Relate, Bullet Benefits, Objection Handling, CTA.

Buch:\n${JSON.stringify(state.research, null, 2)}
Proposed Book:\n${state.proposedBook}
Manuskript Auszug:\n${state.manuscriptSections.join("\n\n").slice(0, 8000)}`;

    $("bookDescription").value = "Generiere...";
    try {
      const out = await callOpenAI(prompt);
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
  $("outline").value = state.outline ? JSON.stringify(state.outline, null, 2) : "";
  $("bookDescription").value = state.description || "";
  refreshWritingView();
  renderImages();
  bindEvents();
}

init();
