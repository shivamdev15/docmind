const { Pool } = require('pg');

const KEY = () => process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_MODEL = 'gemini-embedding-001';
const CHAT_MODEL = process.env.CHAT_MODEL || 'gemini-3.8-flash';
const DIMS = 768;

const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false },
});

// Create the table once at startup.
const ready = (async () => {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    doc_id TEXT NOT NULL,
    doc_name TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector(${DIMS}) NOT NULL
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS chunks_doc_idx ON chunks (doc_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS chunks_vec_idx ON chunks USING hnsw (embedding vector_cosine_ops)');
})();
ready.catch((e) => console.error('Database setup failed:', e.message));

const toVec = (v) => `[${v.join(',')}]`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gemini(model, method, body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(`${BASE}/models/${model}:${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY() },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) return data;
    const retryable = res.status === 503 || res.status === 429;
    if (!retryable || i === tries - 1) throw new Error(data.error?.message || `Gemini error ${res.status}`);
    await sleep(1500 * 2 ** i); // 1.5s, 3s, then give up
  }
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

async function addDocument(docName, text) {
  await ready;
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('No readable text found in this file.');
  const vecs = await embed(chunks, 'RETRIEVAL_DOCUMENT');
  const docId = Date.now().toString(36);
  await pool.query(
    `INSERT INTO chunks (doc_id, doc_name, content, embedding)
     SELECT $1, $2, c, e::vector FROM unnest($3::text[], $4::text[]) AS t(c, e)`,
    [docId, docName, chunks, vecs.map(toVec)]
  );
  return { docId, docName, chunks: chunks.length };
}

async function listDocuments() {
  await ready;
  const { rows } = await pool.query(
    `SELECT doc_id AS "docId", doc_name AS "docName", COUNT(*)::int AS chunks
     FROM chunks GROUP BY doc_id, doc_name ORDER BY MIN(id)`
  );
  return rows;
}

async function removeDocument(docId) {
  await ready;
  await pool.query('DELETE FROM chunks WHERE doc_id = $1', [docId]);
}

async function ask(question, k = 5) {
  await ready;
  const { rows: count } = await pool.query('SELECT 1 FROM chunks LIMIT 1');
  if (!count.length) throw new Error('Upload a document first.');

  const [qVec] = await embed([question], 'RETRIEVAL_QUERY');
  const { rows: top } = await pool.query(
    `SELECT doc_name, content, 1 - (embedding <=> $1::vector) AS score
     FROM chunks ORDER BY embedding <=> $1::vector LIMIT $2`,
    [toVec(qVec), k]
  );

  const context = top.map((c, i) => `[${i + 1}] (${c.doc_name})\n${c.content}`).join('\n\n');
  const prompt = `Answer the question using only the numbered sources below. Cite sources inline like [1] or [2]. If the sources don't contain the answer, say you couldn't find it in the documents.\n\nSOURCES:\n${context}\n\nQUESTION: ${question}`;

  const data = await gemini(CHAT_MODEL, 'generateContent', {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const answer = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || 'No answer returned.';
  return {
    answer,
    sources: top.map((c, i) => ({ n: i + 1, doc: c.doc_name, score: +Number(c.score).toFixed(3), text: c.content })),
  };
}

module.exports = { addDocument, listDocuments, removeDocument, ask };
