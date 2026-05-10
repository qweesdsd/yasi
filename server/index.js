import express from 'express';

import {
  buildDashboard,
  initializeDatabase,
  insertListeningRecord,
  insertReadingRecord,
  insertSpeakingRecord,
  insertWritingRecord,
  updateTaskDone,
  updateVocabularyStats,
} from './db.js';

const port = Number(process.env.PORT ?? 3001);

initializeDatabase();

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'sqlite', database: 'data/ielts-study.db' });
});

app.get('/api/dashboard', (_req, res, next) => {
  try {
    res.json(buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', (req, res, next) => {
  try {
    const changes = updateTaskDone(req.params.id, Boolean(req.body.done));
    if (!changes) return res.status(404).json({ error: 'Task not found.' });
    res.json(buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.post('/api/writing', (req, res, next) => {
  try {
    const record = insertWritingRecord(req.body);
    res.json({ record, dashboard: buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reading', (req, res, next) => {
  try {
    const record = insertReadingRecord(req.body);
    res.json({ record, dashboard: buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/listening', (req, res, next) => {
  try {
    const record = insertListeningRecord(req.body);
    res.json({ record, dashboard: buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/speaking', (req, res, next) => {
  try {
    const record = insertSpeakingRecord(req.body);
    res.json({ record, dashboard: buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vocabulary', (req, res, next) => {
  try {
    updateVocabularyStats(req.body);
    res.json(buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`IELTS SQLite API listening on http://localhost:${port}`);
});
