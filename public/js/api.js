const TOKEN_KEY = "smartftp_token";
const API_BASE_KEY = "smartftp_api_base";

/**
 * Base URL of the backend API. Override at runtime by setting
 * window.SMARTFTP_API_BASE before this script loads, or by changing it in the
 * Settings modal. When empty, requests are made to the same origin (served
 * alongside the frontend), i.e. "/api/...".
 */
let API_BASE = "";
if (window.SMARTFTP_API_BASE) {
  API_BASE = window.SMARTFTP_API_BASE.replace(/\/$/, "");
} else {
  const stored = localStorage.getItem(API_BASE_KEY);
  if (stored) API_BASE = stored.replace(/\/$/, "");
}
if (API_BASE === "/" ) API_BASE = "";

export const api = {
  token: localStorage.getItem(TOKEN_KEY),
  apiBase: API_BASE,

  setApiBase(base) {
    API_BASE = (base || "").replace(/\/$/, "");
    if (API_BASE === "/") API_BASE = "";
    this.apiBase = API_BASE;
    localStorage.setItem(API_BASE_KEY, API_BASE || "/");
  },

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
    const res = await fetch(API_BASE + "/api" + path, {
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

  downloadUrl: (id, path) => `${API_BASE}/api/profiles/${id}/download?path=${encodeURIComponent(path)}`,
};
