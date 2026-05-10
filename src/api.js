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
