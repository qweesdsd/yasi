import OpenAI from 'openai';

import { config } from './config.js';

let client;

export function ensureOpenAI() {
  if (!config.openaiApiKey) {
    const error = new Error('OPENAI_API_KEY is not configured. Add it to .env before using AI coaching endpoints.');
    error.status = 503;
    throw error;
  }

  client ??= new OpenAI({ apiKey: config.openaiApiKey });
  return client;
}

export async function generateJson({ name, schema, prompt }) {
  const openai = ensureOpenAI();
  const response = await openai.responses.create({
    model: config.openaiModel,
    input: prompt,
    text: {
      format: {
        type: 'json_schema',
        name,
        schema,
        strict: true,
      },
    },
  });

  const text = response.output_text;
  if (!text) {
    const error = new Error('OpenAI returned an empty response.');
    error.status = 502;
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('OpenAI returned JSON that could not be parsed.');
    error.status = 502;
    throw error;
  }
}
