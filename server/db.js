import { defaultProfileId, supabase } from './supabase.js';
import * as deepseek from './llm/deepseek.js';

export function initializeDatabase() {
  // Supabase schema and seed data are managed in the Supabase SQL Editor.
}

export async function buildDashboard() {
  const [
    profile,
    lastMock,
    vocabulary,
    tasks,
    records,
    todayAdvice,
    weeklyGoal,
  ] = await Promise.all([
    getProfile(),
    getLatestMock(),
    getVocabulary(),
    getTasks(),
    getRecords(),
    getSetting('todayAdvice', []),
    getSetting('weeklyGoal', ''),
  ]);

  const stats = {
    writingRecords: records.writing.length,
    readingRecords: records.reading.length,
    listeningAnalyses: records.listening.length,
    vocabularyProgress: Math.round((vocabulary.learned / Math.max(vocabulary.target, 1)) * 100),
  };
  const done = tasks.filter((task) => task.done).length;

  return {
    profile,
    lastMock,
    todayAdvice,
    stats,
    vocabulary,
    weeklyGoal,
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

export async function updateTaskDone(id, done) {
  const payload = {
    done,
    completed_at: done ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .eq('profile_id', defaultProfileId)
    .select('id');

  throwIfError(error);
  return data?.length ?? 0;
}

export async function insertWritingRecord(input) {
  const payload = {
    profile_id: defaultProfileId,
    date: today(),
    task: input.task || 'Task 2',
    topic: input.topic || 'Untitled writing task',
    band: toNumber(input.band, 6),
    focus: input.focus || '待复盘',
    feedback: input.feedback || '已新增写作记录，请补充批改反馈。',
  };
  const { data, error } = await supabase
    .from('writing_records')
    .insert(payload)
    .select('id, date, task, topic, band, focus, feedback')
    .single();

  throwIfError(error);
  return mapWriting(data);
}

export async function insertReadingRecord(input) {
  const payload = {
    profile_id: defaultProfileId,
    date: today(),
    passage: input.passage || 'Untitled passage',
    score: input.score || '0/40',
    question_types: normalizeList(input.questionTypes),
    mistakes: toNumber(input.mistakes, 0),
    notes: input.notes || '已新增阅读精读记录。',
  };
  const { data, error } = await supabase
    .from('reading_records')
    .insert(payload)
    .select('id, date, passage, score, question_types, mistakes, notes')
    .single();

  throwIfError(error);
  return mapReading(data);
}

export async function insertListeningRecord(input) {
  const payload = {
    profile_id: defaultProfileId,
    date: today(),
    section: input.section || 'Section 3',
    score: input.score || '0/10',
    mistakes: normalizeList(input.mistakes),
    review: input.review || '已新增听力复盘记录。',
  };
  const { data, error } = await supabase
    .from('listening_records')
    .insert(payload)
    .select('id, date, section, score, mistakes, review')
    .single();

  throwIfError(error);
  return mapListening(data);
}

export async function insertSpeakingRecord(input) {
  const payload = {
    profile_id: defaultProfileId,
    date: today(),
    part: input.part || 'Part 2',
    topic: input.topic || 'Untitled speaking prompt',
    band: input.band === '' || input.band == null ? null : toNumber(input.band, 6),
    feedback: input.feedback || '已新增口语练习记录。',
  };
  const { data, error } = await supabase
    .from('speaking_records')
    .insert(payload)
    .select('id, date, part, topic, band, feedback')
    .single();

  throwIfError(error);
  return mapSpeaking(data);
}

export async function updateVocabularyStats(input) {
  const current = await getVocabulary();
  const payload = {
    learned: current.learned + toNumber(input.learnedDelta, 0),
    today_new: toNumber(input.todayNew, current.todayNew),
    today_review: toNumber(input.todayReview, current.todayReview),
  };
  const { error } = await supabase
    .from('vocabulary_stats')
    .update(payload)
    .eq('profile_id', defaultProfileId);

  throwIfError(error);
}

export async function listPracticePrompts(skill) {
  let query = supabase
    .from('practice_prompts')
    .select('id, skill, task_type, title, prompt_text, instructions, cue_points, metadata, status, created_at')
    .eq('profile_id', defaultProfileId)
    .order('created_at', { ascending: false });

  if (skill) query = query.eq('skill', skill);

  const { data: prompts, error: promptError } = await query;
  throwIfError(promptError);

  const promptIds = (prompts ?? []).map((prompt) => prompt.id);
  let attempts = [];
  if (promptIds.length) {
    const { data, error } = await supabase
      .from('practice_attempts')
      .select('id, prompt_id, answer_text, band_score, feedback, criteria_scores, strengths, improvements, sample_answer, metadata, submitted_at, created_at')
      .in('prompt_id', promptIds)
      .order('created_at', { ascending: false });
    throwIfError(error);
    attempts = data ?? [];
  }

  const attemptsByPrompt = attempts.reduce((groups, attempt) => {
    groups[attempt.prompt_id] ??= [];
    groups[attempt.prompt_id].push(mapPracticeAttempt(attempt));
    return groups;
  }, {});

  return (prompts ?? []).map((prompt) => ({
    ...mapPracticePrompt(prompt),
    attempts: attemptsByPrompt[prompt.id] ?? [],
  }));
}

export async function createPracticePrompt(input) {
  const generated = generatePracticePrompt(input);
  const payload = {
    profile_id: defaultProfileId,
    skill: generated.skill,
    task_type: generated.taskType,
    title: generated.title,
    prompt_text: generated.promptText,
    instructions: generated.instructions,
    cue_points: generated.cuePoints,
    metadata: generated.metadata,
    status: 'generated',
  };

  const { data, error } = await supabase
    .from('practice_prompts')
    .insert(payload)
    .select('id, skill, task_type, title, prompt_text, instructions, cue_points, metadata, status, created_at')
    .single();

  throwIfError(error);
  return { ...mapPracticePrompt(data), attempts: [] };
}

export async function submitPracticeAttempt(promptId, input) {
  const { data: prompt, error: promptError } = await supabase
    .from('practice_prompts')
    .select('id, skill, task_type, title, prompt_text, metadata')
    .eq('id', promptId)
    .eq('profile_id', defaultProfileId)
    .single();
  throwIfError(promptError);

  const objectiveSkills = ['reading', 'listening'];
  if (objectiveSkills.includes(prompt.skill) && Object.keys(input.answers ?? {}).length === 0) {
    const error = new Error('answers are required.');
    error.status = 400;
    throw error;
  }

  const answerText = objectiveSkills.includes(prompt.skill)
    ? JSON.stringify(input.answers ?? {})
    : String(input.answerText ?? '').trim();
  if (!answerText) {
    const error = new Error('answerText is required.');
    error.status = 400;
    throw error;
  }

  const feedback = await generatePracticeFeedback(prompt, answerText, input);
  const payload = {
    profile_id: defaultProfileId,
    prompt_id: promptId,
    answer_text: answerText,
    band_score: feedback.bandScore,
    feedback: feedback.feedback,
    criteria_scores: feedback.criteriaScores,
    strengths: feedback.strengths,
    improvements: feedback.improvements,
    sample_answer: feedback.sampleAnswer,
    metadata: feedback.metadata,
  };

  const { data, error } = await supabase
    .from('practice_attempts')
    .insert(payload)
    .select('id, prompt_id, answer_text, band_score, feedback, criteria_scores, strengths, improvements, sample_answer, metadata, submitted_at, created_at')
    .single();
  throwIfError(error);

  const { error: updateError } = await supabase
    .from('practice_prompts')
    .update({ status: 'answered' })
    .eq('id', promptId)
    .eq('profile_id', defaultProfileId);
  throwIfError(updateError);

  return mapPracticeAttempt(data);
}

export async function submitPracticeAudioAttempt(promptId, input) {
  const { data: prompt, error: promptError } = await supabase
    .from('practice_prompts')
    .select('id, skill, task_type, title, prompt_text, metadata')
    .eq('id', promptId)
    .eq('profile_id', defaultProfileId)
    .single();
  throwIfError(promptError);

  if (prompt.skill !== 'speaking') {
    const error = new Error('submit-audio only supports speaking prompts.');
    error.status = 400;
    throw error;
  }
  if (!input.audio?.path) {
    const error = new Error('audio is required.');
    error.status = 400;
    throw error;
  }

  const feedback = await generateSpeakingAudioFeedback({
    questionIndex: toNumber(input.questionIndex, 0),
    questionText: input.questionText || prompt.prompt_text,
    taskType: input.taskType || prompt.task_type,
    audioPath: input.audio.path,
    durationSeconds: toNumber(input.durationSeconds, 0),
  });
  const payload = {
    profile_id: defaultProfileId,
    prompt_id: promptId,
    answer_text: feedback.transcript,
    band_score: feedback.bandScore,
    feedback: feedback.feedback,
    criteria_scores: feedback.criteriaScores,
    strengths: feedback.strengths,
    improvements: feedback.improvements,
    sample_answer: feedback.correctedText,
    metadata: feedback.metadata,
  };

  const { data, error } = await supabase
    .from('practice_attempts')
    .insert(payload)
    .select('id, prompt_id, answer_text, band_score, feedback, criteria_scores, strengths, improvements, sample_answer, metadata, submitted_at, created_at')
    .single();
  throwIfError(error);

  const { error: updateError } = await supabase
    .from('practice_prompts')
    .update({ status: 'answered' })
    .eq('id', promptId)
    .eq('profile_id', defaultProfileId);
  throwIfError(updateError);

  return mapPracticeAttempt(data);
}

export async function getDailyReview() {
  const { data, error } = await supabase
    .from('daily_reviews')
    .select('id, review_date, practice_count, average_band_score, strengths, weaknesses, tomorrow_advice, tomorrow_tasks, summary, source_attempt_ids, metadata, created_at, updated_at')
    .eq('profile_id', defaultProfileId)
    .eq('review_date', today())
    .maybeSingle();

  throwIfError(error);
  return data ? mapDailyReview(data) : createEmptyDailyReview();
}

export async function generateDailyReview() {
  const attempts = await getTodayPracticeAttempts();
  const review = await buildDailyReviewWithLlmFallback(attempts);
  const payload = {
    profile_id: defaultProfileId,
    review_date: today(),
    practice_count: review.practiceCount,
    average_band_score: review.averageBandScore,
    strengths: review.strengths,
    weaknesses: review.weaknesses,
    tomorrow_advice: review.tomorrowAdvice,
    tomorrow_tasks: review.tomorrowTasks,
    summary: review.summary,
    source_attempt_ids: review.sourceAttemptIds,
    metadata: review.metadata,
  };

  const { data, error } = await supabase
    .from('daily_reviews')
    .upsert(payload, { onConflict: 'profile_id,review_date' })
    .select('id, review_date, practice_count, average_band_score, strengths, weaknesses, tomorrow_advice, tomorrow_tasks, summary, source_attempt_ids, metadata, created_at, updated_at')
    .single();

  throwIfError(error);
  return mapDailyReview(data);
}

export async function syncDailyReviewTasks() {
  const review = await getDailyReview();
  const tomorrowTasks = review.tomorrowTasks ?? [];
  const taskDate = addDays(today(), 1);

  if (!tomorrowTasks.length) {
    return { insertedCount: 0, skippedCount: 0, taskDate, tasks: [] };
  }

  const normalizedTasks = tomorrowTasks.map((task) => ({
    profile_id: defaultProfileId,
    title: String(task.title ?? '').trim() || '明日学习任务',
    type: inferTaskType(task),
    estimated_minutes: toNumber(task.estimatedMinutes ?? task.estimated_minutes, 30),
    done: false,
    task_date: taskDate,
    completed_at: null,
  }));

  const titles = normalizedTasks.map((task) => task.title);
  const { data: existing, error: existingError } = await supabase
    .from('tasks')
    .select('title')
    .eq('profile_id', defaultProfileId)
    .eq('task_date', taskDate)
    .in('title', titles);
  throwIfError(existingError);

  const existingTitles = new Set((existing ?? []).map((task) => task.title));
  const tasksToInsert = normalizedTasks.filter((task) => !existingTitles.has(task.title));

  let inserted = [];
  if (tasksToInsert.length) {
    const { data, error } = await supabase
      .from('tasks')
      .insert(tasksToInsert)
      .select('id, title, type, estimated_minutes, done, task_date, completed_at');
    throwIfError(error);
    inserted = data ?? [];
  }

  return {
    insertedCount: inserted.length,
    skippedCount: normalizedTasks.length - inserted.length,
    taskDate,
    tasks: inserted.map(mapTask),
  };
}

async function getProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('student_name, target_score, exam_date, current_stage, daily_study_minutes, focus_areas')
    .eq('id', defaultProfileId)
    .single();

  throwIfError(error);
  return {
    studentName: data.student_name,
    targetScore: Number(data.target_score),
    examDate: data.exam_date,
    currentStage: data.current_stage,
    dailyStudyMinutes: data.daily_study_minutes,
    focusAreas: data.focus_areas ?? [],
  };
}

async function getLatestMock() {
  const { data, error } = await supabase
    .from('mock_scores')
    .select('date, overall, listening, reading, writing, speaking')
    .eq('profile_id', defaultProfileId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  throwIfError(error);
  return {
    date: data.date,
    overall: Number(data.overall),
    listening: Number(data.listening),
    reading: Number(data.reading),
    writing: Number(data.writing),
    speaking: Number(data.speaking),
  };
}

async function getVocabulary() {
  const { data, error } = await supabase
    .from('vocabulary_stats')
    .select('learned, target, today_new, today_review')
    .eq('profile_id', defaultProfileId)
    .single();

  throwIfError(error);
  return {
    learned: data.learned,
    target: data.target,
    todayNew: data.today_new,
    todayReview: data.today_review,
  };
}

async function getTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, type, estimated_minutes, done, task_date, completed_at')
    .eq('profile_id', defaultProfileId)
    .order('task_date', { ascending: false })
    .order('created_at', { ascending: true });

  throwIfError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    estimatedMinutes: row.estimated_minutes,
    done: Boolean(row.done),
    date: row.task_date,
    completedAt: row.completed_at,
  }));
}

