import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(config.dataDir, file), 'utf8'));
}

function now() {
  return new Date().toISOString();
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function json(value) {
  return JSON.stringify(value ?? null);
}

export function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function nextId(table, prefix) {
  const row = db.prepare(`select id from ${table} where id like ? order by id desc limit 1`).get(`${prefix}-%`);
  const last = row?.id ? Number(row.id.split('-')[1]) : 0;
  return `${prefix}-${String(last + 1).padStart(3, '0')}`;
}

export function createId(table, prefix) {
  return nextId(table, prefix);
}

export function migrate() {
  db.exec(`
    create table if not exists profile (
      id integer primary key check (id = 1),
      student_name text not null,
      target_score real not null,
      exam_date text not null,
      current_stage text not null,
      daily_study_minutes integer not null,
      focus_areas text not null,
      updated_at text not null
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

    create table if not exists tasks (
      id text primary key,
      date text not null,
      title text not null,
      type text not null,
      estimated_minutes integer not null,
      done integer not null default 0,
      source text not null default 'seed',
      created_at text not null,
      completed_at text
    );

    create table if not exists writing_records (
      id text primary key,
      date text not null,
      task text not null,
      topic text not null,
      essay text,
      band real not null,
      focus text not null,
      feedback text not null,
      criteria text,
      top_fixes text,
      rewritten_paragraph text,
      created_at text not null
    );

    create table if not exists reading_records (
      id text primary key,
      date text not null,
      passage text not null,
      score text not null,
      question_types text not null,
      mistakes integer,
      notes text not null,
      mistake_causes text,
      review_plan text,
      vocabulary text,
      created_at text not null
    );

    create table if not exists listening_records (
      id text primary key,
      date text not null,
      section text not null,
      score text not null,
      mistakes text not null,
      review text not null,
      replay_plan text,
      drills text,
      created_at text not null
    );

    create table if not exists speaking_records (
      id text primary key,
      date text not null,
      part text not null,
      topic text not null,
      prompt text,
      answer text,
      band real,
      feedback text not null,
      fluency text,
      vocabulary text,
      grammar text,
      pronunciation_risks text,
      next_drill text,
      created_at text not null
    );

    create table if not exists vocabulary_stats (
      id integer primary key check (id = 1),
      learned integer not null,
      target integer not null,
      today_new integer not null,
      today_review integer not null,
      updated_at text not null
    );

    create table if not exists coach_events (
      id integer primary key autoincrement,
      type text not null,
      date text not null,
      summary text not null,
      payload text not null,
      created_at text not null
    );
  `);
}

export function seedIfNeeded() {
  const row = db.prepare('select count(*) as count from profile').get();
  if (row.count > 0) return false;

  const profile = readJson('profile.json');
  const dashboard = readJson('dashboard.json');
  const tasks = readJson('tasks.json');
  const writing = readJson('writing.json');
  const reading = readJson('reading.json');
  const listening = readJson('listening.json');
  const speaking = readJson('speaking.json');
  const date = todayKey();
  const createdAt = now();

  const seed = db.transaction(() => {
    db.prepare(`
      insert into profile (id, student_name, target_score, exam_date, current_stage, daily_study_minutes, focus_areas, updated_at)
      values (1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      profile.studentName,
      profile.targetScore,
      profile.examDate,
      profile.currentStage,
      profile.dailyStudyMinutes,
      json(profile.focusAreas),
      createdAt,
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
      insert into vocabulary_stats (id, learned, target, today_new, today_review, updated_at)
      values (1, ?, ?, ?, ?, ?)
    `).run(
      dashboard.vocabulary.learned,
      dashboard.vocabulary.target,
      dashboard.vocabulary.todayNew,
      dashboard.vocabulary.todayReview,
      createdAt,
    );

    const insertTask = db.prepare(`
      insert into tasks (id, date, title, type, estimated_minutes, done, source, created_at, completed_at)
      values (?, ?, ?, ?, ?, ?, 'seed', ?, ?)
    `);
    for (const task of tasks.today) {
      insertTask.run(
        task.id,
        date,
        task.title,
        task.type,
        task.estimatedMinutes,
        task.done ? 1 : 0,
        createdAt,
        task.done ? createdAt : null,
      );
    }

    const insertWriting = db.prepare(`
      insert into writing_records (id, date, task, topic, essay, band, focus, feedback, criteria, top_fixes, rewritten_paragraph, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of writing.records) {
      insertWriting.run(record.id, record.date, record.task, record.topic, '', record.band, record.focus, record.feedback, null, null, null, createdAt);
    }

    const insertReading = db.prepare(`
      insert into reading_records (id, date, passage, score, question_types, mistakes, notes, mistake_causes, review_plan, vocabulary, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of reading.records) {
      insertReading.run(
        record.id,
        record.date,
        record.passage,
        record.score,
        json(record.questionTypes),
        record.mistakes ?? null,
        record.notes,
        null,
        null,
        null,
        createdAt,
      );
    }

    const insertListening = db.prepare(`
      insert into listening_records (id, date, section, score, mistakes, review, replay_plan, drills, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of listening.records) {
      insertListening.run(record.id, record.date, record.section, record.score, json(record.mistakes), record.review, null, null, createdAt);
    }

    const insertSpeaking = db.prepare(`
      insert into speaking_records (id, date, part, topic, prompt, answer, band, feedback, fluency, vocabulary, grammar, pronunciation_risks, next_drill, created_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const record of speaking.records) {
      insertSpeaking.run(record.id, record.date, record.part, record.topic, '', '', record.band ?? null, record.feedback, null, null, null, null, null, createdAt);
    }

    insertCoachEvent('today_advice', date, 'Seeded dashboard advice', { advice: dashboard.todayAdvice });
    insertCoachEvent('weekly_goal', date, tasks.weeklyGoal, { weeklyGoal: tasks.weeklyGoal });
  });

  seed();
  return true;
}

export function insertCoachEvent(type, date, summary, payload) {
  db.prepare(`
    insert into coach_events (type, date, summary, payload, created_at)
    values (?, ?, ?, ?, ?)
  `).run(type, date, summary, json(payload), now());
}

export function getProfile() {
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

export function updateFocusAreas(focusAreas) {
  db.prepare('update profile set focus_areas = ?, updated_at = ? where id = 1').run(json(focusAreas), now());
}

export function getLatestMock() {
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

export function getVocabulary() {
  const row = db.prepare('select * from vocabulary_stats where id = 1').get();
  return {
    learned: row.learned,
    target: row.target,
    todayNew: row.today_new,
    todayReview: row.today_review,
  };
}

export function getLatestEvent(type, fallback) {
  const row = db.prepare('select * from coach_events where type = ? order by created_at desc, id desc limit 1').get(type);
  if (!row) return fallback;
  return parseJson(row.payload, fallback);
}

export function getTodayTasks() {
  return db.prepare('select * from tasks where date = ? order by created_at, id').all(todayKey()).map(mapTask);
}

export function getRecentRecords() {
  return {
    writing: db.prepare('select * from writing_records order by date desc, created_at desc limit 12').all().map(mapWriting),
    reading: db.prepare('select * from reading_records order by date desc, created_at desc limit 12').all().map(mapReading),
    listening: db.prepare('select * from listening_records order by date desc, created_at desc limit 12').all().map(mapListening),
    speaking: db.prepare('select * from speaking_records order by date desc, created_at desc limit 12').all().map(mapSpeaking),
  };
}

export function getStats() {
  const writingRecords = db.prepare('select count(*) as count from writing_records').get().count;
  const readingRecords = db.prepare('select count(*) as count from reading_records').get().count;
  const listeningAnalyses = db.prepare('select count(*) as count from listening_records').get().count;
  const vocab = getVocabulary();
  return {
    writingRecords,
    readingRecords,
    listeningAnalyses,
    vocabularyProgress: Math.round((vocab.learned / Math.max(vocab.target, 1)) * 100),
  };
}

export function buildDashboard() {
  const tasks = getTodayTasks();
  const weeklyGoal = getLatestEvent('weekly_goal', { weeklyGoal: '' }).weeklyGoal;
  const todayAdvice = getLatestEvent('today_advice', { advice: [] }).advice;
  const records = getRecentRecords();
  return {
    profile: getProfile(),
    lastMock: getLatestMock(),
    todayAdvice,
    stats: getStats(),
    vocabulary: getVocabulary(),
    weeklyGoal,
    tasks,
    records,
    supervision: buildSupervision(tasks, weeklyGoal),
  };
}

function buildSupervision(tasks, weeklyGoal) {
  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const remaining = total - done;
  const plannedMinutes = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const completedMinutes = tasks.filter((task) => task.done).reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return {
    total,
    done,
    remaining,
    plannedMinutes,
    completedMinutes,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    weeklyGoal,
    status: remaining === 0 ? '今天任务已完成' : `还有 ${remaining} 个任务未完成`,
  };
}

function mapTask(row) {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    type: row.type,
    estimatedMinutes: row.estimated_minutes,
    done: Boolean(row.done),
    source: row.source,
    completedAt: row.completed_at,
  };
}

function mapWriting(row) {
  return {
    id: row.id,
    date: row.date,
    task: row.task,
    topic: row.topic,
    essay: row.essay,
    band: row.band,
    focus: row.focus,
    feedback: row.feedback,
    criteria: parseJson(row.criteria, null),
    topFixes: parseJson(row.top_fixes, []),
    rewrittenParagraph: row.rewritten_paragraph,
  };
}

function mapReading(row) {
  return {
    id: row.id,
    date: row.date,
    passage: row.passage,
    score: row.score,
    questionTypes: parseJson(row.question_types, []),
    mistakes: row.mistakes,
    notes: row.notes,
    mistakeCauses: parseJson(row.mistake_causes, []),
    reviewPlan: parseJson(row.review_plan, []),
    vocabulary: parseJson(row.vocabulary, []),
  };
}

function mapListening(row) {
  return {
    id: row.id,
    date: row.date,
    section: row.section,
    score: row.score,
    mistakes: parseJson(row.mistakes, []),
    review: row.review,
    replayPlan: parseJson(row.replay_plan, []),
    drills: parseJson(row.drills, []),
  };
}

function mapSpeaking(row) {
  return {
    id: row.id,
    date: row.date,
    part: row.part,
    topic: row.topic,
    prompt: row.prompt,
    answer: row.answer,
    band: row.band,
    feedback: row.feedback,
    fluency: row.fluency,
    vocabulary: row.vocabulary,
    grammar: row.grammar,
    pronunciationRisks: row.pronunciation_risks,
    nextDrill: row.next_drill,
  };
}

export function initializeDatabase() {
  migrate();
  return seedIfNeeded();
}
