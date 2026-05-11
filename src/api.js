async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? '请求失败');
  }
  return data;
}

export function getDashboard() {
  return request('/api/dashboard');
}

export function updateTask(id, done) {
  return request(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  });
}

export function createWritingRecord(payload) {
  return request('/api/writing', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createReadingRecord(payload) {
  return request('/api/reading', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createListeningRecord(payload) {
  return request('/api/listening', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createSpeakingRecord(payload) {
  return request('/api/speaking', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateVocabulary(payload) {
  return request('/api/vocabulary', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPracticePrompts(skill) {
  const query = skill ? `?skill=${encodeURIComponent(skill)}` : '';
  return request(`/api/practice/prompts${query}`);
}

export function generatePracticePrompt(payload) {
  return request('/api/practice/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function submitPracticeAttempt(promptId, payload) {
  return request(`/api/practice/${promptId}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitSpeakingAudioAttempt(promptId, formData) {
  const response = await fetch(`/api/practice/${promptId}/submit-audio`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 400 && data.error === 'audio is required.') {
      throw new Error('请先完成录音再提交');
    }
    throw new Error(data.error ?? '音频提交失败');
  }
  return data;
}

export function getDailyReview() {
  return request('/api/daily-review');
}

export function generateDailyReview() {
  return request('/api/daily-review/generate', {
    method: 'POST',
  });
}

export function syncDailyReviewTasks() {
  return request('/api/daily-review/sync-tasks', {
    method: 'POST',
  });
}
