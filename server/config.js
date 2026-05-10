import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  rootDir,
  dataDir: path.join(rootDir, 'data'),
  dbPath: path.join(rootDir, 'data', 'ielts-coach.db'),
  port: Number(process.env.PORT ?? 3001),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5.2',
};