async function getRecords() {
  const [writing, reading, listening, speaking] = await Promise.all([
    supabase
      .from('writing_records')
      .select('id, date, task, topic, band, focus, feedback')
      .eq('profile_id', defaultProfileId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('reading_records')
      .select('id, date, passage, score, question_types, mistakes, notes')
      .eq('profile_id', defaultProfileId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('listening_records')
      .select('id, date, section, score, mistakes, review')
      .eq('profile_id', defaultProfileId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('speaking_records')
      .select('id, date, part, topic, band, feedback')
      .eq('profile_id', defaultProfileId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  throwIfError(writing.error);
  throwIfError(reading.error);
  throwIfError(listening.error);
  throwIfError(speaking.error);

  return {
    writing: (writing.data ?? []).map(mapWriting),
    reading: (reading.data ?? []).map(mapReading),
    listening: (listening.data ?? []).map(mapListening),
    speaking: (speaking.data ?? []).map(mapSpeaking),
  };
}

async function getSetting(key, fallback) {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('profile_id', defaultProfileId)
    .eq('key', key)
    .maybeSingle();

  throwIfError(error);
  return data?.value ?? fallback;
}

function mapWriting(row) {
  return {
    id: row.id,
    date: row.date,
    task: row.task,
    topic: row.topic,
    band: Number(row.band),
    focus: row.focus,
    feedback: row.feedback,
  };
}

function mapReading(row) {
  return {
    id: row.id,
    date: row.date,
    passage: row.passage,
    score: row.score,
    questionTypes: row.question_types ?? [],
    mistakes: row.mistakes,
    notes: row.notes,
  };
}

function mapListening(row) {
  return {
    id: row.id,
    date: row.date,
    section: row.section,
    score: row.score,
    mistakes: row.mistakes ?? [],
    review: row.review,
  };
}

function mapSpeaking(row) {
  return {
    id: row.id,
    date: row.date,
    part: row.part,
    topic: row.topic,
    band: row.band == null ? null : Number(row.band),
    feedback: row.feedback,
  };
}

function mapPracticePrompt(row) {
  return {
    id: row.id,
    skill: row.skill,
    taskType: row.task_type,
    title: row.title,
    promptText: row.prompt_text,
    instructions: row.instructions,
    cuePoints: row.cue_points ?? [],
    metadata: row.metadata ?? {},
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapPracticeAttempt(row) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    answerText: row.answer_text,
    bandScore: row.band_score == null ? null : Number(row.band_score),
    feedback: row.feedback,
    criteriaScores: row.criteria_scores ?? {},
    strengths: row.strengths ?? [],
    improvements: row.improvements ?? [],
    sampleAnswer: row.sample_answer,
    metadata: row.metadata ?? {},
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  };
}

function mapDailyReview(row) {
  return {
    id: row.id,
    reviewDate: row.review_date,
    practiceCount: row.practice_count,
    averageBandScore: row.average_band_score == null ? null : Number(row.average_band_score),
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
    tomorrowAdvice: row.tomorrow_advice ?? [],
    tomorrowTasks: row.tomorrow_tasks ?? [],
    summary: row.summary,
    sourceAttemptIds: row.source_attempt_ids ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    estimatedMinutes: row.estimated_minutes,
    done: Boolean(row.done),
    date: row.task_date,
    completedAt: row.completed_at,
  };
}

function createEmptyDailyReview() {
  return {
    id: null,
    reviewDate: today(),
    practiceCount: 0,
    averageBandScore: null,
    strengths: [],
    weaknesses: [],
    tomorrowAdvice: [],
    tomorrowTasks: [],
    summary: '今天还没有生成复盘。完成练习并获得评分后，可以生成今日学习报告。',
    sourceAttemptIds: [],
    metadata: {},
    createdAt: null,
    updatedAt: null,
  };
}

async function getTodayPracticeAttempts() {
  const start = `${today()}T00:00:00.000Z`;
  const end = `${addDays(today(), 1)}T00:00:00.000Z`;
  const { data, error } = await supabase
    .from('practice_attempts')
    .select('id, answer_text, band_score, feedback, criteria_scores, strengths, improvements, metadata, submitted_at, created_at')
    .eq('profile_id', defaultProfileId)
    .gte('submitted_at', start)
    .lt('submitted_at', end)
    .order('submitted_at', { ascending: true });

  throwIfError(error);
  return data ?? [];
}

function buildDailyReview(attempts) {
  const bandScores = attempts
    .map((attempt) => Number(attempt.band_score))
    .filter((score) => Number.isFinite(score));
  const averageBandScore = bandScores.length
    ? Math.round((bandScores.reduce((sum, score) => sum + score, 0) / bandScores.length) * 10) / 10
    : null;
  const targeted = buildTargetedReviewSignals(attempts);
  const strengths = uniqueTextItems(topItems(attempts.flatMap((attempt) => attempt.strengths ?? []), [
    '今天已经完成了有效练习，保持了输出节奏。',
  ]));
  const weaknesses = uniqueTextItems([
    ...targeted.weaknesses,
    ...topItems(attempts.flatMap((attempt) => attempt.improvements ?? []), [
      '继续补充更具体的例子和细节。',
    ]),
  ]).slice(0, 4);
  const lowCriteria = findLowCriteria(attempts).filter((item) => !targeted.handledCriteria.has(item.name));
  const tomorrowAdvice = uniqueTextItems([
    averageBandScore == null
      ? '先完成一组 Writing Task 2 或 Speaking Part 2，再生成更准确的复盘。'
      : `明天优先把平均分从 ${averageBandScore.toFixed(1)} 往上推 0.5 分。`,
    ...targeted.advice,
    ...lowCriteria.slice(0, 2).map((item) => `重点关注 ${humanizeCriteria(item.name)}，当前规则估计约 ${item.score.toFixed(1)}。`),
    '练习后立即复盘 feedback，并把薄弱点改写成下一次的检查清单。',
  ]).slice(0, 4);
  const tomorrowTasks = uniqueTaskItems([
    ...targeted.tasks,
    { type: 'writing', title: '完成 1 道 Task 2 题目，写满 250 words 并检查立场句。', estimatedMinutes: 40 },
    { type: 'speaking', title: '完成 1 道 Part 2 计时回答，控制在 2 minutes 内。', estimatedMinutes: 15 },
    { type: 'review', title: '复盘今日薄弱点，整理 3 条可复用表达。', estimatedMinutes: 20 },
  ]).slice(0, 4);

  return {
    practiceCount: attempts.length,
    averageBandScore,
    strengths,
    weaknesses,
    tomorrowAdvice,
    tomorrowTasks,
    summary: attempts.length
      ? `今天完成 ${attempts.length} 次练习，平均分 ${averageBandScore?.toFixed(1) ?? '-'}。下一步应聚焦薄弱标准并提高答案展开质量。`
      : '今天还没有可分析的练习记录。完成练习并获得评分后再生成复盘。',
    sourceAttemptIds: attempts.map((attempt) => attempt.id),
    metadata: {
      generator: 'rule-template',
      feedbackProvider: 'local-rule',
      provider: 'local-rule',
      generatedAt: new Date().toISOString(),
      feedbackSamples: attempts.map((attempt) => attempt.feedback).filter(Boolean).slice(0, 3),
    },
  };
}

async function buildDailyReviewWithLlmFallback(attempts) {
  const localReview = buildDailyReview(attempts);
  const llmReview = await deepseek.generateDailyReview({
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      bandScore: attempt.band_score,
      feedback: attempt.feedback,
      criteriaScores: attempt.criteria_scores,
      strengths: attempt.strengths,
      improvements: attempt.improvements,
      metadata: attempt.metadata,
    })),
  });
  if (!llmReview) {
    return {
      ...localReview,
      metadata: withProviderMetadata(localReview.metadata, {
        provider: 'local-rule',
        evaluator: localReview.metadata?.generator ?? 'rule-template',
      }),
    };
  }

  return {
    ...localReview,
    practiceCount: toNumber(llmReview.practiceCount, localReview.practiceCount),
    averageBandScore: llmReview.averageBandScore == null ? localReview.averageBandScore : toNumber(llmReview.averageBandScore, localReview.averageBandScore),
    strengths: normalizeListWithFallback(llmReview.strengths, localReview.strengths),
    weaknesses: normalizeListWithFallback(llmReview.weaknesses, localReview.weaknesses),
    tomorrowAdvice: normalizeListWithFallback(llmReview.tomorrowAdvice, localReview.tomorrowAdvice),
    tomorrowTasks: normalizeTaskListWithFallback(llmReview.tomorrowTasks, localReview.tomorrowTasks),
    summary: String(llmReview.summary || localReview.summary),
    metadata: {
      ...localReview.metadata,
      ...(isPlainObject(llmReview.metadata) ? llmReview.metadata : {}),
      generator: 'deepseek',
      fallbackGenerator: 'rule-template',
      feedbackProvider: 'deepseek',
      provider: 'deepseek',
      model: deepseek.deepseekModel,
    },
  };
}

function topItems(items, fallback) {
  const counts = new Map();
  for (const item of items) {
    const key = String(item ?? '').trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([item]) => item)
    .slice(0, 4);
  return ranked.length ? ranked : fallback;
}

function buildTargetedReviewSignals(attempts) {
  const signals = {
    weaknesses: [],
    advice: [],
    tasks: [],
    handledCriteria: new Set(),
  };
  let lowestReadingCorrect = null;
  let lowestReadingTotal = 5;
  let shortestWritingWords = null;
  const shortSpeakingParts = new Map();

  for (const attempt of attempts) {
    const metadata = attempt.metadata ?? {};
    const criteria = attempt.criteria_scores ?? {};
    const bandScore = Number(attempt.band_score);
    const wordCount = Number(metadata.wordCount);
    const taskType = String(metadata.taskType ?? '');
    const readingCorrectCount = Number(criteria.readingAccuracy);
    const currentReadingTotal = Number(metadata.totalQuestions ?? 5);
    const listeningCorrectCount = Number(criteria.listeningAccuracy);
    const isReading = Number.isFinite(readingCorrectCount);
    const isListening = metadata.skill === 'listening' || Number.isFinite(listeningCorrectCount);
    const isSpeaking = Boolean(taskType);
    const isWriting = Number.isFinite(wordCount) && !isSpeaking && !isReading && !isListening;

    if (isReading && (readingCorrectCount <= 2 || bandScore <= 5.5)) {
      signals.handledCriteria.add('readingAccuracy');
      signals.handledCriteria.add('keywordMatching');
      signals.handledCriteria.add('inferenceControl');
      lowestReadingCorrect = lowestReadingCorrect == null ? readingCorrectCount : Math.min(lowestReadingCorrect, readingCorrectCount);
      lowestReadingTotal = Number.isFinite(currentReadingTotal) ? currentReadingTotal : 5;
    }

    if (isWriting && wordCount < 250) {
      signals.handledCriteria.add('taskResponse');
      shortestWritingWords = shortestWritingWords == null ? wordCount : Math.min(shortestWritingWords, wordCount);
    }

    const speakingTarget = taskType === 'Part 1' ? 80 : taskType === 'Part 3' ? 150 : taskType === 'Part 2' ? 120 : null;
    if (isSpeaking && speakingTarget && wordCount < speakingTarget) {
      signals.handledCriteria.add('fluencyCoherence');
      signals.handledCriteria.add('responseDevelopment');
      const current = shortSpeakingParts.get(taskType);
      shortSpeakingParts.set(taskType, current == null ? wordCount : Math.min(current, wordCount));
    }
  }

  if (lowestReadingCorrect != null) {
    signals.weaknesses.push(`Reading Multiple Choice 正确率偏低：最低 ${lowestReadingCorrect}/${lowestReadingTotal}，需要回到原文定位证据。`);
    signals.advice.push('阅读复盘先标出每道错题的定位词，再对照原文找到答案句。');
    signals.advice.push('整理干扰选项：记录它是偷换概念、范围过大，还是与原文信息相反。');
    signals.tasks.push({ type: 'reading', title: '复盘阅读错题定位词，对照原文找答案句并总结干扰选项。', estimatedMinutes: 30 });
  }

  if (shortestWritingWords != null) {
    signals.weaknesses.push(`Writing Task 2 字数不足：最低约 ${shortestWritingWords} words，优先写满 250 words。`);
    signals.advice.push('写作先补足 250 words：每个主体段至少加入一个解释句和一个具体例子。');
    signals.tasks.push({ type: 'writing', title: '重写 1 篇 Task 2，先写满 250 words，再检查立场句和例子。', estimatedMinutes: 45 });
  }

  for (const [part, shortestWords] of shortSpeakingParts.entries()) {
    signals.weaknesses.push(`Speaking ${part} 回答偏短：最低约 ${shortestWords} words，需要扩展原因、例子和细节。`);
    signals.advice.push(`口语 ${part} 练习用 answer-reason-example-detail 结构，把每个回答扩展到更完整。`);
    signals.tasks.push({ type: 'speaking', title: `完成 1 组 Speaking ${part}，每题补充原因、例子和细节。`, estimatedMinutes: 20 });
  }

  signals.weaknesses = uniqueTextItems(signals.weaknesses);
  signals.advice = uniqueTextItems(signals.advice);
  signals.tasks = uniqueTaskItems(signals.tasks);
  return signals;
}

function findLowCriteria(attempts) {
  const values = new Map();
  for (const attempt of attempts) {
    for (const [name, score] of Object.entries(attempt.criteria_scores ?? {})) {
      const numeric = Number(score);
      if (!Number.isFinite(numeric)) continue;
      if (name === 'readingAccuracy') continue;
      const current = values.get(name);
      if (!current || numeric < current.score) values.set(name, { name, score: numeric });
    }
  }
  return [...values.values()].sort((a, b) => a.score - b.score);
}

function uniqueTextItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const text = String(item ?? '').trim();
    const key = text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/readingaccuracy/g, 'reading accuracy');
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function uniqueTaskItems(tasks) {
  const seen = new Set();
  const result = [];
  for (const task of tasks) {
    const title = String(task.title ?? '').trim();
    const type = String(task.type ?? inferTaskType(task));
    const key = `${type}:${title.toLowerCase().replace(/\s+/g, ' ')}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    result.push({
      type,
      title,
      estimatedMinutes: toNumber(task.estimatedMinutes ?? task.estimated_minutes, 30),
    });
  }
  return result;
}

function humanizeCriteria(name) {
  const labels = {
    taskResponse: 'Task Response',
    coherenceCohesion: 'Coherence and Cohesion',
    lexicalResource: 'Lexical Resource',
    grammarRangeAccuracy: 'Grammar Range and Accuracy',
    fluencyCoherence: 'Fluency and Coherence',
    responseDevelopment: 'Response Development',
    multipleChoiceStrategy: 'Multiple Choice Strategy',
    keywordMatching: 'Keyword Matching',
    inferenceControl: 'Inference Control',
    listeningAccuracy: 'Listening Accuracy',
    keywordRecognition: 'Keyword Recognition',
    distractorControl: 'Distractor Control',
    gapFillPrecision: 'Gap Fill Precision',
  };
  return labels[name] ?? name;
}

function inferTaskType(task) {
  const text = `${task.type ?? ''} ${task.title ?? ''}`.toLowerCase();
  if (text.includes('task 2') || text.includes('writing') || text.includes('写作')) return 'writing';
  if (text.includes('part 2') || text.includes('speaking') || text.includes('口语')) return 'speaking';
  if (text.includes('review') || text.includes('复盘')) return 'reading';
  if (text.includes('reading') || text.includes('阅读')) return 'reading';
  if (text.includes('listening') || text.includes('听力')) return 'listening';
  if (text.includes('vocabulary') || text.includes('词汇')) return 'vocabulary';
  return 'reading';
}

function generatePracticePrompt(input) {
  const skill = ['speaking', 'reading', 'listening'].includes(input.skill) ? input.skill : 'writing';
  if (skill === 'speaking') return generateSpeakingPrompt(input.taskType);
  if (skill === 'reading') return generateReadingMultipleChoicePrompt();
  if (skill === 'listening') return generateListeningPrompt();
  return generateWritingTask2Prompt();
}

function generateWritingTask2Prompt() {
  const prompts = [
    {
      title: 'Technology and Education',
      promptText:
        'Some people believe that online learning will eventually replace traditional classroom learning. To what extent do you agree or disagree?',
    },
    {
      title: 'Cities and Transport',
      promptText:
        'In many cities, traffic congestion is becoming a serious problem. Some people think governments should invest more in public transport instead of building new roads. Discuss both views and give your own opinion.',
    },
    {
      title: 'Work and Lifestyle',
      promptText:
        'Some people think that a four-day working week would improve people’s quality of life. Others believe it would create problems for businesses. Discuss both views and give your own opinion.',
    },
    {
      title: 'Environment',
      promptText:
        'Many people say that individuals cannot solve environmental problems and that only governments and large companies can make a difference. To what extent do you agree or disagree?',
    },
  ];
  const item = pick(prompts);
  return {
    skill: 'writing',
    taskType: 'Task 2',
    title: item.title,
    promptText: item.promptText,
    instructions: 'Write at least 250 words. Spend about 40 minutes. Use a clear position and develop your ideas with examples.',
    cuePoints: [],
    metadata: { generator: 'local-template', version: 1 },
  };
}

function generateSpeakingPrompt(taskType = 'Part 2') {
  if (taskType === 'Part 1') return generateSpeakingPart1Prompt();
  if (taskType === 'Part 3') return generateSpeakingPart3Prompt();
  return generateSpeakingPart2Prompt();
}

function generateSpeakingPart1Prompt() {
  const topics = [
    {
      title: 'Work and Study',
      questions: [
        'Do you work or are you a student?',
        'What do you like most about your work or studies?',
        'Do you prefer studying in the morning or in the evening?',
        'What subject or skill would you like to learn in the future?',
      ],
    },
    {
      title: 'Hometown',
      questions: [
        'Where is your hometown?',
        'What do people usually do for fun there?',
        'Has your hometown changed much in recent years?',
        'Would you like to live there in the future?',
      ],
    },
    {
      title: 'Daily Routine',
      questions: [
        'What is your daily routine like?',
        'Which part of the day do you enjoy most?',
        'Do you like to plan your day in advance?',
        'What would you like to change about your routine?',
      ],
    },
  ];
  const item = pick(topics);
  return {
    skill: 'speaking',
    taskType: 'Part 1',
    title: item.title,
    promptText: item.questions.join('\n'),
    instructions: 'Answer each question briefly and naturally. Give one or two details for each answer.',
    cuePoints: item.questions,
    metadata: { generator: 'local-template', version: 1, questionCount: item.questions.length },
  };
}

function generateSpeakingPart2Prompt() {
  const prompts = [
    {
      title: 'A Useful Skill',
      promptText: 'Describe a useful skill you learned.',
      cuePoints: ['what the skill is', 'when and where you learned it', 'how you use it', 'and explain why it is useful'],
    },
    {
      title: 'A Quiet Place',
      promptText: 'Describe a quiet place where you like to study or work.',
      cuePoints: ['where it is', 'what it looks like', 'what you do there', 'and explain why you like this place'],
    },
    {
      title: 'An Interesting Conversation',
      promptText: 'Describe an interesting conversation you had with someone.',
      cuePoints: ['who you talked to', 'what you talked about', 'why it was interesting', 'and explain how you felt after it'],
    },
    {
      title: 'A Goal',
      promptText: 'Describe a goal you would like to achieve in the future.',
      cuePoints: ['what the goal is', 'why you want to achieve it', 'what you need to do', 'and explain how this goal could change your life'],
    },
  ];
  const item = pick(prompts);
  return {
    skill: 'speaking',
    taskType: 'Part 2',
    title: item.title,
    promptText: item.promptText,
    instructions: 'You have one minute to prepare. Speak for one to two minutes. Try to answer all cue points naturally.',
    cuePoints: item.cuePoints,
    metadata: { generator: 'local-template', version: 1 },
  };
}

function generateSpeakingPart3Prompt() {
  const topics = [
    {
      title: 'Education and Technology',
      questions: [
        'How has technology changed the way people learn?',
        'Do you think online education can be as effective as classroom learning?',
        'What skills will students need most in the future?',
        'Should governments invest more in digital education?',
      ],
    },
    {
      title: 'Work and Society',
      questions: [
        'Why do some people prefer flexible working hours?',
        'How might remote work affect cities in the future?',
        'Do you think work-life balance is more important now than in the past?',
        'What role should companies play in supporting employees well-being?',
      ],
    },
    {
      title: 'Environment',
      questions: [
        'Why do many people find it difficult to live in an environmentally friendly way?',
        'What can schools do to teach children about environmental protection?',
        'Should individuals or governments be more responsible for solving environmental problems?',
        'How might cities become more sustainable in the future?',
      ],
    },
  ];
  const item = pick(topics);
  return {
    skill: 'speaking',
    taskType: 'Part 3',
    title: item.title,
    promptText: item.questions.join('\n'),
    instructions: 'Give extended answers. Explain causes, compare viewpoints, and support your opinions with examples.',
    cuePoints: item.questions,
    metadata: { generator: 'local-template', version: 1, questionCount: item.questions.length },
  };
}

function generateReadingMultipleChoicePrompt() {
  const passages = [
    {
      title: 'Urban Gardens',
      promptText:
        'In many large cities, unused spaces are being transformed into small urban gardens. These gardens can appear on rooftops, beside railway lines, or in empty lots between buildings. Supporters argue that such projects do more than simply add greenery to crowded neighbourhoods. They can lower local temperatures, absorb rainwater, and provide residents with a place to meet. In some districts, community gardens have also become informal classrooms where children learn about food production and environmental responsibility.\n\nHowever, urban gardens are not a simple solution to every city problem. Land in central areas is expensive, and temporary gardens may disappear when developers decide to build offices or apartments. Maintaining the spaces also requires regular volunteers, water supplies, and basic tools. Without strong local organisation, a garden can quickly become neglected. Some critics also point out that gardens sometimes increase the attractiveness of an area, which may raise rents and push out long-term residents.\n\nDespite these concerns, several city councils have started to include urban gardening in wider planning strategies. Rather than treating gardens as decorative extras, planners are using them as part of climate adaptation and public health policies. The most successful schemes tend to involve residents from the beginning, giving them responsibility for decisions about design, planting, and maintenance. This suggests that urban gardens work best when they are seen not only as environmental projects, but also as social ones.',
      questions: [
        {
          question: 'Where can urban gardens be found according to the passage?',
          options: ['Only in public parks', 'On rooftops and unused city spaces', 'Inside shopping centres', 'Mainly outside large cities'],
          answer: 'B',
          explanation: 'The passage mentions rooftops, railway lines, and empty lots between buildings.',
        },
        {
          question: 'What educational role can community gardens play?',
          options: ['They train professional architects', 'They replace school science lessons', 'They teach children about food and the environment', 'They provide online courses for residents'],
          answer: 'C',
          explanation: 'The passage says children can learn about food production and environmental responsibility.',
        },
        {
          question: 'Why might temporary gardens disappear?',
          options: ['Because residents dislike them', 'Because developers may build on the land', 'Because plants cannot grow in cities', 'Because councils ban volunteer work'],
          answer: 'B',
          explanation: 'The text states that developers may later build offices or apartments on the land.',
        },
        {
          question: 'What concern do critics raise about urban gardens?',
          options: ['They can make an area more expensive', 'They always reduce public health', 'They use no water or tools', 'They prevent children from learning'],
          answer: 'A',
          explanation: 'Critics note that gardens may raise rents and push out long-term residents.',
        },
        {
          question: 'What do the most successful schemes usually involve?',
          options: ['Decisions made only by developers', 'Residents participating from the beginning', 'No maintenance after planting', 'Gardens used only as decoration'],
          answer: 'B',
          explanation: 'The passage says successful schemes involve residents in design, planting, and maintenance decisions.',
        },
      ],
    },
    {
      title: 'The Value of Sleep',
      promptText:
        'For many years, sleep was often described as a passive state in which the body simply rested. Modern research has changed this view. Scientists now understand that sleep is an active process that supports memory, emotional balance, and physical repair. During deep sleep, the body releases hormones connected with growth and recovery. During other stages, the brain appears to organise information gathered during the day, strengthening some memories while allowing less useful details to fade.\n\nThe amount of sleep people need varies, but most adults function best with seven to nine hours per night. Problems begin when sleep is regularly reduced. A single short night may cause tiredness and poor concentration, but long-term sleep loss is linked to more serious effects, including weaker immunity and a higher risk of certain health conditions. Students and shift workers are especially vulnerable because their schedules often conflict with natural body rhythms.\n\nTechnology has made the problem more complicated. Bright screens can delay the release of melatonin, a hormone that helps prepare the body for sleep. At the same time, many people use phones late at night for entertainment or work, keeping the mind alert when it should be winding down. Experts therefore recommend simple habits such as keeping a regular bedtime, reducing screen use before sleep, and making the bedroom dark and quiet. These changes may seem small, but they can significantly improve sleep quality over time.',
      questions: [
        {
          question: 'How has modern research changed views of sleep?',
          options: ['It shows sleep is unnecessary', 'It describes sleep as an active process', 'It proves adults need less sleep', 'It says memory is not affected by sleep'],
          answer: 'B',
          explanation: 'The passage says scientists now understand sleep as an active process.',
        },
        {
          question: 'What happens during deep sleep?',
          options: ['The body releases recovery-related hormones', 'The brain stops all activity', 'People become more alert', 'Melatonin disappears completely'],
          answer: 'A',
          explanation: 'Deep sleep is linked with hormones connected to growth and recovery.',
        },
        {
          question: 'How much sleep do most adults need?',
          options: ['Three to four hours', 'Five to six hours', 'Seven to nine hours', 'More than twelve hours'],
          answer: 'C',
          explanation: 'The passage states most adults function best with seven to nine hours.',
        },
        {
          question: 'Why are students and shift workers vulnerable?',
          options: ['They never use technology', 'Their schedules may conflict with body rhythms', 'They need no concentration', 'They always sleep during the day'],
          answer: 'B',
          explanation: 'Their schedules often conflict with natural body rhythms.',
        },
        {
          question: 'What is one recommendation from experts?',
          options: ['Use brighter screens at night', 'Keep the bedroom dark and quiet', 'Change bedtime every day', 'Work in bed until tired'],
          answer: 'B',
          explanation: 'Experts recommend a dark, quiet bedroom and regular bedtime habits.',
        },
      ],
    },
  ];
  const item = pick(passages);
  return {
    skill: 'reading',
    taskType: 'Multiple Choice',
    title: item.title,
    promptText: item.promptText,
    instructions: 'Read the passage and choose the best answer for each question.',
    cuePoints: [],
    metadata: {
      generator: 'local-template',
      version: 1,
      questionType: 'Multiple Choice',
      questions: item.questions.map((question, index) => ({
        id: `q${index + 1}`,
        question: question.question,
        options: question.options,
      })),
      answers: item.questions.map((question) => question.answer),
      explanations: item.questions.map((question) => question.explanation),
    },
  };
}

function generateListeningPrompt() {
  const materials = [
    {
      section: 'Section 2',
      title: 'Community Learning Centre',
      transcript:
        'Good morning everyone, and welcome to the community learning centre. My name is Rachel, and I am going to give you a short introduction to the courses and facilities available this term. The centre is open from Monday to Saturday, but please note that the computer room closes early on Fridays because staff need time to update the software. Most evening classes begin at six thirty, although the photography course starts at seven because the tutor travels from another town.\n\nThis term we are offering several practical courses. The most popular one is basic digital skills, which is designed for people who want to manage emails, online forms, and video calls more confidently. We also have a course in garden design. It is not held indoors every week; students visit local parks twice during the programme to study planting choices and public spaces. For anyone interested in health, there is a nutrition workshop on Tuesday mornings. Participants will learn how to read food labels and plan affordable meals.\n\nIf you want to join a class, please register at reception before the end of this week. You do not need to pay the full fee immediately, but a small deposit is required to reserve a place. Learners who are over sixty or currently unemployed may apply for a reduced fee. Finally, remember that the centre library is available to all registered learners. It contains course books, audio materials, and a quiet study area at the back of the building.',
      questions: [
        {
          type: 'multiple-choice',
          question: 'Why does the computer room close early on Fridays?',
          options: ['A tutor uses it for photography', 'Staff update the software', 'The centre closes at lunchtime', 'A public meeting is held there'],
          correctAnswer: 'B',
          explanation: 'The speaker says the computer room closes early on Fridays because staff update the software.',
          locatorSentence: 'The computer room closes early on Fridays because staff need time to update the software.',
        },
        {
          type: 'gap-fill',
          question: 'Most evening classes begin at ____.',
          blank: 'time',
          correctAnswer: 'six thirty',
          explanation: 'The transcript states that most evening classes begin at six thirty.',
          locatorSentence: 'Most evening classes begin at six thirty.',
        },
        {
          type: 'multiple-choice',
          question: 'What is the digital skills course mainly for?',
          options: ['Building websites for companies', 'Using emails, online forms, and video calls', 'Repairing old computers', 'Learning advanced programming'],
          correctAnswer: 'B',
          explanation: 'The course helps people manage emails, online forms, and video calls.',
          locatorSentence: 'The course is designed for people who want to manage emails, online forms, and video calls more confidently.',
        },
        {
          type: 'gap-fill',
          question: 'Garden design students visit local ____ twice.',
          blank: 'places',
          correctAnswer: 'parks',
          explanation: 'Students visit local parks twice during the garden design programme.',
          locatorSentence: 'Students visit local parks twice during the programme.',
        },
        {
          type: 'multiple-choice',
          question: 'Who may apply for a reduced fee?',
          options: ['Anyone attending evening classes', 'People over sixty or currently unemployed', 'Only full-time college students', 'People who pay the full fee immediately'],
          correctAnswer: 'B',
          explanation: 'The speaker says learners over sixty or currently unemployed may apply for a reduced fee.',
          locatorSentence: 'Learners who are over sixty or currently unemployed may apply for a reduced fee.',
        },
      ],
    },
    {
      section: 'Section 3',
      title: 'Student Research Project',
      transcript:
        'Tutor: So, Maya and Leo, tell me how your research project on campus transport is progressing. Maya: We have finished the student survey, and the response rate was higher than expected. We received one hundred and eighty completed forms, which should be enough for a useful comparison between first-year students and final-year students. Leo: The strongest pattern so far is that cycling is popular with students who live within three kilometres of campus, but bus use increases sharply for those who live further away.\n\nTutor: That sounds promising. Did you ask students why they chose one form of transport over another? Maya: Yes. Convenience was the most common reason, but cost came second. Some students said they would cycle more often if there were safer routes near the main road. Leo: We also noticed that international students were less likely to own bikes, probably because many of them live here for only one academic year.\n\nTutor: You need to be careful with that interpretation. It may be true, but you should support it with interview data rather than just guessing. Maya: We have scheduled six short interviews for next week, so we can explore that point. Tutor: Good. For your final report, I suggest you include a map showing where transport problems are concentrated. A visual summary will make the results easier to understand. Leo: We can do that. We already have location notes from the survey comments, especially around the north entrance and the library car park.',
      questions: [
        {
          type: 'gap-fill',
          question: 'The students received ____ completed survey forms.',
          blank: 'number',
          correctAnswer: 'one hundred and eighty',
          explanation: 'Maya says they received one hundred and eighty completed forms.',
          locatorSentence: 'We received one hundred and eighty completed forms.',
        },
        {
          type: 'multiple-choice',
          question: 'Which students were most likely to cycle?',
          options: ['Students living within three kilometres of campus', 'Final-year students only', 'Students living near the library', 'International students with cars'],
          correctAnswer: 'A',
          explanation: 'Cycling was popular with students living within three kilometres of campus.',
          locatorSentence: 'Cycling is popular with students who live within three kilometres of campus.',
        },
        {
          type: 'multiple-choice',
          question: 'What was the most common reason for transport choice?',
          options: ['Safety', 'Convenience', 'Weather', 'Course timetable'],
          correctAnswer: 'B',
          explanation: 'Maya says convenience was the most common reason.',
          locatorSentence: 'Convenience was the most common reason.',
        },
        {
          type: 'gap-fill',
          question: 'The tutor says the bike ownership interpretation should be supported with ____ data.',
          blank: 'type of data',
          correctAnswer: 'interview',
          explanation: 'The tutor advises them to support the interpretation with interview data.',
          locatorSentence: 'You should support it with interview data rather than just guessing.',
        },
        {
          type: 'multiple-choice',
          question: 'What visual element does the tutor recommend for the final report?',
          options: ['A bar chart of survey ages', 'A map of transport problem areas', 'A photo of the campus entrance', 'A timetable of bus services'],
          correctAnswer: 'B',
          explanation: 'The tutor suggests including a map showing where transport problems are concentrated.',
          locatorSentence: 'I suggest you include a map showing where transport problems are concentrated.',
        },
      ],
    },
  ];
  const item = pick(materials);
  return {
    skill: 'listening',
    taskType: item.section,
    title: `${item.section}: ${item.title}`,
    promptText: item.transcript,
    instructions: 'Listen to the transcript using the play button, then answer the questions. The transcript is shown after submission.',
    cuePoints: [],
    metadata: {
      generator: 'local-template',
      version: 1,
      questionType: 'Mixed Multiple Choice and Gap Fill',
      section: item.section,
      questions: item.questions.map((question, index) => ({
        id: `q${index + 1}`,
        type: question.type,
        question: question.question,
        options: question.options ?? [],
        blank: question.blank ?? null,
      })),
      answers: item.questions.map((question) => question.correctAnswer),
      explanations: item.questions.map((question) => question.explanation),
      locatorSentences: item.questions.map((question) => question.locatorSentence),
    },
  };
}

async function generatePracticeFeedback(prompt, answerText, input = {}) {
  const localFeedback =
    prompt.skill === 'speaking'
      ? generateSpeakingFeedback(answerText, prompt.task_type)
      : prompt.skill === 'reading'
        ? generateReadingFeedback(prompt, input.answers ?? {})
        : prompt.skill === 'listening'
          ? generateListeningFeedback(prompt, input.answers ?? {})
          : generateWritingFeedback(answerText);

  const llmFeedback = await requestDeepSeekPracticeFeedback(prompt, answerText, input);
  return mergeFeedbackWithFallback(llmFeedback, localFeedback);
}

async function requestDeepSeekPracticeFeedback(prompt, answerText, input) {
  if (prompt.skill === 'speaking') {
    return deepseek.generateSpeakingFeedback({
      questionText: prompt.prompt_text,
      transcript: answerText,
      taskType: prompt.task_type,
    });
  }
  if (prompt.skill === 'reading') {
    const questions = prompt.metadata?.questions ?? [];
    return deepseek.generateReadingFeedback({
      passage: prompt.prompt_text,
      questions,
      userAnswers: questions.map((question) => input.answers?.[question.id] ?? ''),
      correctAnswers: prompt.metadata?.answers ?? [],
    });
  }
  if (prompt.skill === 'listening') {
    const questions = prompt.metadata?.questions ?? [];
    return deepseek.generateListeningFeedback({
      transcript: prompt.prompt_text,
      questions,
      userAnswers: questions.map((question) => input.answers?.[question.id] ?? ''),
      correctAnswers: prompt.metadata?.answers ?? [],
    });
  }
  return deepseek.generateWritingFeedback({
    prompt: prompt.prompt_text,
    answer: answerText,
  });
}

function generateWritingFeedback(answerText) {
  const words = countWords(answerText);
  const paragraphs = answerText.split(/\n\s*\n/).filter((part) => part.trim()).length;
  const hasPosition = /\b(i believe|i agree|i disagree|in my opinion|my view|i think)\b/i.test(answerText);
  const hasExamples = /\b(for example|for instance|such as)\b/i.test(answerText);
  const bandScore = clampBand(5 + (words >= 250 ? 0.8 : 0) + (paragraphs >= 3 ? 0.4 : 0) + (hasPosition ? 0.4 : 0) + (hasExamples ? 0.4 : 0));

  return {
    bandScore,
    feedback: `Rule-based estimate: this Task 2 response is around Band ${bandScore.toFixed(1)}. It has ${words} words and ${paragraphs} paragraph(s). Improve by making the position explicit, developing each main idea, and using precise examples.`,
    criteriaScores: {
      taskResponse: clampBand(bandScore + (hasPosition ? 0.2 : -0.3)),
      coherenceCohesion: clampBand(bandScore + (paragraphs >= 3 ? 0.2 : -0.4)),
      lexicalResource: bandScore,
      grammarRangeAccuracy: clampBand(bandScore - 0.1),
    },
    strengths: [
      words >= 250 ? 'Meets the IELTS Task 2 minimum length.' : 'Has a clear starting point for a full essay.',
      hasPosition ? 'Includes a recognizable position.' : 'The answer can be developed into a clear argument.',
    ],
    improvements: [
      words < 250 ? 'Write at least 250 words for Task 2.' : 'Make each body paragraph more specific.',
      hasExamples ? 'Connect examples more directly to the main claim.' : 'Add concrete examples to support each main idea.',
      paragraphs < 3 ? 'Use an introduction, two body paragraphs, and a conclusion.' : 'Use stronger topic sentences.',
    ],
    sampleAnswer: null,
    metadata: { evaluator: 'rule-template', feedbackProvider: 'local-rule', provider: 'local-rule', wordCount: words, paragraphCount: paragraphs },
  };
}

function generateSpeakingFeedback(answerText, taskType = 'Part 2') {
  const words = countWords(answerText);
  const hasPersonalDetail = /\b(i|my|me|we|our)\b/i.test(answerText);
  const hasReason = /\b(because|so|therefore|as a result|that is why)\b/i.test(answerText);
  const targetWords = taskType === 'Part 1' ? 80 : taskType === 'Part 3' ? 150 : 120;
  const hasDevelopment = words >= targetWords && hasReason;
  const bandScore = clampBand(5 + (words >= targetWords ? 0.8 : 0) + (hasPersonalDetail ? 0.3 : 0) + (hasReason ? 0.4 : 0));

  return {
    bandScore,
    feedback: `Rule-based estimate: this ${taskType} answer is around Band ${bandScore.toFixed(1)}. It contains ${words} words. Improve by extending answers, adding specific details, and explaining reasons naturally.`,
    criteriaScores: {
      fluencyCoherence: clampBand(bandScore + (words >= targetWords ? 0.2 : -0.4)),
      lexicalResource: bandScore,
      grammarRangeAccuracy: clampBand(bandScore - 0.1),
      responseDevelopment: clampBand(bandScore + (hasDevelopment ? 0.2 : -0.5)),
    },
    strengths: [
      hasPersonalDetail ? 'Uses personal detail, which helps Part 2 sound natural.' : 'The topic is answerable with a personal story.',
      hasReason ? 'Includes reasoning or explanation.' : 'Can be improved by explaining why the experience matters.',
    ],
    improvements: [
      words < targetWords ? `Develop the response further for ${taskType}.` : 'Add more precise descriptive vocabulary.',
      taskType === 'Part 3' ? 'Compare different viewpoints and add examples.' : 'Use a simple structure: answer, detail, reason, example.',
      'Record yourself later to check pauses and pronunciation.',
    ],
    sampleAnswer: null,
    metadata: { evaluator: 'rule-template', feedbackProvider: 'local-rule', provider: 'local-rule', wordCount: words, taskType },
  };
}

async function generateSpeakingAudioFeedback({ questionIndex, questionText, taskType, audioPath, durationSeconds }) {
  const mockAnswers = [
    `I think ${questionText.replace(/\?$/, '').toLowerCase()} is an interesting question because it connects with my daily life. For example, I can give a personal experience and explain the reason in more detail.`,
    `My answer is that it depends on the situation. In my experience, the most important point is to explain why it matters and support the idea with a clear example.`,
    `I would say this topic is quite common, but it can still be developed with specific details, reasons, and a short comparison with another situation.`,
  ];
  const transcript = mockAnswers[Math.abs(questionIndex) % mockAnswers.length];
  const correctedText = transcript
    .replace('I think', 'I would say')
    .replace('because it connects with my daily life', 'because it is closely connected to everyday life');
  const words = countWords(transcript);
  const hasReason = /\b(because|why|reason|for example|experience)\b/i.test(transcript);
  const durationBonus = durationSeconds >= 20 ? 0.3 : 0;
  const bandScore = clampBand(5.2 + (words >= 35 ? 0.4 : 0) + (hasReason ? 0.4 : 0) + durationBonus);
  const spokenFeedbackText = `Your mock speaking response is estimated at Band ${bandScore.toFixed(1)}. Keep the answer natural, add one clear reason, and include a specific example before you finish.`;
  const sentenceCorrections = [
    {
      original: transcript,
      corrected: correctedText,
      explanation: 'Use a slightly more formal opening and make the reason more precise.',
    },
  ];

  const localFeedback = {
    bandScore,
    transcript,
    correctedText,
    sentenceCorrections,
    spokenFeedbackText,
    feedback: spokenFeedbackText,
    criteriaScores: {
      fluencyCoherence: clampBand(bandScore + (durationSeconds >= 20 ? 0.2 : -0.3)),
      lexicalResource: bandScore,
      grammarRangeAccuracy: clampBand(bandScore - 0.1),
      responseDevelopment: clampBand(bandScore + (hasReason ? 0.2 : -0.4)),
    },
    strengths: [
      'Completed an individual speaking question with audio.',
      hasReason ? 'The response includes a reason or example.' : 'The answer can be expanded with a reason.',
    ],
    improvements: [
      durationSeconds < 20 ? 'Speak for longer and add one concrete example.' : 'Add more topic-specific vocabulary.',
      'Use answer, reason, example, and detail as the response structure.',
      'Replay the recording and check pauses, clarity, and sentence endings.',
    ],
    metadata: {
      evaluator: 'mock-audio-template',
      feedbackProvider: 'local-rule',
      provider: 'local-rule',
      questionIndex,
      questionText,
      audioPath,
      durationSeconds,
      transcript,
      correctedText,
      sentenceCorrections,
      spokenFeedbackText,
      wordCount: words,
      taskType,
    },
  };
  const llmFeedback = await deepseek.generateSpeakingFeedback({ questionText, transcript, taskType });
  const merged = mergeFeedbackWithFallback(llmFeedback, localFeedback);
  const corrected = String(llmFeedback?.correctedText || localFeedback.correctedText);
  const spokenFeedback = String(llmFeedback?.spokenFeedbackText || merged.feedback || localFeedback.spokenFeedbackText);
  const mergedSentenceCorrections = Array.isArray(llmFeedback?.sentenceCorrections)
    ? llmFeedback.sentenceCorrections
    : localFeedback.sentenceCorrections;

  return {
    ...merged,
    transcript: String(llmFeedback?.transcript || localFeedback.transcript),
    correctedText: corrected,
    sentenceCorrections: mergedSentenceCorrections,
    spokenFeedbackText: spokenFeedback,
    metadata: {
      ...localFeedback.metadata,
      ...(isPlainObject(merged.metadata) ? merged.metadata : {}),
      evaluator: llmFeedback ? 'deepseek' : localFeedback.metadata.evaluator,
      feedbackProvider: llmFeedback ? 'deepseek' : 'local-rule',
      provider: llmFeedback ? 'deepseek' : 'local-rule',
      ...(llmFeedback ? { model: deepseek.deepseekModel } : {}),
      questionIndex,
      questionText,
      audioPath,
      durationSeconds,
      transcript: String(llmFeedback?.transcript || localFeedback.transcript),
      correctedText: corrected,
      sentenceCorrections: mergedSentenceCorrections,
      spokenFeedbackText: spokenFeedback,
    },
  };
}

function generateReadingFeedback(prompt, answers) {
  const correctAnswers = prompt.metadata?.answers ?? [];
  const explanations = prompt.metadata?.explanations ?? [];
  const questions = prompt.metadata?.questions ?? [];
  const userAnswers = Array.isArray(answers)
    ? answers
    : questions.map((question) => answers[question.id] ?? answers[String(questions.indexOf(question))] ?? '');
  const details = questions.map((question, index) => {
    const selected = String(userAnswers[index] ?? '').toUpperCase();
    const correct = String(correctAnswers[index] ?? '').toUpperCase();
    return {
      questionId: question.id,
      question: question.question,
      selected,
      correct,
      isCorrect: selected === correct,
      explanation: explanations[index] ?? '',
    };
  });
  const correctCount = details.filter((item) => item.isCorrect).length;
  const bandByCorrect = [4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
  const bandScore = bandByCorrect[correctCount] ?? 4.5;
  const wrongItems = details.filter((item) => !item.isCorrect);

  return {
    bandScore,
    feedback: `Reading Multiple Choice score: ${correctCount}/5 correct. Estimated Band ${bandScore.toFixed(1)}. Review the explanations for missed questions and identify the keywords that led to each answer.`,
    criteriaScores: {
      readingAccuracy: correctCount,
      multipleChoiceStrategy: bandScore,
      keywordMatching: clampBand(bandScore - (wrongItems.length ? 0.3 : 0)),
      inferenceControl: clampBand(bandScore - (wrongItems.length >= 2 ? 0.5 : 0)),
    },
    strengths: [
      correctCount >= 4 ? 'Strong accuracy on this multiple choice set.' : 'Completed the full reading question set.',
      correctCount >= 3 ? 'Shows useful passage-level comprehension.' : 'Built a baseline for identifying weak question types.',
    ],
    improvements: wrongItems.length
      ? wrongItems.map((item) => `Review ${item.questionId.toUpperCase()}: ${item.explanation}`)
      : ['Maintain accuracy by checking every option against exact passage evidence.'],
    sampleAnswer: null,
    metadata: {
      evaluator: 'rule-template',
      feedbackProvider: 'local-rule',
      provider: 'local-rule',
      correctCount,
      totalQuestions: correctAnswers.length,
      answers: userAnswers,
      details,
    },
  };
}

function generateListeningFeedback(prompt, answers) {
  const correctAnswers = prompt.metadata?.answers ?? [];
  const explanations = prompt.metadata?.explanations ?? [];
  const locatorSentences = prompt.metadata?.locatorSentences ?? [];
  const questions = prompt.metadata?.questions ?? [];
  const userAnswers = questions.map((question) => answers[question.id] ?? '');
  const details = questions.map((question, index) => {
    const selected = String(userAnswers[index] ?? '').trim();
    const correct = String(correctAnswers[index] ?? '').trim();
    const isCorrect = question.type === 'gap-fill'
      ? normalizeAnswer(selected) === normalizeAnswer(correct)
      : selected.toUpperCase() === correct.toUpperCase();
    return {
      questionId: question.id,
      type: question.type,
      question: question.question,
      selected,
      correct,
      isCorrect,
      explanation: explanations[index] ?? '',
      locatorSentence: locatorSentences[index] ?? '',
    };
  });
  const correctCount = details.filter((item) => item.isCorrect).length;
  const bandByCorrect = [4.5, 5.0, 5.5, 6.0, 6.5, 7.0];
  const bandScore = bandByCorrect[correctCount] ?? 4.5;
  const wrongItems = details.filter((item) => !item.isCorrect);

  return {
    bandScore,
    feedback: `Listening ${prompt.task_type} score: ${correctCount}/5 correct. Estimated Band ${bandScore.toFixed(1)}. Review the locator sentences, then replay the transcript and shadow the key information.`,
    criteriaScores: {
      listeningAccuracy: correctCount,
      keywordRecognition: clampBand(bandScore - (wrongItems.length ? 0.3 : 0)),
      distractorControl: clampBand(bandScore - (wrongItems.length >= 2 ? 0.5 : 0)),
      gapFillPrecision: clampBand(bandScore - (details.some((item) => item.type === 'gap-fill' && !item.isCorrect) ? 0.4 : 0)),
    },
    strengths: [
      correctCount >= 4 ? 'Strong listening accuracy on this short set.' : 'Completed the full listening question set.',
      correctCount >= 3 ? 'Shows useful understanding of the main details.' : 'Built a baseline for locating missed information in the transcript.',
    ],
    improvements: wrongItems.length
      ? wrongItems.map((item) => `Review ${item.questionId.toUpperCase()}: ${item.locatorSentence || item.explanation}`)
      : ['Replay the audio once more and shadow the locator sentences to consolidate accuracy.'],
    sampleAnswer: null,
    metadata: {
      evaluator: 'rule-template',
      feedbackProvider: 'local-rule',
      provider: 'local-rule',
      skill: 'listening',
      correctCount,
      totalQuestions: correctAnswers.length,
      answers: userAnswers,
      details,
      transcript: prompt.prompt_text,
    },
  };
}

function mergeFeedbackWithFallback(llmFeedback, fallback) {
  if (!llmFeedback || !isPlainObject(llmFeedback)) {
    return {
      ...fallback,
      metadata: withProviderMetadata(fallback.metadata, {
        provider: 'local-rule',
        evaluator: fallback.metadata?.evaluator ?? 'rule-template',
      }),
    };
  }
  return {
    ...fallback,
    bandScore: toNumber(llmFeedback.bandScore, fallback.bandScore),
    feedback: String(llmFeedback.feedback || fallback.feedback),
    criteriaScores: isPlainObject(llmFeedback.criteriaScores) ? llmFeedback.criteriaScores : fallback.criteriaScores,
    strengths: normalizeListWithFallback(llmFeedback.strengths, fallback.strengths),
    improvements: normalizeListWithFallback(llmFeedback.improvements, fallback.improvements),
    sampleAnswer: llmFeedback.sampleAnswer ?? fallback.sampleAnswer,
    metadata: {
      ...(isPlainObject(fallback.metadata) ? fallback.metadata : {}),
      ...(isPlainObject(llmFeedback.metadata) ? llmFeedback.metadata : {}),
      evaluator: 'deepseek',
      feedbackProvider: 'deepseek',
      provider: 'deepseek',
      model: deepseek.deepseekModel,
      fallbackEvaluator: fallback.metadata?.evaluator ?? 'rule-template',
    },
  };
}

function withProviderMetadata(metadata, { provider, evaluator }) {
  return {
    ...(isPlainObject(metadata) ? metadata : {}),
    feedbackProvider: provider,
    provider,
    evaluator,
    ...(provider === 'deepseek' ? { model: deepseek.deepseekModel } : {}),
  };
}

function normalizeListWithFallback(value, fallback) {
  const list = normalizeList(value);
  return list.length ? list : fallback;
}

function normalizeTaskListWithFallback(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const tasks = value
    .map((task) => ({
      type: String(task?.type ?? inferTaskType(task)),
      title: String(task?.title ?? '').trim(),
      estimatedMinutes: toNumber(task?.estimatedMinutes ?? task?.estimated_minutes, 30),
    }))
    .filter((task) => task.title);
  return tasks.length ? uniqueTaskItems(tasks) : fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function countWords(value) {
  const matches = String(value).trim().match(/[\p{L}\p{N}']+/gu);
  return matches ? matches.length : 0;
}

function clampBand(value) {
  return Math.max(0, Math.min(9, Math.round(value * 2) / 2));
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function throwIfError(error) {
  if (error) throw error;
}
