import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const apiKey = process.env.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const reasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT || 'high';

export const deepseekModel = model;

const client = apiKey
  ? new OpenAI({
      baseURL,
      apiKey,
    })
  : null;

export async function generateWritingFeedback({ prompt, answer }) {
  return requestJson({
    task: 'IELTS Writing Task 2 feedback',
    schema: feedbackSchema(),
    payload: { prompt, answer },
  });
}

export async function generateSpeakingFeedback({ questionText, transcript, taskType }) {
  return requestJson({
    task: 'IELTS Speaking feedback',
    schema: {
      ...feedbackSchema(),
      transcript: 'string',
      correctedText: 'string',
      sentenceCorrections: [{ original: 'string', corrected: 'string', explanation: 'string' }],
      spokenFeedbackText: 'string',
    },
    payload: { questionText, transcript, taskType },
  });
}

export async function generateReadingFeedback({ passage, questions, userAnswers, correctAnswers }) {
  return requestJson({
    task: 'IELTS Reading feedback',
    schema: objectiveFeedbackSchema(),
    payload: { passage, questions, userAnswers, correctAnswers },
  });
}

export async function generateListeningFeedback({ transcript, questions, userAnswers, correctAnswers }) {
  return requestJson({
    task: 'IELTS Listening feedback',
    schema: objectiveFeedbackSchema(),
    payload: { transcript, questions, userAnswers, correctAnswers },
  });
}

export async function generateDailyReview({ attempts }) {
  return requestJson({
    task: 'IELTS daily study review',
    schema: {
      practiceCount: 'number',
      averageBandScore: 'number|null',
      strengths: ['string'],
      weaknesses: ['string'],
      tomorrowAdvice: ['string'],
      tomorrowTasks: [{ type: 'writing|speaking|reading|listening|vocabulary|review', title: 'string', estimatedMinutes: 'number' }],
      summary: 'string',
      metadata: 'object',
    },
    payload: { attempts },
  });
}

async function requestJson({ task, schema, payload }) {
  if (!client) return null;

  try {
    const completion = await client.chat.completions.create({
      model,
      thinking: { type: 'enabled' },
      reasoning_effort: reasoningEffort,
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      messages: [
        {
          role: 'system',
          content:
            'You are an IELTS examiner and study coach. Return only valid JSON. Do not include markdown. Keep feedback concise and actionable.',
        },
        {
          role: 'user',
          content: JSON.stringify({ task, schema, payload }),
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error('DeepSeek API call failed, falling back to local rules:', {
      task,
      name: error?.name,
      message: error?.message,
      status: error?.status,
    });
    return null;
  }
}

function feedbackSchema() {
  return {
    bandScore: 'number',
    feedback: 'string',
    criteriaScores: 'object with IELTS criterion names and numeric band scores',
    strengths: ['string'],
    improvements: ['string'],
    sampleAnswer: 'string|null',
    metadata: 'object',
  };
}

function objectiveFeedbackSchema() {
  return {
    bandScore: 'number',
    feedback: 'string',
    criteriaScores: 'object with numeric scores',
    strengths: ['string'],
    improvements: ['string'],
    sampleAnswer: 'string|null',
    metadata: {
      correctCount: 'number',
      totalQuestions: 'number',
      answers: ['string'],
      details: [
        {
          questionId: 'string',
          question: 'string',
          selected: 'string',
          correct: 'string',
          isCorrect: 'boolean',
          explanation: 'string',
        },
      ],
    },
  };
}
