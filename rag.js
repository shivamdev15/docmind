const fs = require('fs');
const path = require('path');

const KEY = () => process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = 'gemini-embedding-001';
const CHAT_MODEL = 'gemini-3.8-flash';
const DIMS = 768;

const DATA_FILE = path.join(__dirname, 'data', 'store.json');
let store = []; // [{ docId, docName, text, vec }]
try { store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
const save = () => {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store));
};

async function gemini(model, method, body) {
  const res = await fetch(`${BASE}/models/${model}:${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`);
  return data;
}

// Split text into overlapping chunks, preferring to break at sentence ends.
function chunkText(text, size = 900, overlap = 150) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const stop = clean.lastIndexOf('. ', end);
      if (stop > start + size * 0.6) end = stop + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}

async function embed(texts, taskType) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const data = await gemini(EMBED_MODEL, 'batchEmbedContents', {
      requests: batch.map((t) => ({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: t }] },
        taskType,
        outputDimensionality: DIMS,
      })),
    });
    out.push(...data.embeddings.map((e) => e.values));
  }
  return out;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function addDocument(docName, text) {
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('No readable text found in this file.');
  const vecs = await embed(chunks, 'RETRIEVAL_DOCUMENT');
  const docId = Date.now().toString(36);
  chunks.forEach((c, i) => store.push({ docId, docName, text: c, vec: vecs[i] }));
  save();
  return { docId, docName, chunks: chunks.length };
}

function listDocuments() {
  const map = new Map();
  for (const c of store) {
    const d = map.get(c.docId) || { docId: c.docId, docName: c.docName, chunks: 0 };
    d.chunks++;
    map.set(c.docId, d);
  }
  return [...map.values()];
}

function removeDocument(docId) {
  store = store.filter((c) => c.docId !== docId);
  save();
}

async function ask(question, k = 5) {
  if (!store.length) throw new Error('Upload a document first.');
  const [qVec] = await embed([question], 'RETRIEVAL_QUERY');
  const top = store
    .map((c) => ({ ...c, score: cosine(qVec, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const context = top.map((c, i) => `[${i + 1}] (${c.docName})\n${c.text}`).join('\n\n');
  const prompt = `Answer the question using only the numbered sources below. Cite sources inline like [1] or [2]. If the sources don't contain the answer, say you couldn't find it in the documents.\n\nSOURCES:\n${context}\n\nQUESTION: ${question}`;

  const data = await gemini(CHAT_MODEL, 'generateContent', {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const answer = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'No answer returned.';
  return {
    answer,
    sources: top.map((c, i) => ({ n: i + 1, doc: c.docName, score: +c.score.toFixed(3), text: c.text })),
  };
}

module.exports = { addDocument, listDocuments, removeDocument, ask };
