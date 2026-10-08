require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const path = require('path');
const rateLimit = require('express-rate-limit');
const rag = require('./rag');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.set('trust proxy', 1); // behind Render's proxy
app.use(express.json());
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Wait a minute and try again.' },
}));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(400).json({ error: e.message }));

app.get('/api/docs', wrap(async (req, res) => res.json(await rag.listDocuments())));

app.post('/api/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new Error('Choose a file to upload.');
  const name = req.file.originalname;
  let text;
  if (name.toLowerCase().endsWith('.pdf')) text = (await pdf(req.file.buffer)).text;
  else if (/\.(txt|md)$/i.test(name)) text = req.file.buffer.toString('utf8');
  else throw new Error('Only PDF, TXT and MD files are supported.');
  res.json(await rag.addDocument(name, text));
}));

app.delete('/api/docs/:id', wrap(async (req, res) => {
  await rag.removeDocument(req.params.id);
  res.json({ ok: true });
}));

app.post('/api/ask', wrap(async (req, res) => {
  const q = (req.body.question || '').trim();
  if (!q) throw new Error('Type a question.');
  res.json(await rag.ask(q));
}));

if (!process.env.GEMINI_API_KEY) console.warn('Missing GEMINI_API_KEY in .env');
if (!process.env.DATABASE_URL) console.warn('Missing DATABASE_URL in .env');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`DocMind running at http://localhost:${port}`));
