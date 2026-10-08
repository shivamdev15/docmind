# DocMind

Upload a PDF, TXT or Markdown file and ask questions about it. Answers cite the passages they came from. Built with Node.js, Express and the Gemini API using Retrieval-Augmented Generation (RAG).

## How it works
1. **Ingest:** the file's text is split into overlapping ~900-character chunks.
2. **Embed:** each chunk is turned into a vector with `gemini-embedding-001`.
3. **Retrieve:** your question is embedded and compared to every chunk with cosine similarity. The top 5 are selected.
4. **Generate:** `gemini-2.5-flash` answers using only those chunks and cites them as [1], [2].

## Run locally
```bash
npm install
cp .env.example .env   # add your free key from https://aistudio.google.com
npm start              # http://localhost:3000
```

## Project layout
- `rag.js`: chunking, embeddings, similarity search, answer generation
- `server.js`: Express API (`/api/upload`, `/api/ask`, `/api/docs`)
- `public/index.html`: the chat UI

## Ideas to extend
- Swap the JSON store for PostgreSQL + pgvector
- Stream answers token by token
- Add user accounts so each person has private documents
- Add tests for chunking and retrieval
