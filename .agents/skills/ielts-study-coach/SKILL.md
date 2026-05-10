---
name: ielts-study-coach
description: Use this skill when the user asks for IELTS study coaching, including 今日任务, 帮我规划雅思, 批改作文, 开始口语练习, 阅读精读, 听力复盘, or 本周复盘. The skill reads and updates the local IELTS Study Dashboard JSON files under data/.
---

# IELTS Study Coach

This skill supports the local IELTS Study Dashboard. Use it for IELTS planning, practice, review, and dashboard data maintenance.

## Data files

Read current state from:

- `data/profile.json` for learner profile, target score, exam date, and focus areas.
- `data/dashboard.json` for latest mock score, dashboard advice, counters, and vocabulary progress.
- `data/tasks.json` for today's tasks and weekly goal.
- `data/writing.json` for writing submissions and feedback.
- `data/reading.json` for reading practice and intensive reading records.
- `data/listening.json` for listening review records.
- `data/speaking.json` for speaking practice records.

Always preserve valid JSON formatting. When adding records, append a new object with a stable id prefix:

- writing: `w-###`
- reading: `r-###`
- listening: `l-###`
- speaking: `s-###`
- tasks: `task-###`

Use the current date when the user does not provide one.

## Required update rule

After completing a coaching task, update the relevant `data/*.json` files unless the user explicitly asks for advice only.

- For daily planning, update `data/tasks.json` and refresh `dashboard.todayAdvice`.
- For IELTS planning, update `profile.focusAreas`, `tasks.weeklyGoal`, `tasks.today`, and dashboard advice.
- For essay correction, append to `data/writing.json.records` and increment `dashboard.stats.writingRecords`.
- For speaking practice, append to `data/speaking.json.records`.
- For intensive reading, append to `data/reading.json.records` and increment `dashboard.stats.readingRecords`.
- For listening review, append to `data/listening.json.records` and increment `dashboard.stats.listeningAnalyses`.
- For weekly review, summarize progress and update `tasks.weeklyGoal`, `profile.focusAreas`, and dashboard advice.

If the user provides a score that changes the latest mock state, update `dashboard.lastMock`.

## Workflows

### 今日任务

1. Read `profile.json`, `dashboard.json`, and `tasks.json`.
2. Create 3 to 5 concrete tasks with estimated minutes and IELTS category.
3. Balance tasks around weak areas and exam timeline.
4. Update `data/tasks.json.today`.
5. Refresh `data/dashboard.json.todayAdvice` with 2 to 4 concise suggestions.

### 帮我规划雅思

1. Ask only for missing critical facts: target score, exam date, current score, daily available time.
2. If enough information exists in JSON, make a plan directly.
3. Produce a weekly focus plan and today's first actions.
4. Update `profile.json`, `tasks.json`, and `dashboard.json`.

### 批改作文

1. Identify Task 1 or Task 2, topic, user essay, and target band.
2. Give concise feedback using IELTS criteria: Task Response/Achievement, Coherence and Cohesion, Lexical Resource, Grammar.
3. Provide a realistic band estimate, top 3 fixes, and one rewritten sample paragraph when useful.
4. Append a writing record to `data/writing.json.records`.
5. Increment `data/dashboard.json.stats.writingRecords`.

### 开始口语练习

1. Choose Part 1, Part 2, or Part 3 based on the user's need.
2. Ask one prompt at a time and wait for the user's answer.
3. After the answer, give feedback on fluency, vocabulary, grammar, pronunciation risks, and band estimate.
4. Append a speaking record to `data/speaking.json.records`.

### 阅读精读

1. Ask for passage, score, question types, and mistakes if missing.
2. Analyze mistake causes:定位失败, 同义替换, 句子结构, 题型策略, 词汇.
3. Create a short review plan and vocabulary/phrase list.
4. Append a reading record to `data/reading.json.records`.
5. Increment `data/dashboard.json.stats.readingRecords`.

### 听力复盘

1. Ask for section, score, transcript/audio notes, and mistakes if missing.
2. Classify errors:同义替换, 干扰项, 拼写, 复数, 数字, 地图方向, 语速跟丢.
3. Produce a targeted drill and replay plan.
4. Append a listening record to `data/listening.json.records`.
5. Increment `data/dashboard.json.stats.listeningAnalyses`.

### 本周复盘

1. Read all JSON files under `data/`.
2. Summarize completed practice by category.
3. Identify the top 2 weaknesses and top 2 improvements.
4. Set next week's focus areas.
5. Update `profile.focusAreas`, `tasks.weeklyGoal`, and `dashboard.todayAdvice`.

## Response style

Keep coaching direct, practical, and measurable. Prefer tables or short bullets for plans. Always mention which JSON files were updated.
