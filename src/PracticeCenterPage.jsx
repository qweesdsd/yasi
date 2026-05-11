import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Headphones, Loader2, Mic2, Pause, PenLine, Play, RotateCcw, Sparkles } from 'lucide-react';

import {
  generateDailyReview,
  generatePracticePrompt,
  getDailyReview,
  getPracticePrompts,
  submitPracticeAttempt,
  submitSpeakingAudioAttempt,
  syncDailyReviewTasks,
} from './api.js';

const practiceTypes = [
  { id: 'writing', label: 'Writing', detail: 'Task 2', icon: PenLine, enabled: true },
  { id: 'speaking', label: 'Speaking', detail: 'Part 1 / 2 / 3', icon: Mic2, enabled: true },
  { id: 'reading', label: 'Reading', detail: 'Multiple Choice', icon: BookOpen, enabled: true },
  { id: 'listening', label: 'Listening', detail: 'Section 2 / Section 3', icon: Headphones, enabled: true },
];

const speakingParts = ['Part 1', 'Part 2', 'Part 3'];

const timerDefaults = {
  writing: 40 * 60,
  speaking: 2 * 60,
};

function PracticeCenterPage() {
  const [skill, setSkill] = useState('writing');
  const [speakingPart, setSpeakingPart] = useState('Part 2');
  const [prompts, setPrompts] = useState([]);
  const [activePromptId, setActivePromptId] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [objectiveAnswers, setObjectiveAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [dailyReview, setDailyReview] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(timerDefaults.writing);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    loadPrompts(skill);
    resetTimer(skill);
  }, [skill]);

  useEffect(() => {
    loadDailyReview();
  }, []);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const intervalId = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          setTimerRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [timerRunning]);

  const activePrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === activePromptId) ?? prompts[0] ?? null,
    [activePromptId, prompts],
  );
  const latestAttempt = activePrompt?.attempts?.[0] ?? null;
  const wordCount = countWords(answerText);
  const isWriting = skill === 'writing';
  const isReading = skill === 'reading';
  const isListening = skill === 'listening';
  const isObjective = isReading || isListening;

  async function loadPrompts(nextSkill) {
    setLoading(true);
    setMessage('');
    try {
      const data = await getPracticePrompts(nextSkill);
      setPrompts(data.prompts ?? []);
      setActivePromptId(data.prompts?.[0]?.id ?? '');
      setAnswerText('');
      setObjectiveAnswers({});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDailyReview() {
    try {
      const data = await getDailyReview();
      setDailyReview(data.review);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleGenerate() {
    setBusy('generate');
    setMessage('');
    setSyncMessage('');
    try {
      const taskType = skill === 'speaking' ? speakingPart : skill === 'reading' ? 'Multiple Choice' : skill === 'listening' ? 'Listening Practice' : 'Task 2';
      const data = await generatePracticePrompt({ skill, taskType });
      setPrompts((current) => [data.prompt, ...current]);
      setActivePromptId(data.prompt.id);
      setAnswerText('');
      setObjectiveAnswers({});
      resetTimer(skill);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!activePrompt) return;
    setBusy('submit');
    setMessage('');
    setSyncMessage('');
    try {
      const payload = isObjective ? { answers: objectiveAnswers } : { answerText };
      const data = await submitPracticeAttempt(activePrompt.id, payload);
      setPrompts((current) =>
        current.map((prompt) =>
          prompt.id === activePrompt.id
            ? { ...prompt, status: 'answered', attempts: [data.attempt, ...(prompt.attempts ?? [])] }
            : prompt,
        ),
      );
      setAnswerText('');
      setObjectiveAnswers({});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function handleSubmitSpeakingAudio({ questionIndex, questionText, taskType, audioBlob, durationSeconds }) {
    if (!activePrompt || !audioBlob) return;
    setBusy(`audio-${questionIndex}`);
    setMessage('');
    setSyncMessage('');
    try {
      const formData = new FormData();
      formData.append('questionIndex', String(questionIndex));
      formData.append('questionText', questionText);
      formData.append('taskType', taskType);
      formData.append('durationSeconds', String(durationSeconds ?? 0));
      formData.append('audio', audioBlob, `speaking-${activePrompt.id}-${questionIndex}.webm`);
      const data = await submitSpeakingAudioAttempt(activePrompt.id, formData);
      setPrompts((current) =>
        current.map((prompt) =>
          prompt.id === activePrompt.id
            ? { ...prompt, status: 'answered', attempts: [data.attempt, ...(prompt.attempts ?? [])] }
            : prompt,
        ),
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function handleGenerateDailyReview() {
    setBusy('daily-review');
    setMessage('');
    setSyncMessage('');
    try {
      const data = await generateDailyReview();
      setDailyReview(data.review);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function handleSyncTomorrowTasks() {
    setBusy('sync-tasks');
    setMessage('');
    setSyncMessage('');
    try {
      const result = await syncDailyReviewTasks();
      setSyncMessage(`同步成功：新增 ${result.insertedCount} 条，跳过重复 ${result.skippedCount} 条。`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  function resetTimer(nextSkill = skill) {
    setTimerRunning(false);
    setRemainingSeconds(timerDefaults[nextSkill] ?? timerDefaults.writing);
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="caption">Practice Center</p>
            <h2 className="text-xl font-semibold text-slate-950">题目生成 / 练习中心</h2>
            <p className="mt-2 text-sm text-slate-500">支持 Writing Task 2、Speaking Part 1 / Part 2 / Part 3、Reading 和 Listening。</p>
          </div>
          <button className="primary-button" type="button" onClick={handleGenerate} disabled={busy === 'generate'}>
            {busy === 'generate' ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            <span>{busy === 'generate' ? '生成中...' : '生成题目'}</span>
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {practiceTypes.map((item) => {
          const Icon = item.icon;
          const selected = skill === item.id;
          return (
            <button
              key={item.id}
              className={`rounded-lg border p-4 text-left transition ${
                selected ? 'border-slate-900 bg-white shadow-soft' : 'border-slate-200 bg-white hover:border-slate-300'
              } ${!item.enabled ? 'cursor-not-allowed opacity-55' : ''}`}
              type="button"
              disabled={!item.enabled}
              onClick={() => setSkill(item.id)}
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Icon size={17} />
                {item.label}
              </div>
              <div className="mt-2 text-xs text-slate-500">{item.detail}</div>
            </button>
          );
        })}
      </div>

      {skill === 'speaking' && (
        <div className="card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="caption">Speaking Mode</p>
              <h3 className="section-title">选择口语 Part</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {speakingParts.map((part) => (
                <button
                  key={part}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    speakingPart === part ? 'border-slate-900 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                  type="button"
                  onClick={() => setSpeakingPart(part)}
                >
                  {part}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {message && <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <DailyReviewCard
            review={dailyReview}
            busy={busy === 'daily-review'}
            syncBusy={busy === 'sync-tasks'}
            syncMessage={syncMessage}
            onGenerate={handleGenerateDailyReview}
            onSyncTasks={handleSyncTomorrowTasks}
          />

          {loading && <div className="card text-sm text-slate-500">正在载入历史题目...</div>}
          {!loading && !activePrompt && (
            <div className="card text-sm text-slate-500">还没有题目。点击“生成题目”开始练习。</div>
          )}
          {activePrompt && (
            <>
              <PromptCard prompt={activePrompt} hidePromptText={isListening} />
              {!isObjective && (
                <TimerPanel
                  skill={skill}
                  taskType={skill === 'speaking' ? activePrompt.taskType : 'Task 2'}
                  remainingSeconds={remainingSeconds}
                  running={timerRunning}
                  onStart={() => setTimerRunning(true)}
                  onPause={() => setTimerRunning(false)}
                  onReset={() => resetTimer(skill)}
                />
              )}
              {isReading ? (
                <ReadingPracticeForm
                  prompt={activePrompt}
                  answers={objectiveAnswers}
                  busy={busy === 'submit'}
                  latestAttempt={latestAttempt}
                  onAnswer={(questionId, value) => setObjectiveAnswers((current) => ({ ...current, [questionId]: value }))}
                  onSubmit={handleSubmit}
                />
              ) : isListening ? (
                <ListeningPracticeForm
                  prompt={activePrompt}
                  answers={objectiveAnswers}
                  busy={busy === 'submit'}
                  latestAttempt={latestAttempt}
                  onAnswer={(questionId, value) => setObjectiveAnswers((current) => ({ ...current, [questionId]: value }))}
                  onSubmit={handleSubmit}
                />
              ) : (
                <>
                  {skill === 'speaking' && (
                    <SpeakingAudioPractice
                      prompt={activePrompt}
                      attempts={activePrompt.attempts ?? []}
                      busy={busy}
                      onSubmitAudio={handleSubmitSpeakingAudio}
                    />
                  )}
                  <form className="form-card" onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <span className="field-label mb-0">{skill === 'speaking' ? '文字输入 fallback' : '输入你的作文答案'}</span>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {isWriting && <span>{wordCount} words</span>}
                        {isWriting && wordCount > 0 && wordCount < 250 && (
                          <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">Task 2 建议至少 250 words</span>
                        )}
                        {skill === 'speaking' && (
                          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">主流程优先使用录音提交</span>
                        )}
                      </div>
                    </div>
                    <textarea
                      className="field resize-y"
                      rows={skill === 'speaking' ? 7 : 11}
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      placeholder={skill === 'speaking' ? `无法录音时，用文字记录你的 ${activePrompt.taskType} 回答...` : 'Write your Task 2 essay here...'}
                    />
                    <button className="primary-button" type="submit" disabled={busy === 'submit' || !answerText.trim()}>
                      {busy === 'submit' ? <Loader2 className="animate-spin" size={17} /> : <PenLine size={17} />}
                      <span>{busy === 'submit' ? '提交中...' : '提交并获取反馈'}</span>
                    </button>
                  </form>
                </>
              )}
              {latestAttempt && (
                isReading
                  ? <ReadingResultCard attempt={latestAttempt} />
                  : isListening
                    ? <ListeningResultCard attempt={latestAttempt} />
                    : skill === 'speaking' && latestAttempt.metadata?.evaluator === 'mock-audio-template'
                      ? null
                      : <FeedbackCard attempt={latestAttempt} />
              )}
            </>
          )}
        </div>

        <HistoryList
          prompts={prompts}
          activePromptId={activePrompt?.id}
          onSelect={(promptId) => {
            setActivePromptId(promptId);
            setAnswerText('');
            setObjectiveAnswers({});
          }}
        />
      </div>
    </div>
  );
}

function DailyReviewCard({ review, busy, syncBusy, syncMessage, onGenerate, onSyncTasks }) {
  const canSync = Boolean(review?.tomorrowTasks?.length);

  return (
    <div className="card">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="caption">Daily Review</p>
          <h3 className="text-lg font-semibold text-slate-950">今日复盘 / 学习报告</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {review?.summary ?? '完成练习并获得评分后，可以生成今日学习分析。'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" type="button" onClick={onGenerate} disabled={busy || syncBusy}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            <span>{busy ? '生成中...' : '生成今日复盘'}</span>
          </button>
          <button className="primary-button" type="button" onClick={onSyncTasks} disabled={syncBusy || !canSync}>
            {syncBusy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            <span>{syncBusy ? '同步中...' : '加入明日任务'}</span>
          </button>
        </div>
      </div>

      {syncMessage && <p className="mt-3 text-sm text-emerald-700">{syncMessage}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="caption">今日练习次数</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">{review?.practiceCount ?? 0}</div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="caption">今日平均分</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">
            {review?.averageBandScore == null ? '-' : review.averageBandScore.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ReviewList title="今日优点" items={review?.strengths} emptyText="暂无优点分析" />
        <ReviewList title="今日薄弱点" items={review?.weaknesses} emptyText="暂无薄弱点分析" />
        <ReviewList title="明日建议" items={review?.tomorrowAdvice} emptyText="暂无明日建议" />
        <ReviewTaskList tasks={review?.tomorrowTasks} />
      </div>
    </div>
  );
}

function TimerPanel({ skill, taskType, remainingSeconds, running, onStart, onPause, onReset }) {
  const defaultMinutes = skill === 'speaking' ? 2 : 40;
  const progress = Math.max(0, Math.min(100, (remainingSeconds / (timerDefaults[skill] ?? timerDefaults.writing)) * 100));

  return (
    <div className="card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="caption">{skill === 'speaking' ? `Speaking ${taskType}` : 'Writing Task 2'} Timer</p>
          <div className="mt-1 text-3xl font-semibold text-slate-950">{formatTime(remainingSeconds)}</div>
          <p className="mt-1 text-sm text-slate-500">建议时长 {defaultMinutes} minutes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="secondary-button" type="button" onClick={onStart} disabled={running || remainingSeconds === 0}>
            <Play size={16} />
            <span>开始</span>
          </button>
          <button className="secondary-button" type="button" onClick={onPause} disabled={!running}>
            <Pause size={16} />
            <span>暂停</span>
          </button>
          <button className="secondary-button" type="button" onClick={onReset}>
            <RotateCcw size={16} />
            <span>重置</span>
          </button>
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function PromptCard({ prompt, hidePromptText = false }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="caption">{prompt.skill} · {prompt.taskType}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{prompt.title}</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{prompt.status}</span>
      </div>
      {hidePromptText ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Transcript 已隐藏。点击“播放听力”后完成题目，提交后可查看全文和定位句。
        </div>
      ) : (
        <p className="mt-4 whitespace-pre-line text-base leading-7 text-slate-800">{prompt.promptText}</p>
      )}
      {prompt.instructions && <p className="mt-3 text-sm leading-6 text-slate-600">{prompt.instructions}</p>}
      {prompt.cuePoints?.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {prompt.cuePoints.map((point) => <li key={point}>{point}</li>)}
        </ul>
      )}
    </div>
  );
}

function ReadingPracticeForm({ prompt, answers, busy, latestAttempt, onAnswer, onSubmit }) {
  const questions = prompt.metadata?.questions ?? [];
  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const complete = questions.length > 0 && answeredCount === questions.length;

  return (
    <form className="form-card" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="field-label mb-0">Reading Multiple Choice</span>
          <p className="mt-1 text-sm text-slate-500">选择每道题的最佳答案。提交后会显示正确率、解析和复盘建议。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          已完成 {answeredCount}/{questions.length}
        </span>
      </div>

      <div className="space-y-4">
        {questions.map((question, questionIndex) => (
          <div key={question.id} className="rounded-lg border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-950">
              {questionIndex + 1}. {question.question}
            </div>
            <div className="mt-3 grid gap-2">
              {(question.options ?? []).map((option, optionIndex) => {
                const optionKey = String.fromCharCode(65 + optionIndex);
                const checked = answers[question.id] === optionKey;
                return (
                  <label
                    key={optionKey}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                      checked ? 'border-slate-900 bg-slate-50 text-slate-950' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      className="mt-1"
                      type="radio"
                      name={question.id}
                      value={optionKey}
                      checked={checked}
                      onChange={() => onAnswer(question.id, optionKey)}
                    />
                    <span>
                      <span className="font-semibold">{optionKey}.</span> {option}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button className="primary-button" type="submit" disabled={busy || !complete}>
        {busy ? <Loader2 className="animate-spin" size={17} /> : <PenLine size={17} />}
        <span>{busy ? '提交中...' : '提交并查看解析'}</span>
      </button>
      {!complete && !latestAttempt && (
        <p className="text-sm text-slate-500">请先完成全部 {questions.length} 道选择题。</p>
      )}
    </form>
  );
}

function ReadingResultCard({ attempt }) {
  const details = attempt.metadata?.details ?? [];
  const totalQuestions = attempt.metadata?.totalQuestions ?? details.length;
  const correctCount = attempt.metadata?.correctCount ?? details.filter((item) => item.isCorrect).length;
  const wrongItems = details.filter((item) => !item.isCorrect);
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="card border-slate-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="caption">Reading Result</p>
          <h3 className="section-title">正确率 {accuracy}%</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {correctCount}/{totalQuestions} correct
          </span>
          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
            Band {attempt.bandScore?.toFixed?.(1) ?? '-'}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-700">{attempt.feedback}</p>

      <div className="mt-4">
        <div className="caption">错题解析</div>
        {wrongItems.length ? (
          <div className="mt-2 space-y-3">
            {wrongItems.map((item) => (
              <div key={item.questionId} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                <div className="font-semibold text-slate-950">{item.question}</div>
                <div className="mt-1">你的答案：{item.selected || '未作答'} · 正确答案：{item.correct}</div>
                <div className="mt-1 text-slate-600">{item.explanation}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">本次没有错题，继续保持逐项排除和原文定位。</p>
        )}
      </div>

      <FeedbackList title="建议" items={attempt.improvements} />
    </div>
  );
}

function ListeningPracticeForm({ prompt, answers, busy, latestAttempt, onAnswer, onSubmit }) {
  const questions = prompt.metadata?.questions ?? [];
  const answeredCount = questions.filter((question) => String(answers[question.id] ?? '').trim()).length;
  const complete = questions.length > 0 && answeredCount === questions.length;
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, [speechSupported, prompt.id]);

  function playTranscript(restart = false) {
    if (!speechSupported) return;
    if (restart) window.speechSynthesis.cancel();
    if (!restart && paused) {
      window.speechSynthesis.resume();
      setPaused(false);
      setSpeaking(true);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(prompt.promptText);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
    setPaused(false);
  }

  function pauseTranscript() {
    if (!speechSupported) return;
    window.speechSynthesis.pause();
    setPaused(true);
    setSpeaking(false);
  }

  return (
    <form className="form-card" onSubmit={onSubmit}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="field-label mb-0">Listening {prompt.taskType}</span>
          <p className="mt-1 text-sm text-slate-500">先听材料再答题。Transcript 会在提交后显示。</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          已完成 {answeredCount}/{questions.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="secondary-button" type="button" onClick={() => playTranscript(false)} disabled={!speechSupported || speaking}>
          <Play size={16} />
          <span>{paused ? '继续播放' : '播放听力'}</span>
        </button>
        <button className="secondary-button" type="button" onClick={pauseTranscript} disabled={!speechSupported || (!speaking && !paused)}>
          <Pause size={16} />
          <span>暂停</span>
        </button>
        <button className="secondary-button" type="button" onClick={() => playTranscript(true)} disabled={!speechSupported}>
          <RotateCcw size={16} />
          <span>重新播放</span>
        </button>
      </div>
      {!speechSupported && <p className="text-sm text-amber-700">当前浏览器不支持 SpeechSynthesis，请换用 Chrome / Edge 后重试。</p>}

      <ObjectiveQuestionList questions={questions} answers={answers} onAnswer={onAnswer} />

      <button className="primary-button" type="submit" disabled={busy || !complete}>
        {busy ? <Loader2 className="animate-spin" size={17} /> : <Headphones size={17} />}
        <span>{busy ? '提交中...' : '提交并查看解析'}</span>
      </button>
      {!complete && !latestAttempt && (
        <p className="text-sm text-slate-500">请先完成全部 {questions.length} 道听力题。</p>
      )}
    </form>
  );
}

function ObjectiveQuestionList({ questions, answers, onAnswer }) {
  return (
    <div className="space-y-4">
      {questions.map((question, questionIndex) => (
        <div key={question.id} className="rounded-lg border border-slate-200 p-4">
          <div className="text-sm font-semibold text-slate-950">
            {questionIndex + 1}. {question.question}
          </div>
          {question.type === 'gap-fill' ? (
            <input
              className="field mt-3"
              value={answers[question.id] ?? ''}
              onChange={(event) => onAnswer(question.id, event.target.value)}
              placeholder={`填写 ${question.blank ?? 'answer'}`}
            />
          ) : (
            <div className="mt-3 grid gap-2">
              {(question.options ?? []).map((option, optionIndex) => {
                const optionKey = String.fromCharCode(65 + optionIndex);
                const checked = answers[question.id] === optionKey;
                return (
                  <label
                    key={optionKey}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                      checked ? 'border-slate-900 bg-slate-50 text-slate-950' : 'border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <input
                      className="mt-1"
                      type="radio"
                      name={question.id}
                      value={optionKey}
                      checked={checked}
                      onChange={() => onAnswer(question.id, optionKey)}
                    />
                    <span>
                      <span className="font-semibold">{optionKey}.</span> {option}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ListeningResultCard({ attempt }) {
  const details = attempt.metadata?.details ?? [];
  const totalQuestions = attempt.metadata?.totalQuestions ?? details.length;
  const correctCount = attempt.metadata?.correctCount ?? details.filter((item) => item.isCorrect).length;
  const wrongItems = details.filter((item) => !item.isCorrect);
  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return (
    <div className="card border-slate-300">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="caption">Listening Result</p>
          <h3 className="section-title">正确率 {accuracy}%</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {correctCount}/{totalQuestions} correct
          </span>
          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
            Band {attempt.bandScore?.toFixed?.(1) ?? '-'}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-700">{attempt.feedback}</p>

      <div className="mt-4">
        <div className="caption">逐题答案</div>
        <div className="mt-2 space-y-3">
          {details.map((item) => (
            <div key={item.questionId} className={`rounded-lg p-3 text-sm leading-6 ${item.isCorrect ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700'}`}>
              <div className="font-semibold">{item.question}</div>
              <div className="mt-1">你的答案：{item.selected || '未作答'} · 正确答案：{item.correct}</div>
              <div className="mt-1">{item.explanation}</div>
              {item.locatorSentence && <div className="mt-1 text-slate-600">定位句：{item.locatorSentence}</div>}
            </div>
          ))}
        </div>
      </div>

      {wrongItems.length > 0 && <FeedbackList title="错题解析" items={wrongItems.map((item) => `${item.questionId.toUpperCase()}: ${item.explanation}`)} />}
      <FeedbackList title="学习建议" items={attempt.improvements} />

      <div className="mt-4">
        <div className="caption">Transcript</div>
        <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {attempt.metadata?.transcript ?? ''}
        </p>
      </div>
    </div>
  );
}

function SpeakingAudioPractice({ prompt, attempts, busy, onSubmitAudio }) {
  const questions = getSpeakingQuestions(prompt);
  const [activeRecordingIndex, setActiveRecordingIndex] = useState(null);

  return (
    <div className="space-y-3">
      <div className="card">
        <p className="caption">Speaking Audio</p>
        <h3 className="section-title">录音提交</h3>
        <p className="mt-2 text-sm text-slate-500">
          {prompt.taskType === 'Part 2'
            ? 'Part 2 使用一个长回答录音窗口。'
            : `${prompt.taskType} 已拆成 ${questions.length} 个问题，每题独立录音和提交。`}
        </p>
      </div>
      {questions.map((question) => (
        <SpeakingRecordingCard
          key={`${prompt.id}-${question.index}`}
          prompt={prompt}
          question={question}
          attempt={findSpeakingQuestionAttempt(attempts, question.index)}
          busy={busy === `audio-${question.index}`}
          activeRecordingIndex={activeRecordingIndex}
          onRecordingStart={setActiveRecordingIndex}
          onRecordingEnd={() => setActiveRecordingIndex(null)}
          onSubmitAudio={onSubmitAudio}
        />
      ))}
    </div>
  );
}

function SpeakingRecordingCard({ prompt, question, attempt, busy, activeRecordingIndex, onRecordingStart, onRecordingEnd, onSubmitAudio }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const ignoreStopRef = useRef(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordingStatus, setRecordingStatus] = useState('idle');
  const [recordingError, setRecordingError] = useState('');
  const [hidePreviousAttempt, setHidePreviousAttempt] = useState(false);
  const mediaSupported = typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && 'MediaRecorder' in window;
  const displayAttempt = hidePreviousAttempt ? null : attempt;
  const recording = recordingStatus === 'recording';
  const completed = recordingStatus === 'completed';
  const anotherQuestionRecording = activeRecordingIndex != null && activeRecordingIndex !== question.index;
  const statusLabel = busy ? '提交中' : displayAttempt ? '已提交' : recording ? '正在录音' : completed ? '录音完成' : '未录音';

  useEffect(() => {
    return () => cleanupRecording(true);
  }, []);

  useEffect(() => {
    if (!audioUrl) return undefined;
    return () => URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    setHidePreviousAttempt(false);
  }, [attempt?.id]);

  async function startRecording() {
    if (!mediaSupported) return;
    if (anotherQuestionRecording) return;
    cleanupRecording(true);
    setRecordingError('');
    setHidePreviousAttempt(true);
    setAudioBlob(null);
    setAudioUrl('');
    setDurationSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (ignoreStopRef.current) {
          ignoreStopRef.current = false;
          stopTracks();
          clearRecordingTimer();
          onRecordingEnd();
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setRecordingStatus('completed');
        stopTracks();
        clearRecordingTimer();
        onRecordingEnd();
      };
      recorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error ?? event);
        setRecordingError('录音发生错误，请重新录音。');
        setRecordingStatus('idle');
        stopTracks();
        clearRecordingTimer();
        onRecordingEnd();
      };

      onRecordingStart(question.index);
      setRecordingStatus('recording');
      recorder.start();
      timerRef.current = window.setInterval(() => {
        setDurationSeconds((current) => current + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start speaking recording:', {
        name: error?.name,
        message: error?.message,
        error,
      });
      setRecordingStatus('idle');
      onRecordingEnd();
      stopTracks();
      clearRecordingTimer();
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setRecordingError(`麦克风权限被拒绝。${formatMediaError(error)}`);
      } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        setRecordingError(`没有检测到麦克风设备。${formatMediaError(error)}`);
      } else if (error?.name === 'NotReadableError') {
        setRecordingError(`麦克风可能被其他软件占用。${formatMediaError(error)}`);
      } else {
        setRecordingError(`无法开始录音：${formatMediaError(error)}`);
      }
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    try {
      recorder.stop();
    } catch (error) {
      console.error('Failed to stop speaking recording:', error);
      setRecordingError('停止录音失败，请重新录音。');
      setRecordingStatus('idle');
      stopTracks();
      clearRecordingTimer();
      onRecordingEnd();
    }
  }

  function resetRecording() {
    cleanupRecording(true);
    setAudioBlob(null);
    setAudioUrl('');
    setDurationSeconds(0);
    setRecordingError('');
    setHidePreviousAttempt(true);
    setRecordingStatus('idle');
    onRecordingEnd();
  }

  function cleanupRecording(ignoreStop = false) {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      try {
        ignoreStopRef.current = ignoreStop;
        recorder.stop();
      } catch (error) {
        console.error('Failed to cleanup MediaRecorder:', error);
      }
    }
    recorderRef.current = null;
    stopTracks();
    clearRecordingTimer();
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearRecordingTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  return (
    <div className="card">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="caption">Question {question.index + 1}</p>
          <h3 className="text-base font-semibold text-slate-950">{question.text}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            recording ? 'bg-red-50 text-red-700' : displayAttempt ? 'bg-slate-950 text-white' : completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {recording && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-600 align-middle" />}
            {statusLabel}
          </span>
          {displayAttempt && (
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
              Band {displayAttempt.bandScore?.toFixed?.(1) ?? '-'}
            </span>
          )}
        </div>
      </div>

      <div className={`mt-4 rounded-lg border p-3 text-sm ${
        recording ? 'border-red-200 bg-red-50 text-red-700' : completed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <span>{busy ? '提交中' : displayAttempt ? '已提交' : recording ? '正在录音...' : completed ? '录音完成' : '未录音'}</span>
          <span>{durationSeconds} seconds</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="secondary-button" type="button" onClick={startRecording} disabled={!mediaSupported || recording || busy || anotherQuestionRecording}>
          <Mic2 size={16} />
          <span>开始录音</span>
        </button>
        <button className="secondary-button" type="button" onClick={stopRecording} disabled={!recording || busy}>
          <Pause size={16} />
          <span>停止录音</span>
        </button>
        <button className="secondary-button" type="button" onClick={resetRecording} disabled={recording || !audioBlob}>
          <RotateCcw size={16} />
          <span>重新录音</span>
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={busy || recording || !audioBlob}
          onClick={() => onSubmitAudio({
            questionIndex: question.index,
            questionText: question.text,
            taskType: prompt.taskType,
            audioBlob,
            durationSeconds,
          })}
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          <span>{busy ? '提交中...' : '提交本题'}</span>
        </button>
      </div>

      {anotherQuestionRecording && <p className="mt-3 text-sm text-slate-500">已有其他问题正在录音，请先停止当前录音。</p>}
      {!mediaSupported && <p className="mt-3 text-sm text-amber-700">当前浏览器不支持 MediaRecorder，请使用文字输入 fallback。</p>}
      {recordingError && <p className="mt-3 text-sm text-red-700">{recordingError}</p>}
      {!audioBlob && !recording && !recordingError && <p className="mt-3 text-sm text-slate-500">请先完成录音</p>}
      {audioUrl && (
        <audio className="mt-4 w-full" controls src={audioUrl}>
          <track kind="captions" />
        </audio>
      )}
      {durationSeconds > 0 && <p className="mt-2 text-xs text-slate-500">录音时长：{durationSeconds} 秒</p>}

      {displayAttempt && <SpeakingAudioFeedback attempt={displayAttempt} />}
    </div>
  );
}

function SpeakingAudioFeedback({ attempt }) {
  const metadata = attempt.metadata ?? {};
  const criteria = Object.entries(attempt.criteriaScores ?? {});

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3">
        <div className="caption">本题反馈</div>
        <SpokenFeedbackPlayer key={attempt.id} text={metadata.spokenFeedbackText ?? attempt.feedback} />
      </div>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
        <ResultBlock title="transcript 转写文本" value={metadata.transcript ?? attempt.answerText} />
        <ResultBlock title="correctedText 纠正后句子" value={metadata.correctedText ?? attempt.sampleAnswer} />
        {metadata.sentenceCorrections?.length > 0 && (
          <div>
            <div className="caption">sentenceCorrections</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {metadata.sentenceCorrections.map((item, index) => (
                <li key={`${item.original}-${index}`}>
                  {item.explanation} Corrected: {item.corrected}
                </li>
              ))}
            </ul>
          </div>
        )}
        {criteria.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {criteria.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-white p-3">
                <div className="caption">{key}</div>
                <div className="mt-1 font-semibold text-slate-950">{value}</div>
              </div>
            ))}
          </div>
        )}
        <FeedbackList title="strengths" items={attempt.strengths} />
        <FeedbackList title="improvements" items={attempt.improvements} />
        <ResultBlock title="spokenFeedbackText" value={metadata.spokenFeedbackText ?? attempt.feedback} />
      </div>
    </div>
  );
}

function ResultBlock({ title, value }) {
  if (!value) return null;
  return (
    <div>
      <div className="caption">{title}</div>
      <p className="mt-1">{value}</p>
    </div>
  );
}

function SpokenFeedbackPlayer({ text }) {
  const utteranceRef = useRef(null);
  const progressTimerRef = useRef(null);
  const utteranceTokenRef = useRef(0);
  const wasPlayingBeforeSeekRef = useRef(false);
  const [playbackStatus, setPlaybackStatus] = useState('stopped');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [seekProgress, setSeekProgress] = useState(null);
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const totalSeconds = estimateSpeechSeconds(text);
  const progress = playbackStatus === 'completed'
    ? 100
    : Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100));
  const displayProgress = seekProgress ?? progress;
  const displaySeconds = Math.round((displayProgress / 100) * totalSeconds);
  const seeking = seekProgress != null;
  const statusText = seeking
    ? '正在跳转...'
    : playbackStatus === 'playing'
      ? '正在播放语音反馈...'
      : playbackStatus === 'paused'
        ? '已暂停'
        : playbackStatus === 'completed'
          ? '播放完成'
          : '已停止';

  useEffect(() => {
    stopPlayback({ reset: true });
    return cancelPlaybackOnly;
  }, [text]);

  useEffect(() => {
    if (playbackStatus !== 'playing') {
      clearProgressTimer();
      return undefined;
    }
    progressTimerRef.current = window.setInterval(() => {
      setElapsedSeconds((current) => {
        const next = Math.min(totalSeconds, current + 0.5);
        if (next >= totalSeconds) {
          window.setTimeout(() => stopPlayback({ completed: true }), 0);
        }
        return next;
      });
    }, 500);
    return clearProgressTimer;
  }, [playbackStatus, totalSeconds]);

  function playFeedback(restart = false) {
    if (!speechSupported || !text) return;
    const startSeconds = restart || playbackStatus === 'completed' ? 0 : elapsedSeconds;
    speakFromSeconds(startSeconds);
  }

  function speakFromSeconds(startSeconds) {
    const safeStart = Math.max(0, Math.min(totalSeconds, startSeconds));
    if (!speechSupported || !text) return;
    if (safeStart >= totalSeconds) {
      stopPlayback({ completed: true });
      return;
    }

    window.speechSynthesis.cancel();
    const token = utteranceTokenRef.current + 1;
    utteranceTokenRef.current = token;
    const utterance = new SpeechSynthesisUtterance(getSpeechTextFromSeconds(text, safeStart, totalSeconds));
    utterance.lang = 'en-US';
    utterance.rate = 0.95;
    utterance.onend = () => {
      if (utteranceTokenRef.current !== token) return;
      setElapsedSeconds(totalSeconds);
      setPlaybackStatus('completed');
      clearProgressTimer();
      utteranceRef.current = null;
    };
    utterance.onerror = (event) => {
      if (utteranceTokenRef.current !== token) return;
      console.error('SpeechSynthesis feedback playback error:', event);
      setPlaybackStatus('stopped');
      clearProgressTimer();
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    setPlaybackStatus('playing');
    setElapsedSeconds(safeStart);
    window.speechSynthesis.speak(utterance);
  }

  function pauseFeedback() {
    if (!speechSupported || playbackStatus !== 'playing') return;
    window.speechSynthesis.pause();
    setPlaybackStatus('paused');
  }

  function resumeFeedback() {
    if (!speechSupported || playbackStatus !== 'paused') return;
    if (utteranceRef.current) {
      window.speechSynthesis.resume();
      setPlaybackStatus('playing');
    } else {
      speakFromSeconds(elapsedSeconds);
    }
  }

  function stopPlayback({ reset = false, completed = false } = {}) {
    utteranceTokenRef.current += 1;
    if (speechSupported) window.speechSynthesis.cancel();
    clearProgressTimer();
    utteranceRef.current = null;
    setPlaybackStatus(completed ? 'completed' : reset ? 'stopped' : 'stopped');
    setElapsedSeconds(completed ? totalSeconds : reset ? 0 : elapsedSeconds);
  }

  function cancelPlaybackOnly() {
    utteranceTokenRef.current += 1;
    if (speechSupported) window.speechSynthesis.cancel();
    clearProgressTimer();
    utteranceRef.current = null;
  }

  function handleSeekChange(event) {
    if (!speechSupported || !text) return;
    const nextProgress = Number(event.target.value);
    setSeekProgress(nextProgress);
    setElapsedSeconds(Math.round((nextProgress / 100) * totalSeconds));
  }

  function beginSeek() {
    if (!speechSupported || !text) return;
    wasPlayingBeforeSeekRef.current = playbackStatus === 'playing';

    // SpeechSynthesis does not support true audio seeking; this estimates seek by
    // slicing spokenFeedbackText at the same text-length percentage and replaying.
    setSeekProgress(progress);
    window.speechSynthesis.cancel();
    clearProgressTimer();
    utteranceRef.current = null;
    setPlaybackStatus(playbackStatus === 'playing' ? 'playing' : playbackStatus);
  }

  function commitSeek(rawProgress = seekProgress) {
    if (!speechSupported || !text || rawProgress == null) return;
    const nextProgress = Number(rawProgress);
    const nextSeconds = Math.round((nextProgress / 100) * totalSeconds);
    const shouldAutoPlay = wasPlayingBeforeSeekRef.current;

    setElapsedSeconds(nextProgress >= 100 ? totalSeconds : nextSeconds);
    setSeekProgress(null);

    if (nextProgress >= 100) {
      stopPlayback({ completed: true });
      return;
    }
    if (nextProgress <= 0) {
      setElapsedSeconds(0);
    }
    if (shouldAutoPlay) {
      speakFromSeconds(nextSeconds);
    } else {
      setPlaybackStatus(playbackStatus === 'paused' ? 'paused' : 'stopped');
    }
  }

  function clearProgressTimer() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  if (!speechSupported) {
    return <p className="text-sm text-amber-700">当前浏览器不支持语音播放</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        <button className="secondary-button" type="button" onClick={() => playFeedback(false)} disabled={!text || playbackStatus === 'playing'}>
          <Play size={16} />
          <span>播放</span>
        </button>
        <button className="secondary-button" type="button" onClick={pauseFeedback} disabled={playbackStatus !== 'playing'}>
          <Pause size={16} />
          <span>暂停</span>
        </button>
        <button className="secondary-button" type="button" onClick={resumeFeedback} disabled={playbackStatus !== 'paused'}>
          <Play size={16} />
          <span>继续播放</span>
        </button>
        <button className="secondary-button" type="button" onClick={() => (playbackStatus === 'completed' ? playFeedback(true) : stopPlayback())} disabled={!text || playbackStatus === 'stopped'}>
          <RotateCcw size={16} />
          <span>{playbackStatus === 'completed' ? '重播' : '停止/重播'}</span>
        </button>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>{statusText}</span>
          <span>{formatPlaybackTime(seeking ? displaySeconds : elapsedSeconds)} / {formatPlaybackTime(totalSeconds)}</span>
        </div>
        <input
          className="mt-2 h-2 w-full cursor-pointer accent-slate-900"
          type="range"
          min="0"
          max="100"
          value={displayProgress}
          onMouseDown={beginSeek}
          onMouseUp={() => commitSeek()}
          onTouchStart={beginSeek}
          onTouchEnd={() => commitSeek()}
          onKeyDown={beginSeek}
          onKeyUp={() => commitSeek()}
          onChange={handleSeekChange}
          disabled={!text}
          aria-label="语音反馈播放进度"
        />
      </div>
    </div>
  );
}

function formatMediaError(error) {
  const name = error?.name || 'UnknownError';
  const message = error?.message || 'No error message';
  return `${name}: ${message}`;
}

function estimateSpeechSeconds(text) {
  const words = countWords(text ?? '');
  return Math.max(3, Math.ceil(words / 2.4));
}

function getSpeechTextFromSeconds(text, startSeconds, totalSeconds) {
  const source = String(text ?? '').trim();
  if (!source) return '';
  const ratio = Math.max(0, Math.min(0.98, startSeconds / totalSeconds));
  const rawIndex = Math.floor(source.length * ratio);
  const previousSpace = source.lastIndexOf(' ', rawIndex);
  const startIndex = previousSpace > 0 ? previousSpace + 1 : rawIndex;
  return source.slice(startIndex).trim() || source;
}

function formatPlaybackTime(value) {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function FeedbackCard({ attempt }) {
  const criteria = Object.entries(attempt.criteriaScores ?? {});
  return (
    <div className="card border-slate-300">
      <div className="flex items-center justify-between">
        <h3 className="section-title">反馈和评分</h3>
        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
          Band {attempt.bandScore?.toFixed?.(1) ?? '-'}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700">{attempt.feedback}</p>
      {criteria.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {criteria.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-slate-50 p-3">
              <div className="caption">{key}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{value ?? 'N/A'}</div>
            </div>
          ))}
        </div>
      )}
      <FeedbackList title="优点" items={attempt.strengths} />
      <FeedbackList title="下一步改进" items={attempt.improvements} />
    </div>
  );
}

function FeedbackList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-4">
      <div className="caption">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function ReviewList({ title, items, emptyText }) {
  return (
    <div>
      <div className="caption">{title}</div>
      {items?.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function ReviewTaskList({ tasks }) {
  return (
    <div>
      <div className="caption">明日任务计划</div>
      {tasks?.length ? (
        <div className="mt-2 space-y-2">
          {tasks.map((task) => (
            <div key={`${task.type}-${task.title}`} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <div className="font-medium text-slate-900">{task.title}</div>
              <div className="mt-1 text-xs text-slate-500">{task.type} · {task.estimatedMinutes} 分钟</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">暂无明日任务计划</p>
      )}
    </div>
  );
}

function HistoryList({ prompts, activePromptId, onSelect }) {
  return (
    <div className="card">
      <h3 className="section-title">历史题目</h3>
      <div className="mt-4 space-y-3">
        {prompts.length === 0 && <p className="text-sm text-slate-500">暂无历史题目</p>}
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            className={`w-full rounded-lg border p-3 text-left transition ${
              activePromptId === prompt.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
            }`}
            type="button"
            onClick={() => onSelect(prompt.id)}
          >
            <div className="caption">{prompt.skill} · {prompt.taskType} · {prompt.attempts?.length ?? 0} 次提交</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{prompt.title}</div>
            <div className="mt-2 line-clamp-2 whitespace-pre-line text-xs leading-5 text-slate-500">{prompt.promptText}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function getSpeakingQuestions(prompt) {
  if (prompt.taskType === 'Part 1' || prompt.taskType === 'Part 3') {
    const points = prompt.cuePoints?.length
      ? prompt.cuePoints
      : String(prompt.promptText ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    return points.map((text, index) => ({ index, text }));
  }
  return [{ index: 0, text: prompt.promptText }];
}

function findSpeakingQuestionAttempt(attempts, questionIndex) {
  return attempts.find((attempt) => attempt.metadata?.questionIndex === questionIndex && attempt.metadata?.evaluator === 'mock-audio-template') ?? null;
}

function countWords(value) {
  const matches = value.trim().match(/[\p{L}\p{N}']+/gu);
  return matches ? matches.length : 0;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default PracticeCenterPage;
