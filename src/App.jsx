import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Headphones,
  Home,
  Loader2,
  Mic2,
  NotebookPen,
  PenLine,
  Plus,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import {
  createListeningRecord,
  createReadingRecord,
  createSpeakingRecord,
  createWritingRecord,
  getDashboard,
  updateTask,
  updateVocabulary,
} from './api.js';

const navItems = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'trend', label: '趋势', icon: TrendingUp },
  { id: 'writing', label: '写作', icon: PenLine },
  { id: 'reading', label: '阅读', icon: BookOpen },
  { id: 'listening', label: '听力', icon: Headphones },
  { id: 'vocabulary', label: '词汇', icon: NotebookPen },
  { id: 'speaking', label: '口语', icon: Mic2 },
  { id: 'timeline', label: '时间线', icon: CalendarDays },
];

function App() {
  const [active, setActive] = useState('home');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setError('');
    try {
      setData(await getDashboard());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const title = navItems.find((item) => item.id === active)?.label ?? '首页';

  if (loading) return <FullPageState label="正在载入学习数据" />;
  if (error) return <FullPageState label={`无法载入数据：${error}`} />;
  if (!data) return <FullPageState label="暂无可显示数据" />;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar active={active} data={data} onChange={setActive} />
        <main className="min-w-0 flex-1 bg-panel pb-20 md:pb-0">
          <header className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="caption">IELTS Study Dashboard</p>
                <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
              </div>
              <div className="text-sm text-slate-500">
                {data.profile.studentName} · 目标 {data.profile.targetScore.toFixed(1)}
              </div>
            </div>
          </header>
          <div className="px-5 py-6 md:px-8">
            {active === 'home' && <Dashboard data={data} onChange={setData} />}
            {active === 'writing' && <WritingPage data={data} onChange={setData} />}
            {active === 'reading' && <ReadingPage data={data} onChange={setData} />}
            {active === 'listening' && <ListeningPage data={data} onChange={setData} />}
            {active === 'vocabulary' && <VocabularyPage data={data} onChange={setData} />}
            {active === 'speaking' && <SpeakingPage data={data} onChange={setData} />}
            {active === 'trend' && <TrendPage data={data} />}
            {active === 'timeline' && <TimelinePage data={data} />}
          </div>
        </main>
        <MobileNav active={active} onChange={setActive} />
      </div>
    </div>
  );
}

function Sidebar({ active, data, onChange }) {
  return (
    <aside className="hidden w-64 shrink-0 bg-slate-950 text-white md:flex md:flex-col">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-white text-slate-950">
            <Sparkles size={19} />
          </div>
          <div>
            <div className="text-sm font-semibold">IELTS Coach</div>
            <div className="text-xs text-slate-400">{data.profile.currentStage}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavButton key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="rounded-lg bg-white/10 p-4">
          <div className="text-xs text-slate-400">本周目标</div>
          <p className="mt-2 text-sm leading-6 text-slate-100">{data.weeklyGoal}</p>
        </div>
      </div>
    </aside>
  );
}

