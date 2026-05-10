import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const dataDir = path.join(rootDir, 'data');
const dbPath = path.join(dataDir, 'ielts-study.db');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    create table if not exists profile (
      id integer primary key check (id = 1),
      student_name text not null,
      target_score real not null,
      exam_date text not null,
      current_stage text not null,
      daily_study_minutes integer not null,
      focus_areas text not null
    );

    create table if not exists mock_scores (
      id integer primary key autoincrement,
      date text not null,
      overall real not null,
      listening real not null,
      reading real not null,
      writing real not null,
      speaking real not null
    );

    create table if not exists vocabulary_stats (
      id integer primary key check (id = 1),
      learned integer not null,
      target integer not null,
      today_new integer not null,
      today_review integer not null
    );

    create table if not exists settings (
      key text primary key,
      value text not null
    );

    create table if not exists tasks (
      id text primary key,
      title text not null,
      type text not null,
      estimated_minutes integer not null,
      done integer not null default 0
    );

    create table if not exists writing_records (
      id text primary key,
      date text not null,
      task text not null,
      topic text not null,
      band real not null,
      focus text not null,
      feedback text not null
    );

    create table if not exists reading_records (
      id text primary key,
      date text not null,
      passage text not null,
      score text not null,
      question_types text not null,
      mistakes integer not null default 0,
      notes text not null
    );

    create table if not exists listening_records (
      id text primary key,
      date text not null,
      section text not null,
      score text not null,
      mistakes text not null,
      review text not null
    );

    create table if not exists speaking_records (
      id text primary key,
      date text not null,
      part text not null,
      topic text not null,
      band real,
      feedback text not null
    );
  `);

  seedIfNeeded();
}

export function buildDashboard() {
  const tasks = getTasks();
  const records = getRecords();
  const vocabulary = getVocabulary();
  const stats = {
    writingRecords: records.writing.length,
    readingRecords: records.reading.length,
    listeningAnalyses: records.listening.length,
    vocabularyProgress: Math.round((vocabulary.learned / Math.max(vocabulary.target, 1)) * 100),
  };
  const done = tasks.filter((task) => task.done).length;

  return {
    profile: getProfile(),
    lastMock: getLatestMock(),
    todayAdvice: getSetting('todayAdvice', []),
    stats,
    vocabulary,
    weeklyGoal: getSetting('weeklyGoal', ''),
    tasks,
    records,
    supervision: {
      total: tasks.length,
      done,
      remaining: tasks.length - done,
      plannedMinutes: tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0),
      completionRate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
      status: done === tasks.length ? '今日任务已完成' : `还有 ${tasks.length - done} 个任务未完成`,
    },
  };
}

export function updateTaskDone(id, done) {
  const result = db.prepare('update tasks set done = ? where id = ?').run(done ? 1 : 0, id);
  return result.changes;
}

export function insertWritingRecord(input) {
  const record = {
    id: nextId('writing_records', 'w'),
    date: today(),
    task: input.task || 'Task 2',
    topic: input.topic || 'Untitled writing task',
    band: toNumber(input.band, 6),
    focus: input.focus || '待复盘',
    feedback: input.feedback || '已新增写作记录，请补充批改反馈。',
  };
  db.prepare(`
    insert into writing_records (id, date, task, topic, band, focus, feedback)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.date, record.task, record.topic, record.band, record.focus, record.feedback);
  return record;
}

