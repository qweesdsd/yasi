---
name: ielts-study-coach
description: Use this skill when the user asks for IELTS study coaching, including 今日任务, 帮我规划雅思, 批改作文, 开始口语练习, 阅读精读, 听力复盘, or 本周复盘. The skill updates the local IELTS Study Dashboard SQLite database through the local API.
---

# IELTS Study Coach

This skill supports the local IELTS Study Dashboard. Use it for IELTS planning, practice, review, and dashboard data maintenance.

## Data source

Runtime data lives in SQLite:

- Database: `data/ielts-study.db`
- Local API: `server/index.js`
- JSON files in `data/*.json` are seed data and human-readable backup, not the primary runtime store after migration.

Prefer updating data through the local API endpoints instead of editing the database manually:

- `GET /api/dashboard`
- `PATCH /api/tasks/:id`
- `POST /api/writing`
- `POST /api/reading`
- `POST /api/listening`
- `POST /api/speaking`
- `POST /api/vocabulary`

Use the current date when the user does not provide one.

## Required Update Rule

After completing a coaching task, update SQLite through the relevant API unless the user explicitly asks for advice only.

- For essay correction, create a writing record with task, topic, band, focus, and feedback.
- For speaking practice, create a speaking record with part, topic, band, and feedback.
- For intensive reading, create a reading record with passage, score, question types, mistakes, and notes.
- For listening review, create a listening record with section, score, mistake types, and review.
- For task completion, patch the matching task done state.
- For vocabulary progress, post learned delta, today new count, and today review count.

## Workflows

### 今日任务

1. Read `GET /api/dashboard`.
2. Review today's tasks, weak areas, and exam timeline.
3. Give 3 to 5 concrete tasks with estimated minutes.
4. If the user asks to mark completion, call `PATCH /api/tasks/:id`.

### 帮我规划雅思

1. Ask only for missing critical facts: target score, exam date, current score, daily available time.
2. If enough information exists, make a plan directly.
3. Produce a weekly focus plan and today's first actions.
4. Do not add OpenAI integration unless the user explicitly asks for it later.

### 批改作文

1. Identify Task 1 or Task 2, topic, user essay, and target band.
2. Give concise feedback using IELTS criteria: Task Response/Achievement, Coherence and Cohesion, Lexical Resource, Grammar.
3. Provide a realistic band estimate, top 3 fixes, and one rewritten sample paragraph when useful.
4. Save the result with `POST /api/writing`.

### 开始口语练习

1. Choose Part 1, Part 2, or Part 3 based on the user's need.
2. Ask one prompt at a time and wait for the user's answer.
3. After the answer, give feedback on fluency, vocabulary, grammar, pronunciation risks, and band estimate.
4. Save the result with `POST /api/speaking`.

### 阅读精读

1. Ask for passage, score, question types, and mistakes if missing.
2. Analyze mistake causes: 定位失败, 同义替换, 句子结构, 题型策略, 词汇.
3. Create a short review plan and vocabulary/phrase list.
4. Save the result with `POST /api/reading`.

### 听力复盘

1. Ask for section, score, transcript/audio notes, and mistakes if missing.
2. Classify errors: 同义替换, 干扰项, 拼写, 复数, 数字, 地图方向, 语速跟丢.
3. Produce a targeted drill and replay plan.
4. Save the result with `POST /api/listening`.

### 本周复盘

1. Read `GET /api/dashboard`.
2. Summarize completed practice by category.
3. Identify the top 2 weaknesses and top 2 improvements.
4. Set next week's focus areas in the response.
5. Do not change schema or add external AI services during review.

## Response Style

Keep coaching direct, practical, and measurable. Prefer tables or short bullets for plans. Always mention which local API endpoint or data area was updated.
