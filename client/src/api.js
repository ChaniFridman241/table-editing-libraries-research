// שכבת תקשורת עם השרת

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `שגיאה ${status}`);
    this.status = status;
    this.body = body;
  }
}

export const tokenStore = {
  get: () => localStorage.getItem('token'),
  set: (t) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token'),
};

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !url.startsWith('/auth/')) {
    tokenStore.clear();
    window.location.href = '/login';
  }
  // אין תשובה מסודרת מהשרת = השרת לא רץ או לא הצליח להתחבר ל-DB
  if (!res.ok && !data) {
    throw new ApiError(res.status, { error: 'אין חיבור לשרת. ודאי שהשרת רץ (npm run dev בתיקיית server) ונסי שוב.' });
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  register: (username, password, displayName) => request('POST', '/auth/register', { username, password, displayName }),
  me: () => request('GET', '/auth/me'),

  listEmployees: (params) => request('GET', `/employees?${new URLSearchParams(params)}`),
  getEmployee: (id) => request('GET', `/employees/${id}`),
  createEmployee: (data) => request('POST', '/employees', data),
  updateEmployee: (id, version, changes) => request('PATCH', `/employees/${id}`, { version, changes }),
  deleteEmployee: (id, version) => request('DELETE', `/employees/${id}?version=${version}`),
  restoreEmployee: (id, version) => request('POST', `/employees/${id}/restore`, { version }),

  getGridSettings: () => request('GET', '/settings/grid'),
  saveGridSettings: (columns) => request('PUT', '/settings/grid', { columns }),

  audit: (params) => request('GET', `/audit?${new URLSearchParams(params)}`),
};