export function insertReadingRecord(input) {
  const record = {
    id: nextId('reading_records', 'r'),
    date: today(),
    passage: input.passage || 'Untitled passage',
    score: input.score || '0/40',
    questionTypes: normalizeList(input.questionTypes),
    mistakes: toNumber(input.mistakes, 0),
    notes: input.notes || '已新增阅读精读记录。',
  };
  db.prepare(`
    insert into reading_records (id, date, passage, score, question_types, mistakes, notes)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.date, record.passage, record.score, json(record.questionTypes), record.mistakes, record.notes);
  return record;
}

export function insertListeningRecord(input) {
  const record = {
    id: nextId('listening_records', 'l'),
    date: today(),
    section: input.section || 'Section 3',
    score: input.score || '0/10',
    mistakes: normalizeList(input.mistakes),
    review: input.review || '已新增听力复盘记录。',
  };
  db.prepare(`
    insert into listening_records (id, date, section, score, mistakes, review)
    values (?, ?, ?, ?, ?, ?)
  `).run(record.id, record.date, record.section, record.score, json(record.mistakes), record.review);
  return record;
}

export function insertSpeakingRecord(input) {
  const record = {
    id: nextId('speaking_records', 's'),
    date: today(),
    part: input.part || 'Part 2',
    topic: input.topic || 'Untitled speaking prompt',
    band: input.band === '' || input.band == null ? null : toNumber(input.band, 6),
    feedback: input.feedback || '已新增口语练习记录。',
  };
  db.prepare(`
    insert into speaking_records (id, date, part, topic, band, feedback)
    values (?, ?, ?, ?, ?, ?)
  `).run(record.id, record.date, record.part, record.topic, record.band, record.feedback);
  return record;
}

export function updateVocabularyStats(input) {
  const current = getVocabulary();
  const learned = current.learned + toNumber(input.learnedDelta, 0);
  const todayNew = toNumber(input.todayNew, current.todayNew);
  const todayReview = toNumber(input.todayReview, current.todayReview);
  db.prepare(`
    update vocabulary_stats set learned = ?, today_new = ?, today_review = ? where id = 1
  `).run(learned, todayNew, todayReview);
}

function seedIfNeeded() {
  const row = db.prepare('select count(*) as count from profile').get();
  if (row.count > 0) return;

  const profile = readSeed('profile.json');
  const dashboard = readSeed('dashboard.json');
  const tasks = readSeed('tasks.json');
  const writing = readSeed('writing.json');
  const reading = readSeed('reading.json');
  const listening = readSeed('listening.json');
  const speaking = readSeed('speaking.json');

  db.exec('BEGIN');
  try {
    db.prepare(`
      insert into profile (id, student_name, target_score, exam_date, current_stage, daily_study_minutes, focus_areas)
      values (1, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.studentName,
      profile.targetScore,
      profile.examDate,
      profile.currentStage,
      profile.dailyStudyMinutes,
      json(profile.focusAreas),
    );

    db.prepare(`
      insert into mock_scores (date, overall, listening, reading, writing, speaking)
      values (?, ?, ?, ?, ?, ?)
    `).run(
      dashboard.lastMock.date,
      dashboard.lastMock.overall,
      dashboard.lastMock.listening,
      dashboard.lastMock.reading,
      dashboard.lastMock.writing,
      dashboard.lastMock.speaking,
    );

    db.prepare(`
      insert into vocabulary_stats (id, learned, target, today_new, today_review)
      values (1, ?, ?, ?, ?)
    `).run(
      dashboard.vocabulary.learned,
      dashboard.vocabulary.target,
      dashboard.vocabulary.todayNew,
      dashboard.vocabulary.todayReview,
    );

    setSetting('todayAdvice', dashboard.todayAdvice);
    setSetting('weeklyGoal', tasks.weeklyGoal);

    const insertTask = db.prepare(`
      insert into tasks (id, title, type, estimated_minutes, done)
      values (?, ?, ?, ?, ?)
    `);
    for (const task of tasks.today) {
      insertTask.run(task.id, task.title, task.type, task.estimatedMinutes, task.done ? 1 : 0);
    }

    const insertWriting = db.prepare(`
      insert into writing_records (id, date, task, topic, band, focus, feedback)
      values (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of writing.records) {
      insertWriting.run(record.id, record.date, record.task, record.topic, record.band, record.focus, record.feedback);
    }

    const insertReading = db.prepare(`
      insert into reading_records (id, date, passage, score, question_types, mistakes, notes)
      values (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of reading.records) {
      insertReading.run(record.id, record.date, record.passage, record.score, json(record.questionTypes), record.mistakes ?? 0, record.notes);
    }

    const insertListening = db.prepare(`
      insert into listening_records (id, date, section, score, mistakes, review)
      values (?, ?, ?, ?, ?, ?)
    `);
    for (const record of listening.records) {
      insertListening.run(record.id, record.date, record.section, record.score, json(record.mistakes), record.review);
    }

    const insertSpeaking = db.prepare(`
      insert into speaking_records (id, date, part, topic, band, feedback)
      values (?, ?, ?, ?, ?, ?)
    `);
    for (const record of speaking.records) {
      insertSpeaking.run(record.id, record.date, record.part, record.topic, record.band ?? null, record.feedback);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getProfile() {
  const row = db.prepare('select * from profile where id = 1').get();
  return {
    studentName: row.student_name,
    targetScore: row.target_score,
    examDate: row.exam_date,
    currentStage: row.current_stage,
    dailyStudyMinutes: row.daily_study_minutes,
    focusAreas: parseJson(row.focus_areas, []),
  };
}

function getLatestMock() {
  const row = db.prepare('select * from mock_scores order by date desc, id desc limit 1').get();
  return {
    date: row.date,
    overall: row.overall,
    listening: row.listening,
    reading: row.reading,
    writing: row.writing,
    speaking: row.speaking,
  };
}

function getVocabulary() {
  const row = db.prepare('select * from vocabulary_stats where id = 1').get();
  return {
    learned: row.learned,
    target: row.target,
    todayNew: row.today_new,
    todayReview: row.today_review,
  };
}

function getTasks() {
  return db.prepare('select * from tasks order by id').all().map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    estimatedMinutes: row.estimated_minutes,
    done: Boolean(row.done),
  }));
}

function getRecords() {
  return {
    writing: db.prepare('select * from writing_records order by date desc, id desc').all().map((row) => ({
      id: row.id,
      date: row.date,
      task: row.task,
      topic: row.topic,
      band: row.band,
      focus: row.focus,
      feedback: row.feedback,
    })),
    reading: db.prepare('select * from reading_records order by date desc, id desc').all().map((row) => ({
      id: row.id,
      date: row.date,
      passage: row.passage,
      score: row.score,
      questionTypes: parseJson(row.question_types, []),
      mistakes: row.mistakes,
      notes: row.notes,
    })),
    listening: db.prepare('select * from listening_records order by date desc, id desc').all().map((row) => ({
      id: row.id,
      date: row.date,
      section: row.section,
      score: row.score,
      mistakes: parseJson(row.mistakes, []),
      review: row.review,
    })),
    speaking: db.prepare('select * from speaking_records order by date desc, id desc').all().map((row) => ({
      id: row.id,
      date: row.date,
      part: row.part,
      topic: row.topic,
      band: row.band,
      feedback: row.feedback,
    })),
  };
}

function getSetting(key, fallback) {
  const row = db.prepare('select value from settings where key = ?').get(key);
  return row ? parseJson(row.value, fallback) : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    insert into settings (key, value) values (?, ?)
    on conflict(key) do update set value = excluded.value
  `).run(key, json(value));
}

function nextId(table, prefix) {
  const row = db.prepare(`select id from ${table} where id like ? order by id desc limit 1`).get(`${prefix}-%`);
  const last = row?.id ? Number(row.id.split('-')[1]) : 0;
  return `${prefix}-${String(last + 1).padStart(3, '0')}`;
}

function readSeed(file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(value) {
  return JSON.stringify(value ?? null);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
