const $ = (id) => document.getElementById(id);

const state = {
  provider: localStorage.getItem("ai_provider") || "openai",
  apiKey: localStorage.getItem("openai_api_key") || "",
  textModel: localStorage.getItem("text_model") || "gpt-4.1",
  fastTextModel: localStorage.getItem("fast_text_model") || "gpt-4.1-mini",
  imageModel: localStorage.getItem("image_model") || "gpt-image-1",
  ollamaBaseUrl: localStorage.getItem("ollama_base_url") || "http://localhost:11434",
  ollamaModel: localStorage.getItem("ollama_model") || "llama3.1:8b",
  ollamaTemperature: localStorage.getItem("ollama_temperature") || "",
 research: {},
researchStrategy: "",
competitors: [],
marketResearch: {
  competitorBreakdown: "",
  patternAnalysis: "",
  marketGapStrategy: "",
  finalMarketAnalysis: "",
  competitorBreakdowns: [],
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
  $("fastTextModel").value = state.fastTextModel;
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

async function callOpenAI(prompt, { system = "", json = false, model = "" } = {}) {
  if (!state.apiKey) throw new Error("Bitte API-Key setzen.");
  const body = {
    model: model || state.textModel,
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

function getModelForTask(task = "") {
  const highQualityModel = state.textModel || "gpt-4.1";
  const fastModel = state.fastTextModel || "gpt-4.1-mini";

  const taskModelMap = {
    competitorAnalysis: fastModel,
    patternExtraction: fastModel,
    titles: fastModel,

    marketGap: highQualityModel,
    outline: highQualityModel,
    writeSection: highQualityModel,
    persona: highQualityModel,
    proposedBook: highQualityModel,
    marketAnalysis: highQualityModel,
    description: highQualityModel,
    researchStrategy: highQualityModel,
  };

  return taskModelMap[task] || highQualityModel;
}

async function callTextModel(prompt, options = {}) {
  if (state.provider === "ollama") {
    return callOllama(prompt, options);
  }

  const selectedModel = options.model || getModelForTask(options.task || "");
  return callOpenAI(prompt, { ...options, model: selectedModel });
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

function downloadBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeRegExp(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionBody(sec, rawText) {
  let text = String(rawText || "").trim();
  if (!text) return "";

  const lines = text.split("\n").map((line) => line.trim());
  const filtered = [];

  for (const line of lines) {
    if (!line) {
      filtered.push("");
      continue;
    }

    if (/^KAPITEL\s+\d+$/i.test(line)) continue;
    if (sec.chapterTitle && line === sec.chapterTitle.trim()) continue;
    if (sec.sectionTitle && line === sec.sectionTitle.trim()) continue;
    if (/^⚠️ Ziel ca\./.test(line)) continue;

    filtered.push(line);
  }

  text = filtered.join("\n").trim();

  if (sec.chapterTitle) {
    const chapterPattern = new RegExp(`^${escapeRegExp(sec.chapterTitle.trim())}\\s*`, "i");
    text = text.replace(chapterPattern, "").trim();
  }

  if (sec.sectionTitle) {
    const sectionPattern = new RegExp(`^${escapeRegExp(sec.sectionTitle.trim())}\\s*`, "i");
    text = text.replace(sectionPattern, "").trim();
  }

  return text.trim();
}

function splitParagraphs(text = "") {
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function markdownToRuns(text = "", options = {}) {
  const TextRun = window.docx?.TextRun;
  if (!TextRun) return [];

  const {
    font = "Garamond",
    size = 22,
    bold = false,
    italics = false,
    allCaps = false,
  } = options;

  const runs = [];
  const pattern = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(
        new TextRun({
          text: text.slice(lastIndex, match.index),
          font,
          size,
          bold,
          italics,
          allCaps,
        }),
      );
    }

    const token = match[0];
    let tokenText = token;
    let tokenBold = bold;
    let tokenItalics = italics;

    if (token.startsWith("***") && token.endsWith("***")) {
      tokenText = token.slice(3, -3);
      tokenBold = true;
      tokenItalics = true;
    } else if (token.startsWith("**") && token.endsWith("**")) {
      tokenText = token.slice(2, -2);
      tokenBold = true;
    } else if (token.startsWith("*") && token.endsWith("*")) {
      tokenText = token.slice(1, -1);
      tokenItalics = true;
    }

    runs.push(
      new TextRun({
        text: tokenText,
        font,
        size,
        bold: tokenBold,
        italics: tokenItalics,
        allCaps,
      }),
    );

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    runs.push(
      new TextRun({
        text: text.slice(lastIndex),
        font,
        size,
        bold,
        italics,
        allCaps,
      }),
    );
  }

  if (!runs.length) {
    runs.push(
      new TextRun({
        text,
        font,
        size,
        bold,
        italics,
        allCaps,
      }),
    );
  }

  return runs;
}

function makeDocParagraph(text = "", options = {}) {
  const Paragraph = window.docx?.Paragraph;
  if (!Paragraph) return null;

  const {
    alignment,
    spacingAfter = 0,
    line = 300,
    firstLine = 0,
    font = "Garamond",
    size = 22,
    bold = false,
    italics = false,
    allCaps = false,
  } = options;

  return new Paragraph({
    alignment,
    spacing: {
      after: spacingAfter,
      line,
    },
    indent: firstLine ? { firstLine } : undefined,
    children: markdownToRuns(text, {
      font,
      size,
      bold,
      italics,
      allCaps,
    }),
  });
}

async function buildKdpDocxBlob() {
  if (!window.docx) {
    throw new Error("DOCX Bibliothek nicht geladen. Bitte index.html prüfen.");
  }

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageBreak,
    TableOfContents,
  } = window.docx;

  const bookTitle = state.research.bookTitle || "Untitled";
  const authorName = state.research.authorName || "";
  const description = state.description || "";
  const isbn = $("isbn")?.value?.trim?.() || "";
  const dedication = $("dedication")?.value?.trim?.() || "";
  const acknowledgements = $("acknowledgements")?.value?.trim?.() || "";
  const authorBio = $("authorBio")?.value?.trim?.() || "";

  const children = [];

  // Titelblatt
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 4200, after: 320 },
      children: [
        new TextRun({
          text: bookTitle,
          bold: true,
          font: "Garamond",
          size: 32,
        }),
      ],
    }),
  );

  if (authorName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: authorName,
            font: "Garamond",
            size: 24,
          }),
        ],
      }),
    );
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Copyright
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: "Copyright", bold: true })],
    }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: `Copyright © ${new Date().getFullYear()} ${authorName || "Name des Autors"}`,
        }),
      ],
    }),
  );

  children.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: "Alle Rechte vorbehalten.",
        }),
      ],
    }),
  );

  if (isbn) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: `ISBN: ${isbn}` })],
      }),
    );
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Widmung
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "WIDMUNG",
          bold: true,
          allCaps: true,
          font: "Garamond",
          size: 24,
        }),
      ],
    }),
  );

  children.push(
    makeDocParagraph(dedication || " ", {
      alignment: AlignmentType.JUSTIFIED,
      spacingAfter: 120,
      line: 300,
      firstLine: 420,
      font: "Garamond",
      size: 22,
    }),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Inhaltsverzeichnis
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      children: [new TextRun({ text: "INHALT", bold: true, allCaps: true })],
    }),
  );

  children.push(
    new TableOfContents("Inhaltsverzeichnis", {
      hyperlink: true,
      headingStyleRange: "1-2",
      rightTabStop: 9000,
    }),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Danksagung
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      children: [new TextRun({ text: "DANKSAGUNG", bold: true, allCaps: true })],
    }),
  );

  children.push(
    makeDocParagraph(acknowledgements || " ", {
      alignment: AlignmentType.JUSTIFIED,
      spacingAfter: 120,
      line: 300,
      firstLine: 420,
      font: "Garamond",
      size: 22,
    }),
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Kapitel
  let currentChapterIdx = -1;

  state.flatSections.forEach((sec, index) => {
    const rawSection = state.manuscriptSections[index] || "";
    const body = extractSectionBody(sec, rawSection);

    if (!body) return;

    if (sec.cIdx !== currentChapterIdx) {
      currentChapterIdx = sec.cIdx;

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 140 },
          children: [
            new TextRun({
              text: `KAPITEL ${(sec.cIdx ?? 0) + 1}`,
              bold: true,
              allCaps: true,
              font: "Garamond",
              size: 24,
            }),
          ],
        }),
      );

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 260 },
          children: [
            new TextRun({
              text: sec.chapterTitle || `Kapitel ${(sec.cIdx ?? 0) + 1}`,
              bold: true,
              font: "Garamond",
              size: 28,
            }),
          ],
        }),
      );
    }

    splitParagraphs(body).forEach((para) => {
      children.push(
        makeDocParagraph(para, {
          alignment: AlignmentType.JUSTIFIED,
          spacingAfter: 0,
          line: 300,
          firstLine: 420,
          font: "Garamond",
          size: 22,
        }),
      );
    });

  if (description) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 240 },
        children: [new TextRun({ text: "BUCHBESCHREIBUNG", bold: true, allCaps: true })],
      }),
    );

    splitParagraphs(description).forEach((para) => {
      children.push(
        makeDocParagraph(para, {
          alignment: AlignmentType.JUSTIFIED,
          spacingAfter: 0,
          line: 300,
          firstLine: 420,
          font: "Garamond",
          size: 22,
        }),
      );
    });
  }

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Über den Autor
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      children: [new TextRun({ text: "ÜBER DEN AUTOR", bold: true, allCaps: true })],
    }),
  );

  children.push(
    makeDocParagraph(authorBio || authorName || " ", {
      alignment: AlignmentType.JUSTIFIED,
      spacingAfter: 0,
      line: 300,
      firstLine: 420,
      font: "Garamond",
      size: 22,
    }),
  );

  const doc = new Document({
    creator: authorName || "AutoAuthor",
    title: bookTitle,
    description: "KDP-ready DOCX export",
    styles: {
      default: {
        document: {
          run: {
            font: "Garamond",
            size: 22,
          },
          paragraph: {
            spacing: { after: 0, line: 300 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
            },
            margin: {
              top: 1134,
              right: 992,
              bottom: 1134,
              left: 1417,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
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
  if (!total) {
    $("writingProgress").textContent = "Noch keine Outline erzeugt.";
  } else if (idx >= total) {
    $("writingProgress").textContent = `Fertig – ${total} von ${total} Sektionen erstellt.`;
  } else {
    $("writingProgress").textContent = `Sektion ${idx + 1} von ${total}`;
  }
  $("manuscript").value = state.manuscriptSections.join("\n\n");
}

function formatManuscriptSection(sec, text, sectionIndex) {
  const previousSec = sectionIndex > 0 ? state.flatSections[sectionIndex - 1] : null;
  const isNewChapter = !previousSec || previousSec.cIdx !== sec.cIdx;
  const chapterNumber = (sec.cIdx ?? 0) + 1;

  const blocks = [];

  if (isNewChapter) {
    blocks.push(`KAPITEL ${chapterNumber}`);
    if (sec.chapterTitle) blocks.push(sec.chapterTitle.trim());
  }

  if (text && text.trim()) {
    blocks.push(text.trim());
  }

  return blocks.join("\n\n");
}

function parseOutlineToFlatSections(outlineObj) {
  const flat = [];
  (outlineObj.chapters || []).forEach((ch, cIdx) => {
    const chapterTargetWords = Number(ch.targetWords) || 0;
    const sections = ch.sections || [];
    const fallbackSectionWords =
      sections.length > 0 && chapterTargetWords > 0
        ? Math.max(1, Math.round(chapterTargetWords / sections.length))
        : Math.max(1, chapterTargetWords || 1);

    sections.forEach((sec, sIdx) => {
      flat.push({
        chapterTitle: ch.title,
        chapterTargetWords,
        sectionTitle: sec.title,
        targetWords: Number(sec.targetWords) || fallbackSectionWords,
        subsections: sec.subsections || [],
        cIdx,
        sIdx,
      });
    });
  });
  return flat;
}

function countWords(text = "") {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeOutlineTargetWords(outlineObj, totalTargetWords, chapterCount) {
  const chapters = Array.isArray(outlineObj?.chapters) ? outlineObj.chapters : [];
  if (!chapters.length) return outlineObj;

  const safeTotalTargetWords = Math.max(1, Number(totalTargetWords) || 25000);
  const safeChapterCount = Math.max(1, Number(chapterCount) || chapters.length || 1);

  const baseChapterWords = Math.max(1, Math.round(safeTotalTargetWords / safeChapterCount));

  chapters.forEach((chapter) => {
    const sections = Array.isArray(chapter.sections) ? chapter.sections : [];
    chapter.targetWords = Math.max(1, Number(chapter.targetWords) || baseChapterWords);

    const baseSectionWords = sections.length
      ? Math.max(1, Math.round(chapter.targetWords / sections.length))
      : Math.max(1, Math.round(chapter.targetWords || baseChapterWords));

    sections.forEach((section) => {
      section.targetWords = Math.max(1, Number(section.targetWords) || baseSectionWords);
    });
  });

  return outlineObj;
}

function getOutlineTargetWordsReport(outlineObj, expectedTotalWords) {
  const chapters = Array.isArray(outlineObj?.chapters) ? outlineObj.chapters : [];
  const chapterSum = chapters.reduce((sum, ch) => sum + (Number(ch.targetWords) || 0), 0);

  const sectionSum = chapters.reduce(
    (sum, ch) =>
      sum +
      (Array.isArray(ch.sections)
        ? ch.sections.reduce((s, sec) => s + (Number(sec.targetWords) || 0), 0)
        : 0),
    0,
  );

  const expected = Math.max(1, Number(expectedTotalWords) || 25000);
  const deviation = Math.abs(chapterSum - expected);
  const deviationPct = deviation / expected;

  return {
    expected,
    chapterSum,
    sectionSum,
    deviation,
    deviationPct,
  };
}

function getStructureInstructions(structureType = "") {
  const map = {
    classic_nonfiction: `Kapitelstruktur:
- Thema einführen
- Kerngedanken erklären
- Beispiele oder Anwendungen zeigen
- gedanklich abrunden`,

    problem_solution: `Kapitelstruktur:
- Problem benennen
- Ursachen oder Hintergründe erklären
- Lösung entwickeln
- Umsetzung zeigen`,

    storytelling: `Kapitelstruktur:
- Ausgangssituation
- Konflikt oder Wendepunkt
- Entwicklung
- Erkenntnis oder Auflösung`,

    educational_kids: `Kapitelstruktur:
- leicht verständlich einführen
- anschaulich erzählen oder erklären
- Bedeutung kindgerecht verdeutlichen
- mit einem klaren Lernmoment abschließen`,

    historical: `Kapitelstruktur:
- historischen Kontext setzen
- Ereignisse chronologisch erzählen
- Zusammenhänge und Folgen erklären
- sauber zur nächsten Phase überleiten`,
  };

  return map[structureType] || `Kapitelstruktur:
- Thema einführen
- Inhalte logisch erklären
- Beispiele oder Anwendungen einbauen
- gedanklich abrunden`;
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

function getCompetitorDataWarnings() {
  const warnings = [];

  if (state.competitors.length < 3) {
    warnings.push("Für belastbare Marktanalyse sind mindestens 3 Wettbewerbsbücher empfohlen.");
  }

  const thinCompetitors = state.competitors.filter((c) => {
    const strongFields = [
      c.title,
      c.author,
      c.subtitle,
      c.category,
      c.description,
      c.corePromiseGuess,
      c.differentiationGuess,
      c.notes,
    ].filter((v) => String(v || "").trim()).length;

    return strongFields < 4;
  });

  if (thinCompetitors.length) {
    warnings.push(
      `${thinCompetitors.length} Wettbewerbsbuch/Bücher haben sehr dünne Daten. Mindestens Titel, Beschreibung, Kategorie, Versprechen oder Differenzierung sollten vorhanden sein.`,
    );
  }

  return warnings;
}

function showWarningsInTextarea(el, warnings = []) {
  if (!warnings.length) return false;
  const prefix = `⚠️ Hinweise:\n- ${warnings.join("\n- ")}\n\n`;
  el.value = prefix + (el.value || "");
  return true;
}

function resetDerivedMarketResearch() {
  state.marketResearch = {
    ...state.marketResearch,
    competitorBreakdown: "",
    patternAnalysis: "",
    marketGapStrategy: "",
    finalMarketAnalysis: "",
    marketGapAnalysis: "",
    uspStrategy: "",
  };

  $("competitorBreakdown").value = "";
  $("patternAnalysis").value = "";
  $("marketGapStrategy").value = "";
  $("marketAnalysis").value = "";

  state.proposedBook = "";
  state.titles = [];
  state.outline = null;
  state.flatSections = [];
  state.currentSectionIndex = 0;
  state.manuscriptSections = [];

  $("proposedBook").value = "";
  $("titleOptions").innerHTML = "";
  $("outline").value = "";
  $("currentSection").value = "";
  $("manuscript").value = "";
  refreshWritingView();
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
    state.textModel = $("textModel").value.trim() || "gpt-4.1";
    state.fastTextModel = $("fastTextModel").value.trim() || "gpt-4.1-mini";
    state.imageModel = $("imageModel").value.trim() || "gpt-image-1";
    localStorage.setItem("ai_provider", state.provider);
    localStorage.setItem("openai_api_key", state.apiKey);
    localStorage.setItem("text_model", state.textModel);
    localStorage.setItem("fast_text_model", state.fastTextModel);
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
$("analyzeCompetitors").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const target = $("competitorBreakdown");
  const button = $("analyzeCompetitors");

  if (!state.competitors.length) {
    target.value = "Bitte zuerst mindestens ein Wettbewerbsbuch hinzufügen.";
    return;
  }

  const competitorWarnings = getCompetitorDataWarnings();
  showWarningsInTextarea(target, competitorWarnings);
  target.value += "Generiere...";
  button.disabled = true;

  const prompt = `Du bist ein erfahrener Buchmarkt-Analyst.

Aufgabe:
Analysiere die folgenden Wettbewerbsbücher einzeln für ein neues Buchprojekt.

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
- Analysiere jedes Wettbewerbsbuch einzeln.
- Nutze nur die gelieferten Daten.
- Erfinde keine Fakten.
- Wenn Daten dünn sind, markiere Unsicherheiten klar.

Liefere die Ausgabe in dieser Struktur:

# Competitor Breakdown

## [Buchtitel]
- Core concept:
- Target audience:
- Core promise:
- Tone:
- Structure:
- Differentiation:
- Likely reason it sells:
- Data confidence:

Wiederhole dieses Format für jedes Wettbewerbsbuch.`;

  try {
    const out = await callTextModel(prompt);
    target.value = (out || "").trim();

    state.marketResearch = {
      ...state.marketResearch,
      competitorBreakdown: target.value,
    };

    saveProjectToLocal();

    if (!target.value) {
      target.value = "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }
  } catch (e) {
    target.value = e.message;
  } finally {
    button.disabled = false;
  }
});

$("extractPatterns").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const sourceText = $("competitorBreakdown").value.trim();
  const target = $("patternAnalysis");
  const button = $("extractPatterns");

  if (!sourceText.trim()) {
    target.value = "Bitte zuerst 'Wettbewerber analysieren' ausführen.";
    return;
  }

  const competitorWarnings = getCompetitorDataWarnings();
  showWarningsInTextarea(target, competitorWarnings);
  target.value += "Generiere...";
  button.disabled = true;

  const prompt = `Du bist ein erfahrener Buchmarkt-Analyst.

Aufgabe:
Extrahiere aus den folgenden Einzelanalysen von Wettbewerbsbüchern die wichtigsten Markt-Muster.

NEUES BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

COMPETITOR BREAKDOWN:
${sourceText}

Liefere die Ausgabe in dieser Struktur:

# Pattern Extraction

## Dominant Market Patterns
- Welche Marktansätze dominieren?

## Repeated Promises
- Welche Versprechen wiederholen sich?

## Repeated Audience Targeting
- Welche Zielgruppen werden immer wieder angesprochen?

## Tone Patterns
- Welche Tonalitäten dominieren?

## Structure Patterns
- Welche Buchstrukturen oder Aufbau-Logiken wiederholen sich?

## Differentiation Patterns
- Welche Differenzierungsansätze kommen oft vor?

## Overused Angles
- Welche Blickwinkel oder Positionierungen wirken austauschbar oder übernutzt?

Regeln:
- Arbeite nur mit den gelieferten Daten.
- Fasse präzise zusammen.
- Erfinde keine Marktbelege.
- Markiere Unsicherheiten, wenn die Datengrundlage dünn ist.`;

  try {
    const out = await callTextModel(prompt);
    target.value = (out || "").trim();

    state.marketResearch = {
      ...state.marketResearch,
      patternAnalysis: target.value,
    };

    saveProjectToLocal();

    if (!target.value) {
      target.value = "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }
  } catch (e) {
    target.value = e.message;
  } finally {
    button.disabled = false;
  }
});

$("generateMarketStrategy").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const competitorBreakdown = $("competitorBreakdown").value.trim();
  const patternAnalysis = $("patternAnalysis").value.trim();

  const target = $("marketGapStrategy");
  const button = $("generateMarketStrategy");

  if (!competitorBreakdown.trim()) {
    target.value = "Bitte zuerst 'Wettbewerber analysieren' ausführen.";
    return;
  }

  if (!patternAnalysis.trim()) {
    target.value = "Bitte zuerst 'Muster extrahieren' ausführen.";
    return;
  }

  const competitorWarnings = getCompetitorDataWarnings();
  showWarningsInTextarea(target, competitorWarnings);
  target.value += "Generiere...";
  button.disabled = true;

  const prompt = `Du bist ein erfahrener Buch-Positionierungsstratege.

Aufgabe:
Entwickle aus Projekt, Research-Strategie, Competitor Breakdown und Pattern Extraction
eine starke Marktpositionierung für das neue Buch.

NEUES BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

COMPETITOR BREAKDOWN:
${competitorBreakdown}

PATTERN EXTRACTION:
${patternAnalysis}

Liefere die Ausgabe in dieser Struktur:

# Market Gap + USP Strategy

## Market Gap
- Welche echte Lücke oder Chance ist im Markt sichtbar?

## Reader Opportunity
- Welches Leserproblem ist nicht gut gelöst?
- Welcher Leserwunsch wird noch nicht stark genug bedient?

## Positioning Strategy
- Wie sollte das neue Buch im Markt positioniert werden?

## Unique Selling Proposition
- Formuliere eine klare USP für das neue Buch.

## What to Borrow
- Was sollte vom Markt gelernt oder übernommen werden?

## What to Avoid
- Was sollte vermieden werden?

## What to Do Differently
- Was sollte das neue Buch bewusst anders machen?

## Key Selling Points
- Formuliere 5 bis 7 konkrete Key Selling Points.

Regeln:
- Bleibe marktorientiert und konkret.
- Keine generischen Floskeln.
- Keine erfundenen Bestseller-Fakten.
- Positionierung muss zum Genre passen.`;

  try {
    const out = await callTextModel(prompt);
    target.value = (out || "").trim();

    state.marketResearch = {
      ...state.marketResearch,
      marketGapStrategy: target.value,
      marketGapAnalysis: target.value,
      uspStrategy: target.value,
    };

    saveProjectToLocal();

    if (!target.value) {
      target.value = "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }
  } catch (e) {
    target.value = e.message;
  } finally {
    button.disabled = false;
  }
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

  if (!competitor.title) {
    alert("Bitte mindestens einen Titel für das Wettbewerbsbuch eingeben.");
    return;
  }

  if (
    !competitor.description &&
    !competitor.corePromiseGuess &&
    !competitor.differentiationGuess
  ) {
    alert(
      "Bitte füge für das Wettbewerbsbuch mindestens eine Beschreibung, ein zentrales Versprechen oder ein Differenzierungsmerkmal hinzu.",
    );
    return;
  }

  state.competitors.push(competitor);

  resetDerivedMarketResearch();

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

  const competitorBreakdown = $("competitorBreakdown").value.trim();
  const patternAnalysis = $("patternAnalysis").value.trim();
  const marketGapStrategy = $("marketGapStrategy").value.trim();

  const target = $("marketAnalysis");
  const button = $("analyzeMarket");

  if (state.competitors.length < 3) {
    target.value = "⚠️ Hinweis: Für eine aussagekräftige Marktanalyse werden mindestens 3 Wettbewerbsbücher empfohlen.\n\n";
  } else {
    target.value = "";
  }

  target.value += "Generiere...";
  button.disabled = true;

  const prompt = `Du bist ein erfahrener Buchmarkt-Analyst und Positionierungsstratege.

Aufgabe:
Erstelle eine vollständige Marktanalyse für das neue Buchprojekt.
Nutze dabei die vorhandenen Zwischenstufen der Analyse und verdichte sie zu einer finalen strategischen Marktanalyse.

NEUES BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

WETTBEWERBSBÜCHER:
${JSON.stringify(state.competitors, null, 2)}

COMPETITOR BREAKDOWN:
${competitorBreakdown || "Kein Competitor Breakdown vorhanden."}

PATTERN EXTRACTION:
${patternAnalysis || "Keine Pattern Extraction vorhanden."}

MARKET GAP + USP STRATEGY:
${marketGapStrategy || "Keine Market-Gap-Strategie vorhanden."}

Liefere die Analyse in dieser Struktur:

1. Competitive Landscape
- Wie sieht der Markt insgesamt aus?
- Welche Arten von Büchern dominieren?
- Welche Positionierungen sind sichtbar?

2. Competitor Summary
- Was sind die wichtigsten Erkenntnisse aus den Wettbewerbsbüchern?

3. Pattern Summary
- Welche dominanten Markt-Muster wurden erkannt?

4. Overused Angles
- Welche Perspektiven oder Versprechen sind übernutzt?

5. Market Gap
- Welche echte Marktchance ist sichtbar?

6. Positioning Strategy for the New Book
- Wie sollte das neue Buch positioniert werden?

7. Unique Selling Proposition
- Formuliere eine klare USP.

8. Competitive Strategy
- Was soll übernommen werden?
- Was soll vermieden werden?
- Was soll neu gemacht werden?

9. Key Selling Points
- Formuliere 5 bis 7 Key Selling Points.

Regeln:
- Baue auf den vorhandenen Zwischenstufen auf.
- Werde konkret.
- Erfinde keine Daten.
- Passe die Analyse sauber an das Genre an.`;

  try {
    const out = await callTextModel(prompt);
    target.value = (out || "").trim();

    state.marketResearch = {
      ...state.marketResearch,
      competitorBreakdown: target.value,
      patternAnalysis: "",
      marketGapStrategy: "",
      finalMarketAnalysis: "",
      marketGapAnalysis: "",
      uspStrategy: "",
    };

    $("patternAnalysis").value = "";
    $("marketGapStrategy").value = "";
    $("marketAnalysis").value = "";

    state.proposedBook = "";
    state.titles = [];
    state.outline = null;
    state.flatSections = [];
    state.currentSectionIndex = 0;
    state.manuscriptSections = [];

    $("proposedBook").value = "";
    $("titleOptions").innerHTML = "";
    $("outline").value = "";
    $("currentSection").value = "";
    $("manuscript").value = "";
    refreshWritingView();

    saveProjectToLocal();

    if (!target.value) {
      target.value = "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }
  } catch (e) {
    target.value = e.message;
  } finally {
    button.disabled = false;
  }
});
  
$("generateTitles").addEventListener("click", async () => {
  readResearchForm();
  const genreInstructions = getGenrePromptInstructions(state.research.genre);

  const marketGapStrategy =
    state.marketResearch?.marketGapStrategy || $("marketGapStrategy")?.value || "";

  const finalMarketAnalysis =
    state.marketResearch?.finalMarketAnalysis || $("marketAnalysis")?.value || "";

  const prompt = `Du bist ein erfahrener Buchmarketing-Stratege.

Aufgabe:
Generiere 10 starke, marktfähige Buchtitel für dieses Buchprojekt.

Die Titel sollen:
- merkfähig
- klar positioniert
- nicht generisch
- passend zum Genre
sein.

BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

PROPOSED BOOK:
${state.proposedBook || "Kein Proposed Book vorhanden."}

MARKET GAP + USP STRATEGY:
${marketGapStrategy || "Keine Market-Gap-Strategie vorhanden."}

FINALE MARKTANALYSE:
${finalMarketAnalysis || "Keine finale Marktanalyse vorhanden."}

Regeln:
- Die Titel müssen die zentrale Idee oder Transformation des Buchs andeuten.
- Die Titel sollen eine klare Positionierung im Markt erkennen lassen.
- Vermeide generische Titel wie "Der ultimative Guide".
- Wenn es zum Genre passt, kombiniere Haupttitel + Untertitel.
- Untertitel dürfen Nutzen, Zielgruppe oder Differenzierung klar machen.
- Die Titel müssen zum Genre passen.

Format:
Nur Titelzeilen.

Beispiel:
Atomic Habits – Tiny Changes, Remarkable Results

Keine Nummerierung.
Keine Erklärung.
Nur die Titel.`;

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

  const patternAnalysis = $("patternAnalysis").value.trim();
  const marketGapStrategy = $("marketGapStrategy").value.trim();
  const finalMarketAnalysis = $("marketAnalysis").value.trim();

  const prompt = `Du bist ein erfahrener Buch-Positionierungsstratege.

Aufgabe:
Erstelle ein starkes "Proposed Book Concept" für dieses neue Buchprojekt.
Das Ergebnis soll das strategische Fundament für Titel, Outline und spätere Kapitel bilden.

PROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

PERSONA:
${state.persona || "Keine Persona vorhanden."}

PATTERN ANALYSIS:
${patternAnalysis || "Keine Pattern Analysis vorhanden."}

MARKET GAP + USP STRATEGY:
${marketGapStrategy || "Keine Market-Gap-Strategie vorhanden."}

FINALE MARKTANALYSE:
${finalMarketAnalysis || "Keine finale Marktanalyse vorhanden."}

FOCUS TAGS:
${$("focusTags").value || ""}

Liefere die Ausgabe in dieser Struktur:

# Proposed Book Concept

## Core Idea
- Was ist die zentrale Idee des Buchs?

## Target Audience
- Für wen ist das Buch konkret gedacht?

## Reader Problem
- Welches Kernproblem löst das Buch?

## Reader Transformation
- Was soll sich für den Leser nach dem Buch verändern?

## Central Promise
- Welches zentrale Versprechen gibt das Buch?

## Unique Selling Proposition
- Was ist die klare USP des Buchs?

## Positioning Statement
- Wie sollte das Buch im Markt positioniert werden?

## Core Framework or Approach
- Welcher Ansatz, welches Modell oder welche Denklogik trägt das Buch?

## Why This Book Will Sell
- Warum hat dieses Buch eine echte Marktchance?

## Key Differentiators
- Was unterscheidet es klar von den Wettbewerbern?

## Key Selling Points
- Formuliere 5 bis 7 konkrete Selling Points.

Regeln:
- Baue direkt auf Marktanalyse, Pattern Analysis und Market Gap Strategy auf.
- Vermeide generische Standardformulierungen.
- Schreibe konkret, marktfähig und differenzierend.
- Die Positionierung muss zum Genre passen.
- Das Ergebnis soll direkt als Grundlage für Titel, Outline und Writing dienen.`;

   const pbWarnings = [];

  if (!state.marketResearch?.marketGapStrategy && !$("marketGapStrategy")?.value.trim()) {
    pbWarnings.push("Market Gap + USP Strategy fehlt. Das Proposed Book kann dadurch generischer werden.");
  }

  if (!state.marketResearch?.finalMarketAnalysis && !$("marketAnalysis")?.value.trim()) {
    pbWarnings.push("Finale Marktanalyse fehlt. Positionierung und Selling Logic können dadurch schwächer sein.");
  }

  showWarningsInTextarea($("proposedBook"), pbWarnings);
  $("proposedBook").value += "Generiere...";

  try {
    const out = await callTextModel(prompt);
    state.proposedBook = out;
    $("proposedBook").value = out;
    saveProjectToLocal();

    if (!out || !out.trim()) {
      $("proposedBook").value =
        "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }
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
  marketGapStrategy: $("marketGapStrategy").value.trim(),
  finalMarketAnalysis: $("marketAnalysis").value.trim(),
  resources: state.resources.slice(0, 30),
      
};

const structureInstructions = getStructureInstructions(spec.structure);

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
- Die Outline muss das Strategie-Briefing, das Proposed Book und die Marktpositionierung klar widerspiegeln
- Die Outline muss die erkannte Market Gap / USP Strategy sichtbar in die Buchstruktur übersetzen
- Keine generische Standard-Non-Fiction-Struktur, wenn sie nicht zum Genre passt
- Kapitel und Sektionen sollen logisch aufeinander aufbauen
- Jedes Kapitel soll eine klare strategische Funktion haben
- Die Kapitel sollen zusammen die Reader Transformation systematisch ermöglichen
- Die Summe aller Kapitel soll ungefähr dem Gesamtziel aus Input.targetWords entsprechen
- Die Wortverteilung soll sinnvoll auf Input.chapterCount und die Dramaturgie des Buchs verteilt werden
- targetWords in Kapiteln und Sektionen müssen als Zahlen ausgegeben werden
- Jedes Kapitel muss eine realistische Zielwortzahl bekommen
- Jede Sektion muss eine realistische Zielwortzahl bekommen
- Die Summe der Sektionen eines Kapitels soll ungefähr der Zielwortzahl des jeweiligen Kapitels entsprechen
- Vermeide Mini-Sektionen ohne Substanz
- Vermeide extrem ungleichmäßige Verteilungen ohne strategischen Grund

Zusätzliche Regeln:
- Die Buchstruktur soll die Marktchance besetzen, die in Input.marketGapStrategy beschrieben ist
- Die Outline soll klar differenzieren, nicht nur Standardwissen wiederholen
- Die Kapitel sollen so aufgebaut sein, dass sie später starke, nicht generische Buchsektionen ermöglichen
- Vermeide austauschbare Kapitel wie "Einführung", "Grundlagen", "Fazit", wenn sie nicht wirklich strategisch nötig sind

EMPFOHLENE KAPITELLOGIK FÜR DIE GEWÄHLTE STRUKTUR:
${structureInstructions}

Input:
${JSON.stringify(spec, null, 2)}`;

        const outlineWarnings = [];

    if (!$("proposedBook").value.trim()) {
      outlineWarnings.push("Proposed Book fehlt. Die Outline kann dadurch generisch werden.");
    }

    if (
      !state.marketResearch?.marketGapStrategy &&
      !$("marketGapStrategy")?.value.trim()
    ) {
      outlineWarnings.push("Market Gap + USP Strategy fehlt. Die Outline kann dadurch marktunscharf werden.");
    }

    showWarningsInTextarea($("outline"), outlineWarnings);
    $("outline").value += "Generiere JSON...";
    try {
      const out = await callTextModel(prompt, { system, json: true });
      const jsonText = extractFirstJsonObject(out);
      if (!jsonText) {
        throw new Error("Outline konnte nicht als gültiges JSON gelesen werden. Bitte erneut versuchen.");
      }
      const parsed = JSON.parse(jsonText);
      const normalized = normalizeOutlineTargetWords(
        parsed,
        spec.targetWords,
        spec.chapterCount,
      );

      const report = getOutlineTargetWordsReport(normalized, spec.targetWords);

      state.outline = {
        ...normalized,
        structure: spec.structure,
      };
      state.flatSections = parseOutlineToFlatSections(state.outline);
      state.currentSectionIndex = 0;
      state.manuscriptSections = [];

      const outlineNote =
        report.deviationPct > 0.15
          ? `\n\n⚠️ Hinweis: Die Kapitel-Zielwörter weichen aktuell um ${report.deviation} Wörter vom Gesamtziel ab.`
          : "";

      $("outline").value = JSON.stringify(normalized, null, 2) + outlineNote;
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

  const writingWarnings = [];

  if (!state.proposedBook?.trim()) {
    writingWarnings.push("Proposed Book fehlt. Die Kapitel können dadurch generischer werden.");
  }

  if (
    !state.marketResearch?.marketGapStrategy &&
    !$("marketGapStrategy")?.value.trim()
  ) {
    writingWarnings.push("Market Gap + USP Strategy fehlt. Die Kapitel können dadurch weniger differenziert sein.");
  }

  if (!state.persona?.trim()) {
    writingWarnings.push("Persona fehlt. Stil und Stimme können dadurch uneinheitlich werden.");
  }

  const idx = isRewrite
    ? Math.max(0, state.currentSectionIndex - 1)
    : state.currentSectionIndex;

  const sec = state.flatSections[idx];

  if (!sec) {
    $("currentSection").value = "Keine weitere Sektion verfügbar.";
    return;
  }

  const previous = state.manuscriptSections.join("\n\n").slice(-12000);
  const resourceContext = state.resources
    .map((r) => `${r.type}:${r.label}\n${r.content?.slice(0, 1200) || ""}`)
    .join("\n\n")
    .slice(0, 12000);

  const genreInstructions = getGenrePromptInstructions(state.research.genre);

const proposedBook = state.proposedBook || "";
const marketGapStrategy =
  state.marketResearch?.marketGapStrategy || $("marketGapStrategy")?.value || "";
const finalMarketAnalysis =
  state.marketResearch?.finalMarketAnalysis || $("marketAnalysis")?.value || "";

const chapterNumber = (sec.cIdx ?? 0) + 1;
const sectionNumber = (sec.sIdx ?? 0) + 1;
const totalChapters = state.outline?.chapters?.length || 0;
const totalSectionsInChapter = state.outline?.chapters?.[sec.cIdx]?.sections?.length || 0;

const prompt = `Du bist ein professioneller Buchautor und Ghostwriter auf Verlagsniveau.
Du schreibst keinen Blogartikel, keinen SEO-Text und keinen KI-Infotext, sondern lesbaren, zusammenhängenden Buchtext.

AUFGABE:
Schreibe genau den Fließtext für die aktuelle Buchsektion in deutscher Sprache.

WICHTIGES ZIEL:
Der Text muss sich wie ein echter Abschnitt eines veröffentlichten Buches lesen:
- souverän
- flüssig
- inhaltlich konkret
- stilistisch konsistent
- ohne künstliche Übergangsfloskeln
- ohne Wiederholung des Buchtitels oder Kapiteltitels im Fließtext, außer wenn es inhaltlich wirklich nötig ist

AUSGABEREGELN:
- Gib nur den eigentlichen Buchtext der Sektion aus.
- Keine Markdown-Syntax im Inhalt.
- Keine Überschrift ausgeben.
- Keine Kapitelüberschrift ausgeben.
- Keine Sektionsüberschrift ausgeben.
- Keine Doppeltitel.
- Keine Meta-Sätze wie "Im nächsten Abschnitt", "Als Nächstes", "In diesem Kapitel werden wir".
- Keine Erklärungen darüber, was du tust.
- Keine nummerierten Listen, außer wenn sie für das Genre und diese konkrete Sektion wirklich zwingend nötig sind.
- Kein künstlicher Abschluss nur um elegant zu wirken.
- Keine Wiederholung bereits erklärter Inhalte.
- Keine generischen Lehrbuch-Einleitungen.

QUALITÄTSREGELN:
- Schreibe spezifisch für dieses Buchprojekt, nicht allgemein.
- Nutze Persona, Genre, Research-Strategie, Proposed Book und Marktpositionierung konsequent.
- Der Abschnitt muss inhaltlich auf vorherigem Text aufbauen.
- Der Abschnitt muss genau die Funktion dieser Sektion erfüllen und nicht mehrere Kapitel zugleich vermischen.
- Unterstütze die USP und Differenzierung des Buchs aktiv.
- Wenn das Buch für Kinder oder Jugendliche gedacht ist, schreibe klar, zugänglich, lebendig und altersgerecht, aber nicht banal.
- Wenn historische Inhalte vorkommen, erzähle geordnet, anschaulich und verständlich statt lexikonartig.
- Vermeide leere Phrasen, Füllsätze und austauschbare Motivationssprache.
- Zeige Zusammenhänge, Bilder, Beispiele oder kurze erzählerische Mikro-Übergänge, wenn sie dem Lesefluss dienen.
- Länge: ungefähr ${sec.targetWords} Wörter.

VERBOTEN:
- "In der heutigen Welt"
- "Es ist wichtig zu verstehen"
- "Letztendlich"
- "Am Ende des Tages"
- "Wie wir gesehen haben"
- "Im nächsten Abschnitt"
- "Als Nächstes"
- "Zusammenfassend lässt sich sagen"
- jede Form von KI-typischer Moderationssprache

KONTEXT ZUR AKTUELLEN POSITION IM BUCH:
- Kapitelnummer: ${chapterNumber} von ${totalChapters}
- Kapitel: ${sec.chapterTitle}
- Sektionsnummer: ${sectionNumber} von ${totalSectionsInChapter}
- Sektion: ${sec.sectionTitle}
- Unterthemen: ${(sec.subsections || []).join(", ") || "keine"}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

BUCHSTRUKTUR:
${getStructureInstructions(state.outline?.structure || $("structure")?.value?.trim() || "")}

BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

PROPOSED BOOK CONCEPT:
${proposedBook || "Kein Proposed Book vorhanden."}

MARKET GAP + USP STRATEGY:
${marketGapStrategy || "Keine Market-Gap-Strategie vorhanden."}

FINALE MARKTANALYSE:
${finalMarketAnalysis || "Keine finale Marktanalyse vorhanden."}

PERSONA:
${state.persona || "Keine Persona vorhanden."}

BISHERIGER BUCHTEXT (letzter Kontext, nicht wiederholen):
${previous}

RESSOURCEN:
${resourceContext}

INTERNE SELBSTPRÜFUNG VOR DEM SCHREIBEN:
1. Klingt der Abschnitt wie ein echtes Buch und nicht wie eine KI-Zusammenfassung?
2. Ist der Text konkret statt generisch?
3. Passt der Stil zur Zielgruppe und zum Genre?
4. Wird nichts doppelt erklärt?
5. Wird nur diese Sektion geschrieben und keine Vorschau auf spätere Abschnitte?`;

  showWarningsInTextarea($("currentSection"), writingWarnings);
  $("currentSection").value += "Generiere...";

  try {
    const out = await callTextModel(prompt);
    const cleanedOut = (out || "").trim();
    const actualWords = countWords(cleanedOut);
    const targetWords = Number(sec.targetWords) || 700;
    const minWords = Math.round(targetWords * 0.75);
    const maxWords = Math.round(targetWords * 1.3);

    const finalOut = cleanedOut;
    const wordHint =
      actualWords < minWords || actualWords > maxWords
        ? `\n\n⚠️ Ziel ca. ${targetWords} Wörter, tatsächlich ${actualWords} Wörter.`
        : "";

    $("currentSection").value = finalOut + wordHint;

    const formattedSection = formatManuscriptSection(sec, finalOut, idx);

    if (isRewrite) {
      state.manuscriptSections[idx] = formattedSection;
    } else {
      state.manuscriptSections.push(formattedSection);
      state.currentSectionIndex += 1;
    }

    refreshWritingView();
    saveProjectToLocal();
   } catch (e) {
    $("currentSection").value = e.message;
  }
}

$("generateNextSection").addEventListener("click", () => writeSection(false));
$("rewriteCurrent").addEventListener("click", () => writeSection(true));

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

  const marketGapStrategy =
    state.marketResearch?.marketGapStrategy || $("marketGapStrategy")?.value || "";

  const finalMarketAnalysis =
    state.marketResearch?.finalMarketAnalysis || $("marketAnalysis")?.value || "";

  const manuscriptExcerpt = state.manuscriptSections.join("\n\n").slice(0, 8000);

  const prompt = `Du bist ein professioneller Buchmarketing-Texter und Positionierungsstratege.

Aufgabe:
Erstelle eine starke, marktfähige Buchbeschreibung für dieses Projekt.
Die Beschreibung soll die Marktpositionierung, die USP und den zentralen Nutzen des Buchs sichtbar machen.

BUCHPROJEKT:
${JSON.stringify(state.research, null, 2)}

RESEARCH-STRATEGIE:
${state.researchStrategy || "Kein Strategie-Briefing vorhanden."}

GENRE:
${state.research.genre || "nicht angegeben"}

${genreInstructions}

PROPOSED BOOK:
${state.proposedBook || "Kein Proposed Book vorhanden."}

MARKET GAP + USP STRATEGY:
${marketGapStrategy || "Keine Market-Gap-Strategie vorhanden."}

FINALE MARKTANALYSE:
${finalMarketAnalysis || "Keine finale Marktanalyse vorhanden."}

MANUSKRIPT AUSZUG:
${manuscriptExcerpt || "Kein Manuskript vorhanden."}

Liefere eine Buchbeschreibung mit diesen Zielen:
- klarer Hook
- starke Relevanz für die Zielgruppe
- klares Nutzenversprechen oder emotionaler Reiz
- sichtbare Differenzierung vom Markt
- stilistisch passend zum Genre

Regeln:
- Passe Sprache, Ton und Aufbau an das Genre an.
- Für Self-Help, Business, Fachbuch und Ratgeber darf die Beschreibung klar nutzenorientiert und verkaufsstark sein.
- Für Kinderbuch, Roman / Fiction, Religion / Spiritualität und Biografie soll die Sprache passender, glaubwürdiger und weniger wie aggressive Sales-Copy wirken.
- Vermeide generische Phrasen.
- Mache die USP des Buchs spürbar.
- Die Beschreibung soll so klingen, als hätte dieses Buch einen echten Grund zu existieren.`;

  $("bookDescription").value = "Generiere...";

  try {
    const out = await callTextModel(prompt);
    state.description = out;
    $("bookDescription").value = out;
    saveProjectToLocal();

    if (!out || !out.trim()) {
      $("bookDescription").value =
        "⚠️ Leere Antwort erhalten. Bitte erneut versuchen oder ein anderes Modell wählen.";
    }
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

$("downloadDocHtml").addEventListener("click", async () => {
  readResearchForm();

  try {
    const blob = await buildKdpDocxBlob();
    const safeTitle = (state.research.bookTitle || "bookforge-manuscript")
      .replace(/[\\/:*?"<>|]+/g, "")
      .trim();

    downloadBlob(`${safeTitle || "bookforge-manuscript"}.docx`, blob);
  } catch (e) {
    alert(`DOCX Export fehlgeschlagen: ${e.message}`);
  }
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
    $("competitorBreakdown").value = state.marketResearch?.competitorBreakdown || "";
    $("patternAnalysis").value = state.marketResearch?.patternAnalysis || "";
    $("marketGapStrategy").value = state.marketResearch?.marketGapStrategy || "";
    $("marketAnalysis").value = state.marketResearch?.finalMarketAnalysis || "";
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
    const image = document.createElement("img");
    image.src = img.url;
    image.alt = img.type || "";
    
    const caption = document.createElement("figcaption");
    caption.textContent = `${img.type || ""}: ${img.prompt || ""}`;
    
    figure.appendChild(image);
    figure.appendChild(caption);
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
  $("competitorBreakdown").value = state.marketResearch?.competitorBreakdown || "";
  $("patternAnalysis").value = state.marketResearch?.patternAnalysis || "";
  $("marketGapStrategy").value = state.marketResearch?.marketGapStrategy || "";
  $("marketAnalysis").value = state.marketResearch?.finalMarketAnalysis || "";
  $("outline").value = state.outline ? JSON.stringify(state.outline, null, 2) : "";
  $("bookDescription").value = state.description || "";
  refreshWritingView();
  renderImages();
  bindEvents();
}

init();
