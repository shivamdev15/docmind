# DocMind

Upload a PDF, TXT or Markdown file and ask questions about it. Answers cite the passages they came from, so you can check every claim.

**Live demo:** https://docmind-dfnm.onrender.com
*(Free hosting sleeps when idle, so the first load can take ~30 seconds. Don't upload private documents to the demo: all visitors share one database.)*

Built with Node.js, Express, the Gemini API and PostgreSQL + pgvector using Retrieval-Augmented Generation (RAG).

## How it works
1. **Ingest:** the file's text is split into overlapping ~900-character chunks.
2. **Embed:** each chunk is turned into a 768-dimension vector with `gemini-embedding-001` and stored in PostgreSQL (pgvector).
3. **Retrieve:** your question is embedded and the 5 closest chunks are found with cosine similarity, using an HNSW index in the database.
4. **Generate:** a Gemini Flash model answers using only those chunks and cites them as [1], [2]. If the answer isn't in the documents, it says so.

## Run locally
```bash
npm install
```
Create a `.env` file (copy `.env.example`) with:
```
GEMINI_API_KEY=your_key_here          # free key from https://aistudio.google.com
DATABASE_URL=postgresql://...         # any Postgres with pgvector, e.g. a free Neon database
CHAT_MODEL=gemini-3.8-flash           # optional
```
```bash
npm start   # http://localhost:3000
```

## Project layout
- `rag.js`: chunking, embeddings, pgvector storage and search, answer generation (with retry on Gemini overload errors)
- `server.js`: Express API (`/api/upload`, `/api/ask`, `/api/docs`) with rate limiting
- `public/index.html`: the chat UI

## Limitations
- Scanned PDFs (images with no text layer) aren't supported.
- Documents are shared between all users of an instance (no accounts yet).

## Ideas to extend
- Add user accounts so each person has private documents
- Stream answers token by token
- Add tests for chunking and retrieval
- Show the PDF page number for each cited passage
