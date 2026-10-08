# DocMind

Upload a PDF, TXT or Markdown file and ask questions about it. Answers cite the passages they came from, so you can check every claim.

**Live demo:** https://docmind-dfnm.onrender.com
*(Free hosting sleeps when idle, so the first load can take ~30 seconds. Uploaded files are cleared when the server restarts.)*

![DocMind screenshot](screenshot.png)

Built with Node.js, Express and the Gemini API using Retrieval-Augmented Generation (RAG).

## How it works
1. **Ingest:** the file's text is split into overlapping ~900-character chunks.
2. **Embed:** each chunk is turned into a vector with `gemini-embedding-001`.
3. **Retrieve:** your question is embedded and compared to every chunk with cosine similarity. The top 5 are selected.
4. **Generate:** a Gemini Flash model answers using only those chunks and cites them as [1], [2]. If the answer isn't in the documents, it says so.

## Run locally
```bash
npm install
```
Create a `.env` file (copy `.env.example`) and add your free key from https://aistudio.google.com:
```
GEMINI_API_KEY=your_key_here
CHAT_MODEL=gemini-3.8-flash   # optional, defaults to this
```
```bash
npm start   # http://localhost:3000
```

## Project layout
- `rag.js`: chunking, embeddings, similarity search, answer generation
- `server.js`: Express API (`/api/upload`, `/api/ask`, `/api/docs`) with rate limiting
- `public/index.html`: the chat UI

## Limitations
- Vectors are stored in a local JSON file, so search slows down with very large documents.
- Scanned PDFs (images with no text layer) aren't supported.

## Ideas to extend
- Swap the JSON store for PostgreSQL + pgvector
- Stream answers token by token
- Add user accounts so each person has private documents
- Add tests for chunking and retrieval
