const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`API returned a non-JSON response (HTTP ${response.status}). Check that the backend is running.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`API returned invalid JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(payload.error || 'Something went wrong.');
  return payload;
}

export const api = {
  getQuota: () => request('/quota'),
  createLookup: (data, idempotencyKey) => request('/lookups', {
    method: 'POST', body: JSON.stringify(data), headers: { 'Idempotency-Key': idempotencyKey }
  }),
  runLookup: (id) => request(`/lookups/${id}/run`, { method: 'POST' }),
  getStatus: (id) => request(`/lookups/${id}`)
};