function MobileNav({ active, onChange }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
      {navItems.slice(0, 8).map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] ${
              active === item.id ? 'text-slate-950' : 'text-slate-500'
            }`}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <Icon size={17} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function NavButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
        active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </button>
  );
}

function Dashboard({ data, onChange }) {
  const [busyTask, setBusyTask] = useState('');
  const examDays = useMemo(() => daysUntil(data.profile.examDate), [data.profile.examDate]);
  const goalGap = formatScoreDelta(data.profile.targetScore, data.lastMock.overall);
  const scores = [
    ['听力', data.lastMock.listening],
    ['阅读', data.lastMock.reading],
    ['写作', data.lastMock.writing],
    ['口语', data.lastMock.speaking],
  ];

  async function toggleTask(task) {
    setBusyTask(task.id);
    try {
      onChange(await updateTask(task.id, !task.done));
    } finally {
      setBusyTask('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="目标分数" value={data.profile.targetScore.toFixed(1)} />
        <MetricCard label="距离考试天数" value={`${examDays} 天`} />
        <MetricCard label="最近模考总分" value={data.lastMock.overall.toFixed(2)} />
        <MetricCard label="距离目标差值" value={goalGap} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="section-title">当前小分</h2>
            <span className="caption">最近模考 · {data.lastMock.date}</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            {scores.map(([label, value]) => (
              <ScoreBar key={label} label={label} value={value} />
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="section-title">今日建议</h2>
          <div className="mt-4 space-y-3">
            {data.todayAdvice.map((item) => (
              <div key={item} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="写作记录次数" value={data.stats.writingRecords} />
        <MetricCard label="阅读记录次数" value={data.stats.readingRecords} />
        <MetricCard label="听力分析次数" value={data.stats.listeningAnalyses} />
        <ProgressCard label="背词进度" value={`${data.stats.vocabularyProgress}%`} percent={data.stats.vocabularyProgress} />
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <h2 className="section-title">今日任务</h2>
          <span className="text-sm text-slate-500">{data.supervision.plannedMinutes} 分钟计划</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {data.tasks.map((task) => (
            <button key={task.id} className="task-card" onClick={() => toggleTask(task)} type="button">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="caption">{task.type} · {task.estimatedMinutes} 分钟</div>
                  <div className="mt-2 text-left text-sm font-medium text-slate-900">{task.title}</div>
                </div>
                {busyTask === task.id ? (
                  <Loader2 className="animate-spin text-slate-400" size={18} />
                ) : (
                  <CheckCircle2 size={18} className={task.done ? 'text-emerald-600' : 'text-slate-300'} />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WritingPage({ data, onChange }) {
  return (
    <RecordPage
      title="新增写作记录"
      summary={`目标 ${data.profile.targetScore.toFixed(1)} · 已记录 ${data.records.writing.length} 篇`}
      form={<WritingForm onChange={onChange} />}
      records={<WritingRecords records={data.records.writing} />}
    />
  );
}

function ReadingPage({ data, onChange }) {
  return (
    <RecordPage
      title="新增阅读精读"
      summary={`目标 7.0 · 已记录 ${data.records.reading.length} 次`}
      form={<ReadingForm onChange={onChange} />}
      records={<ReadingRecords records={data.records.reading} />}
    />
  );
}

function ListeningPage({ data, onChange }) {
  return (
    <RecordPage
      title="新增听力复盘"
      summary={`目标 7.0 · 已分析 ${data.records.listening.length} 次`}
      form={<ListeningForm onChange={onChange} />}
      records={<ListeningRecords records={data.records.listening} />}
    />
  );
}

function SpeakingPage({ data, onChange }) {
  return (
    <RecordPage
      title="新增口语练习"
      summary={`目标 7.0 · 已记录 ${data.records.speaking.length} 次`}
      form={<SpeakingForm onChange={onChange} />}
      records={<SpeakingRecords records={data.records.speaking} />}
    />
  );
}

function VocabularyPage({ data, onChange }) {
  const [form, setForm] = useState({ learnedDelta: 30, todayNew: data.vocabulary.todayNew, todayReview: data.vocabulary.todayReview });
  const [busy, setBusy] = useState(false);
  const percent = Math.round((data.vocabulary.learned / data.vocabulary.target) * 100);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      onChange(await updateVocabulary(form));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="section-title">词汇进度</h2>
          <span className="caption">{data.vocabulary.learned} / {data.vocabulary.target}</span>
        </div>
        <div className="mt-6 h-3 rounded-full bg-slate-100">
          <div className="h-3 rounded-full bg-slate-900" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-4 text-4xl font-semibold">{percent}%</div>
      </div>
      <form className="form-card" onSubmit={submit}>
        <Input label="新增已背单词数" value={form.learnedDelta} onChange={(value) => setForm({ ...form, learnedDelta: value })} />
        <Input label="今日新词" value={form.todayNew} onChange={(value) => setForm({ ...form, todayNew: value })} />
        <Input label="今日复习" value={form.todayReview} onChange={(value) => setForm({ ...form, todayReview: value })} />
        <ActionButton busy={busy} label="更新词汇进度" />
      </form>
    </div>
  );
}

function TrendPage({ data }) {
  const scores = [
    ['听力', data.lastMock.listening],
    ['阅读', data.lastMock.reading],
    ['写作', data.lastMock.writing],
    ['口语', data.lastMock.speaking],
  ];
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="section-title">模考趋势</h2>
        <p className="mt-3 text-sm text-slate-600">MVP 先展示最近一次模考小分，后续可以扩展为多次模考折线图。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {scores.map(([label, value]) => (
          <ScoreBar key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

function TimelinePage({ data }) {
  const items = [
    ...data.records.writing.map((item) => ({ date: item.date, title: item.topic, type: '写作' })),
    ...data.records.reading.map((item) => ({ date: item.date, title: item.passage, type: '阅读' })),
    ...data.records.listening.map((item) => ({ date: item.date, title: item.section, type: '听力' })),
    ...data.records.speaking.map((item) => ({ date: item.date, title: item.topic, type: '口语' })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="card">
      <h2 className="section-title">学习时间线</h2>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={`${item.type}-${item.title}-${index}`} className="rounded-lg border border-slate-200 p-3">
            <div className="caption">{item.date} · {item.type}</div>
            <div className="mt-1 text-sm font-medium text-slate-900">{item.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingForm({ onChange }) {
  const [form, setForm] = useState({ task: 'Task 2', topic: '', band: '6', focus: '', feedback: '' });
  return (
    <LocalForm
      form={form}
      setForm={setForm}
      onSubmit={async () => onChange((await createWritingRecord(form)).dashboard)}
      submitLabel="保存写作记录"
      fields={[
        ['task', '任务类型'],
        ['topic', '题目'],
        ['band', '估计分数'],
        ['focus', '训练重点'],
        ['feedback', '反馈/问题', 'textarea'],
      ]}
    />
  );
}

function ReadingForm({ onChange }) {
  const [form, setForm] = useState({ passage: '', score: '', questionTypes: '', mistakes: '', notes: '' });
  return (
    <LocalForm
      form={form}
      setForm={setForm}
      onSubmit={async () => onChange((await createReadingRecord(form)).dashboard)}
      submitLabel="保存阅读记录"
      fields={[
        ['passage', '文章/篇名'],
        ['score', '分数，例如 27/40'],
        ['questionTypes', '题型，用逗号分隔'],
        ['mistakes', '错题数'],
        ['notes', '精读笔记', 'textarea'],
      ]}
    />
  );
}

function ListeningForm({ onChange }) {
  const [form, setForm] = useState({ section: 'Section 3', score: '', mistakes: '', review: '' });
  return (
    <LocalForm
      form={form}
      setForm={setForm}
      onSubmit={async () => onChange((await createListeningRecord(form)).dashboard)}
      submitLabel="保存听力复盘"
      fields={[
        ['section', 'Section'],
        ['score', '分数，例如 7/10'],
        ['mistakes', '错误类型，用逗号分隔'],
        ['review', '复盘内容', 'textarea'],
      ]}
    />
  );
}

function SpeakingForm({ onChange }) {
  const [form, setForm] = useState({ part: 'Part 2', topic: '', band: '6', feedback: '' });
  return (
    <LocalForm
      form={form}
      setForm={setForm}
      onSubmit={async () => onChange((await createSpeakingRecord(form)).dashboard)}
      submitLabel="保存口语练习"
      fields={[
        ['part', 'Part'],
        ['topic', '题目'],
        ['band', '估计分数'],
        ['feedback', '反馈/复盘', 'textarea'],
      ]}
    />
  );
}

function LocalForm({ form, setForm, fields, submitLabel, onSubmit }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await onSubmit();
      setMessage('已保存到 data 目录中的 JSON 文件。');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-card" onSubmit={submit}>
      {fields.map(([key, label, type]) =>
        type === 'textarea' ? (
          <Textarea key={key} label={label} value={form[key]} onChange={(value) => setForm({ ...form, [key]: value })} rows={5} />
        ) : (
          <Input key={key} label={label} value={form[key]} onChange={(value) => setForm({ ...form, [key]: value })} />
        ),
      )}
      <ActionButton busy={busy} label={submitLabel} />
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </form>
  );
}

function RecordPage({ title, summary, form, records }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-4">
        <div className="card">
          <p className="caption">Records</p>
          <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm text-slate-500">{summary}</p>
        </div>
        {form}
      </div>
      {records}
    </div>
  );
}

function WritingRecords({ records }) {
  return <RecordList title="最近写作" records={records} render={(item) => `Band ${item.band ?? '-'} · ${item.feedback}`} />;
}

function ReadingRecords({ records }) {
  return <RecordList title="最近阅读" records={records} render={(item) => `${item.score} · ${item.notes}`} />;
}

function ListeningRecords({ records }) {
  return <RecordList title="最近听力" records={records} render={(item) => `${item.score} · ${item.review}`} />;
}

function SpeakingRecords({ records }) {
  return <RecordList title="最近口语" records={records} render={(item) => `${item.band ? `Band ${item.band} · ` : ''}${item.feedback}`} />;
}

function RecordList({ title, records, render }) {
  return (
    <div className="card">
      <h2 className="section-title">{title}</h2>
      <div className="mt-4 space-y-3">
        {records.length === 0 && <p className="text-sm text-slate-500">暂无记录</p>}
        {records.map((item) => (
          <article key={item.id} className="rounded-lg border border-slate-200 p-3">
            <div className="caption">{item.date} · {item.task ?? item.part ?? item.section ?? item.passage}</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{render(item)}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function FullPageState({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-panel px-6 text-center text-sm text-slate-600">
      {label}
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="card">
      <div className="caption">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

function ProgressCard({ label, value, percent }) {
  return (
    <div className="card">
      <div className="caption">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-slate-950">{value}</div>
      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ScoreBar({ label, value }) {
  const percent = Math.min(100, (Number(value) / 9) * 100);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold">{Number(value).toFixed(1)}</span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-white">
        <div className="h-2 rounded-full bg-slate-900" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input className="field" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange, rows }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea className="field resize-y" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ActionButton({ busy, label }) {
  return (
    <button className="primary-button" type="submit" disabled={busy}>
      {busy ? <Loader2 className="animate-spin" size={17} /> : <Plus size={17} />}
      <span>{busy ? '保存中...' : label}</span>
    </button>
  );
}

function daysUntil(dateString) {
  const today = new Date();
  const target = new Date(`${dateString}T00:00:00`);
  const diff = target.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function formatScoreDelta(target, current) {
  const delta = Number((target - current).toFixed(2));
  return delta > 0 ? `差 ${delta}` : '已达标';
}

export default App;
