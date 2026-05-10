import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const port = Number(process.env.PORT ?? 3001);

const files = {
  profile: 'profile.json',
  dashboard: 'dashboard.json',
  tasks: 'tasks.json',
  writing: 'writing.json',
  reading: 'reading.json',
  listening: 'listening.json',
  speaking: 'speaking.json',
};

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storage: 'json', dataDir });
});

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    res.json(await buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/tasks/:id', async (req, res, next) => {
  try {
    const tasks = await readJson(files.tasks);
    const task = tasks.today.find((item) => item.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    task.done = Boolean(req.body.done);
    await writeJson(files.tasks, tasks);
    res.json(await buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.post('/api/writing', async (req, res, next) => {
  try {
    const writing = await readJson(files.writing);
    const dashboard = await readJson(files.dashboard);
    const record = {
      id: nextId(writing.records, 'w'),
      date: today(),
      task: req.body.task || 'Task 2',
      topic: req.body.topic || 'Untitled writing task',
      band: toNumber(req.body.band, 6),
      focus: req.body.focus || '待复盘',
      feedback: req.body.feedback || '已新增写作记录，请补充批改反馈。',
    };
    writing.records.unshift(record);
    dashboard.stats.writingRecords = writing.records.length;
    await writeJson(files.writing, writing);
    await writeJson(files.dashboard, dashboard);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reading', async (req, res, next) => {
  try {
    const reading = await readJson(files.reading);
    const dashboard = await readJson(files.dashboard);
    const record = {
      id: nextId(reading.records, 'r'),
      date: today(),
      passage: req.body.passage || 'Untitled passage',
      score: req.body.score || '0/40',
      questionTypes: normalizeList(req.body.questionTypes),
      mistakes: toNumber(req.body.mistakes, 0),
      notes: req.body.notes || '已新增阅读精读记录。',
    };
    reading.records.unshift(record);
    dashboard.stats.readingRecords = reading.records.length;
    await writeJson(files.reading, reading);
    await writeJson(files.dashboard, dashboard);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/listening', async (req, res, next) => {
  try {
    const listening = await readJson(files.listening);
    const dashboard = await readJson(files.dashboard);
    const record = {
      id: nextId(listening.records, 'l'),
      date: today(),
      section: req.body.section || 'Section 3',
      score: req.body.score || '0/10',
      mistakes: normalizeList(req.body.mistakes),
      review: req.body.review || '已新增听力复盘记录。',
    };
    listening.records.unshift(record);
    dashboard.stats.listeningAnalyses = listening.records.length;
    await writeJson(files.listening, listening);
    await writeJson(files.dashboard, dashboard);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/speaking', async (req, res, next) => {
  try {
    const speaking = await readJson(files.speaking);
    const record = {
      id: nextId(speaking.records, 's'),
      date: today(),
      part: req.body.part || 'Part 2',
      topic: req.body.topic || 'Untitled speaking prompt',
      band: req.body.band === '' || req.body.band == null ? null : toNumber(req.body.band, 6),
      feedback: req.body.feedback || '已新增口语练习记录。',
    };
    speaking.records.unshift(record);
    await writeJson(files.speaking, speaking);
    res.json({ record, dashboard: await buildDashboard() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/vocabulary', async (req, res, next) => {
  try {
    const dashboard = await readJson(files.dashboard);
    dashboard.vocabulary.learned += toNumber(req.body.learnedDelta, 0);
    dashboard.vocabulary.todayNew = toNumber(req.body.todayNew, dashboard.vocabulary.todayNew);
    dashboard.vocabulary.todayReview = toNumber(req.body.todayReview, dashboard.vocabulary.todayReview);
    dashboard.stats.vocabularyProgress = Math.round((dashboard.vocabulary.learned / dashboard.vocabulary.target) * 100);
    await writeJson(files.dashboard, dashboard);
    res.json(await buildDashboard());
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, () => {
  console.log(`IELTS JSON API listening on http://localhost:${port}`);
});

async function buildDashboard() {
  const [profile, dashboard, tasks, writing, reading, listening, speaking] = await Promise.all([
    readJson(files.profile),
    readJson(files.dashboard),
    readJson(files.tasks),
    readJson(files.writing),
    readJson(files.reading),
    readJson(files.listening),
    readJson(files.speaking),
  ]);
  const taskMinutes = tasks.today.reduce((sum, task) => sum + Number(task.estimatedMinutes || 0), 0);
  const done = tasks.today.filter((task) => task.done).length;

  return {
    profile,
    lastMock: dashboard.lastMock,
    todayAdvice: dashboard.todayAdvice,
    stats: dashboard.stats,
    vocabulary: dashboard.vocabulary,
    weeklyGoal: tasks.weeklyGoal,
    tasks: tasks.today,
    records: {
      writing: writing.records,
      reading: reading.records,
      listening: listening.records,
      speaking: speaking.records,
    },
    supervision: {
      total: tasks.today.length,
      done,
      remaining: tasks.today.length - done,
      plannedMinutes: taskMinutes,
      completionRate: tasks.today.length ? Math.round((done / tasks.today.length) * 100) : 0,
      status: done === tasks.today.length ? '今日任务已完成' : `还有 ${tasks.today.length - done} 个任务未完成`,
    },
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
}

async function writeJson(file, value) {
  await fs.writeFile(path.join(dataDir, file), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function nextId(records, prefix) {
  const max = records.reduce((current, record) => {
    const value = Number(String(record.id || '').replace(`${prefix}-`, ''));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
