export const dailyPlanningSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    weeklyGoal: { type: 'string' },
    advice: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    tasks: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['writing', 'reading', 'listening', 'speaking', 'vocabulary'] },
          estimatedMinutes: { type: 'integer', minimum: 5, maximum: 90 },
        },
        required: ['title', 'type', 'estimatedMinutes'],
      },
    },
  },
  required: ['weeklyGoal', 'advice', 'tasks'],
};

export const writingReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    band: { type: 'number', minimum: 0, maximum: 9 },
    feedback: { type: 'string' },
    focus: { type: 'string' },
    criteria: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskResponse: { type: 'string' },
        coherence: { type: 'string' },
        lexicalResource: { type: 'string' },
        grammar: { type: 'string' },
      },
      required: ['taskResponse', 'coherence', 'lexicalResource', 'grammar'],
    },
    topFixes: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    rewrittenParagraph: { type: 'string' },
  },
  required: ['band', 'feedback', 'focus', 'criteria', 'topFixes', 'rewrittenParagraph'],
};

export const speakingPromptSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    part: { type: 'string' },
    topic: { type: 'string' },
    prompt: { type: 'string' },
    followUps: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
  },
  required: ['part', 'topic', 'prompt', 'followUps'],
};

export const speakingFeedbackSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    band: { type: 'number', minimum: 0, maximum: 9 },
    feedback: { type: 'string' },
    fluency: { type: 'string' },
    vocabulary: { type: 'string' },
    grammar: { type: 'string' },
    pronunciationRisks: { type: 'string' },
    nextDrill: { type: 'string' },
  },
  required: ['band', 'feedback', 'fluency', 'vocabulary', 'grammar', 'pronunciationRisks', 'nextDrill'],
};

export const readingReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    notes: { type: 'string' },
    mistakeCauses: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
    reviewPlan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    vocabulary: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 12 },
  },
  required: ['notes', 'mistakeCauses', 'reviewPlan', 'vocabulary'],
};

export const listeningReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    review: { type: 'string' },
    mistakeCauses: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
    replayPlan: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    drills: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
  },
  required: ['review', 'mistakeCauses', 'replayPlan', 'drills'],
};

export const weeklyReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    improvements: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    weaknesses: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
    focusAreas: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
    weeklyGoal: { type: 'string' },
    advice: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
  },
  required: ['summary', 'improvements', 'weaknesses', 'focusAreas', 'weeklyGoal', 'advice'],
};

export function buildPrompt(kind, payload) {
  const context = JSON.stringify(payload, null, 2);
  const common = '你是严谨的 IELTS 学习教练。请用简体中文输出，建议要具体、可执行、面向提分。只返回符合 JSON schema 的内容。';

  return {
    dailyPlanning: `${common}\n根据学习者资料、最近成绩和历史记录生成今天 3-5 个任务、2-4 条今日建议和本周目标。\n${context}`,
    writingReview: `${common}\n按照 IELTS 写作四项评分标准批改作文，给出模拟 band、核心反馈、Top 3 修改点和一段改写示范。说明这只是学习参考分。\n${context}`,
    speakingPrompt: `${common}\n为指定 IELTS Speaking part 生成一个练习题和追问。\n${context}`,
    speakingFeedback: `${common}\n根据口语回答文本提供模拟 band 和 fluency、vocabulary、grammar、pronunciation risk 反馈。\n${context}`,
    readingReview: `${common}\n根据阅读文章/题型/错题信息做精读复盘，分类错因并给复习计划和词汇表达。\n${context}`,
    listeningReview: `${common}\n根据听力 section、分数、错题和 transcript notes 做复盘，分类错因并给重听和专项训练计划。\n${context}`,
    weeklyReview: `${common}\n根据本周所有学习记录做周复盘，找出 2 个进步、2 个弱点，并设置下周重点、本周目标和首页建议。\n${context}`,
  }[kind];
}
