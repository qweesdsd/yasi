import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

import {
  buildDashboard,
  createPracticePrompt,
  generateDailyReview,
  getDailyReview,
  initializeDatabase,
  insertListeningRecord,
  insertReadingRecord,
  insertSpeakingRecord,
  insertWritingRecord,
  listPracticePrompts,
  syncDailyReviewTasks,
  submitPracticeAudioAttempt,
  submitPracticeAttempt,
  updateTaskDone,
  updateVocabularyStats,
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const speakingUploadDir = path.join(rootDir, 'uploads', 'speaking');
const port = Number(process.env.PORT ?? 3001);

initializeDatabase();
fs.mkdirSync(speakingUploadDir, { recursive: true });

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, speakingUploadDir),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname) || '.webm';
      cb(null, `${Date.now()}-${cryptoRandomId()}${extension}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'supabase' });
});

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    res.json(await buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.get('/api/practice/prompts', async (req, res, next) => {
  try {
    res.json({ prompts: await listPracticePrompts(req.query.skill) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/practice/generate', async (req, res, next) => {
  try {
    const prompt = await createPracticePrompt(req.body);
    res.json({ prompt });
  } catch (error) {
    next(error);
  }
});

app.post('/api/practice/:promptId/submit', async (req, res, next) => {
  try {
    const attempt = await submitPracticeAttempt(req.params.promptId, req.body);
    res.json({ attempt });
  } catch (error) {
    next(error);
  }
});

app.post('/api/practice/:promptId/submit-audio', audioUpload.single('audio'), async (req, res, next) => {
  try {
    const attempt = await submitPracticeAudioAttempt(req.params.promptId, {
      ...req.body,
      audio: req.file,
    });
    res.json({ attempt });
  } catch (error) {
    next(error);
  }
});

app.get('/api/daily-review', async (_req, res, next) => {
  try {
    res.json({ review: await getDailyReview() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/daily-review/generate', async (_req, res, next) => {
  try {
    res.json({ review: await generateDailyReview() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/daily-review/sync-tasks', async (_req, res, next) => {
  try {
    res.json(await syncDailyReviewTasks());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  try {
    const changes = await updateTaskDone(req.params.id, Boolean(req.body.done));
    if (!changes) return res.status(404).json({ error: 'Task not found.' });
    res.json(await buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.post('/api/writing', async (req, res, next) => {
  try {
    const record = await insertWritingRecord(req.body);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reading', async (req, res, next) => {
  try {
    const record = await insertReadingRecord(req.body);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/listening', async (req, res, next) => {
  try {
    const record = await insertListeningRecord(req.body);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/speaking', async (req, res, next) => {
  try {
    const record = await insertSpeakingRecord(req.body);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vocabulary', async (req, res, next) => {
  try {
    await updateVocabularyStats(req.body);
    res.json(await buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`IELTS Supabase API listening on http://localhost:${port}`);
});

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}
