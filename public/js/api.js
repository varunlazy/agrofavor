const TOKEN_KEY = "smartftp_token";

export const api = {
  token: localStorage.getItem(TOKEN_KEY),

  setToken(t) {
    this.token = t;
    localStorage.setItem(TOKEN_KEY, t);
  },
  clearToken() {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
  },

  async request(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (this.token) headers["Authorization"] = "Bearer " + this.token;
    if (opts.body && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch("/api" + path, {
      ...opts,
      headers,
      body: opts.body instanceof FormData ? opts.body : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error || res.statusText);
    return data;
  },

  // Auth
  register: (b) => api.request("/auth/register", { method: "POST", body: b }),
  login: (b) => api.request("/auth/login", { method: "POST", body: b }),
  me: () => api.request("/auth/me"),

  // Profiles
  listProfiles: () => api.request("/profiles"),
  saveProfile: (b, id) =>
    id ? api.request("/profiles/" + id, { method: "PUT", body: b }) : api.request("/profiles", { method: "POST", body: b }),
  deleteProfile: (id) => api.request("/profiles/" + id, { method: "DELETE" }),
  testProfile: (id) => api.request("/profiles/" + id + "/test", { method: "POST" }),

  // Activity
  activity: () => api.request("/activity"),

  // FTP ops
  list: (id, path) => api.request(`/profiles/${id}/list?path=${encodeURIComponent(path)}`),
  mkdir: (id, path) => api.request(`/profiles/${id}/mkdir`, { method: "POST", body: { path } }),
  del: (id, path, isDir) => api.request(`/profiles/${id}/delete`, { method: "POST", body: { path, isDir } }),
  rename: (id, from, to) => api.request(`/profiles/${id}/rename`, { method: "POST", body: { from, to } }),
  chmod: (id, path, mode) => api.request(`/profiles/${id}/chmod`, { method: "POST", body: { path, mode } }),
  read: (id, path) => api.request(`/profiles/${id}/read?path=${encodeURIComponent(path)}`),
  saveText: (id, path, content) => api.request(`/profiles/${id}/save`, { method: "POST", body: { path, content } }),

  upload: (id, dir, files) => {
    const fd = new FormData();
    fd.append("path", dir);
    for (const f of files) fd.append("files", f);
    return api.request(`/profiles/${id}/upload`, { method: "POST", body: fd });
  },

  downloadUrl: (id, path) => `/api/profiles/${id}/download?path=${encodeURIComponent(path)}`,
};
