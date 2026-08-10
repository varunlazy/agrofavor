import { api } from "./api.js";

/* ---------- State ---------- */
const state = {
  user: null,
  profiles: [],
  activeProfile: null,
  currentPath: "/",
  items: [],
  selected: null,
  editor: { path: "", content: "", dirty: false },
  dragState: false,
};

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmtSize = (b) => {
  if (b == null || isNaN(b)) return "-";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
};
const fmtDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fileIcon(type, name) {
  if (type === "dir") return "📁";
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["txt", "md", "log", "ini", "conf", "json", "xml", "yaml", "yml", "csv", "html", "css", "js", "ts", "php", "py", "sh", "sql"].includes(ext)) return "📄";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext)) return "🖼️";
  if (["zip", "tar", "gz", "rar", "7z"].includes(ext)) return "🗜️";
  return "📃";
}

/* ---------- Boot ---------- */
async function boot() {
  if (api.token) {
    try {
      const { user } = await api.me();
      enterClient(user);
    } catch {
      api.clearToken();
    }
  }
  bindLogin();
  bindTabs();
  bindClient();
  bindModals();
  bindDragDrop();
  setInterval(refreshClock, 1000);
  refreshClock();
}

/* ---------- Auth UI ---------- */
function bindTabs() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      $("#loginForm").classList.toggle("hidden", btn.dataset.tab !== "login");
      $("#registerForm").classList.toggle("hidden", btn.dataset.tab !== "register");
    });
  });
}

function bindLogin() {
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#loginError");
    err.classList.add("hidden");
    const fd = new FormData(e.target);
    try {
      const { token } = await api.login(Object.fromEntries(fd));
      api.setToken(token);
      const { user } = await api.me();
      enterClient(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove("hidden");
    }
  });
  $("#registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#registerError");
    err.classList.add("hidden");
    const fd = new FormData(e.target);
    try {
      const { token } = await api.register(Object.fromEntries(fd));
      api.setToken(token);
      const { user } = await api.me();
      enterClient(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove("hidden");
    }
  });
}

/* ---------- Client UI ---------- */
function enterClient(user) {
  state.user = user;
  $("#userBadge").textContent = user.username;
  $("#loginView").classList.add("hidden");
  $("#clientView").classList.remove("hidden");
  loadProfiles();
  refreshActivity();
  setInterval(refreshActivity, 10000);
}

function bindClient() {
  $("#logoutBtn").addEventListener("click", logout);
  $("#profileSelect").addEventListener("change", (e) => {
    const id = Number(e.target.value);
    const p = state.profiles.find((x) => x.id === id);
    $("#editProfileBtn").disabled = !p;
    $("#deleteProfileBtn").disabled = !p;
    if (p) connectProfile(p);
  });
  $("#connectBtn").addEventListener("click", () => {
    const id = Number($("#profileSelect").value);
    const p = state.profiles.find((x) => x.id === id);
    if (p) connectProfile(p);
  });
  $("#editProfileBtn").addEventListener("click", openEditProfile);
  $("#deleteProfileBtn").addEventListener("click", deleteCurrentProfile);
  $("#homeBtn").addEventListener("click", () => navigate("/"));
  $("#upBtn").addEventListener("click", goUp);
  $("#goBtn").addEventListener("click", () => navigate($("#pathInput").value));
  $("#pathInput").addEventListener("keydown", (e) => { if (e.key === "Enter") navigate($("#pathInput").value); });
  $("#refreshBtn") || null;
  $$("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleRibbon(btn.dataset.action));
  });
  $("#filterInput").addEventListener("input", renderFiles);
  $("#clearLogBtn").addEventListener("click", () => { $("#activityLog").innerHTML = ""; });
  $("#emptyConnectBtn").addEventListener("click", () => openProfileModal());
  $("#editorSaveBtn").addEventListener("click", saveEditedFile);
  $("#editorDownloadBtn").addEventListener("click", () => {
    if (state.activeProfile && state.editor.path)
      window.location = api.downloadUrl(state.activeProfile.id, state.editor.path);
  });
  $("#editorTextarea").addEventListener("input", () => {
    state.editor.dirty = state.editor.content !== $("#editorTextarea").value;
    $("#editorDirty").classList.toggle("hidden", !state.editor.dirty);
  });
}

function logout() {
  api.clearToken();
  state.user = null;
  state.profiles = [];
  state.activeProfile = null;
  $("#clientView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
  $("#loginForm").reset();
}

async function loadProfiles() {
  try {
    const rows = await api.listProfiles();
    state.profiles = rows;
    renderProfileSelect();
    renderProfileList();
  } catch (e) { toast(e.message, "error"); }
}

function renderProfileSelect() {
  const sel = $("#profileSelect");
  sel.innerHTML = '<option value="">— Select a saved connection —</option>' +
    state.profiles.map((p) => `<option value="${p.id}">${escapeHtml(p.name)} (${p.protocol.toUpperCase()} ${escapeHtml(p.host)}:${p.port})</option>`).join("");
}

function renderProfileList() {
  const el = $("#profileList");
  if (!state.profiles.length) {
    el.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px;">No saved connections yet.<br/>Use <b>File ▸ New Profile</b>.</div>';
    return;
  }
  el.innerHTML = state.profiles.map((p) => `
    <div class="profile-item ${state.activeProfile?.id === p.id ? "active" : ""}" data-id="${p.id}">
      <div class="pi-name">${escapeHtml(p.name)}</div>
      <div class="pi-host"><span class="pi-proto">${p.protocol}</span> ${escapeHtml(p.host)}:${p.port}</div>
    </div>`).join("");
  $$(".profile-item").forEach((it) => it.addEventListener("click", () => {
    const p = state.profiles.find((x) => x.id === Number(it.dataset.id));
    if (p) { $("#profileSelect").value = p.id; $("#editProfileBtn").disabled = false; $("#deleteProfileBtn").disabled = false; connectProfile(p); }
  }));
}

/* ---------- Connection ---------- */
async function connectProfile(p) {
  showLoading("Connecting to " + p.host + "...");
  state.activeProfile = p;
  $("#statusConn").textContent = "Connecting...";
  renderProfileList();
  try {
    const start = p.remote_path || "/";
    await navigate(start);
    $("#statusConn").textContent = `Connected: ${p.host}:${p.port} (${p.protocol.toUpperCase()})`;
    $("#statusProto").textContent = p.protocol.toUpperCase();
    await refreshActivity();
  } catch (e) {
    toast("Connection failed: " + e.message, "error");
    $("#statusConn").textContent = "Connection failed";
    state.activeProfile = null;
    renderProfileList();
    hideLoading();
  }
}

async function navigate(path) {
  if (!state.activeProfile) return;
  showLoading("Loading " + path);
  try {
    const { path: real, items } = await api.list(state.activeProfile.id, path);
    state.currentPath = real;
    state.items = items;
    $("#pathInput").value = real;
    $("#emptyState").classList.add("hidden");
    renderFiles();
    updateStatus();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    hideLoading();
  }
}

function goUp() {
  if (state.currentPath === "/" || !state.currentPath) return;
  const parts = state.currentPath.split("/").filter(Boolean);
  parts.pop();
  navigate("/" + parts.join("/"));
}

function renderFiles() {
  const filter = $("#filterInput").value.toLowerCase().trim();
  let items = [...state.items];
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  if (filter) items = items.filter((i) => i.name.toLowerCase().includes(filter));

  const el = $("#fileList");
  if (!items.length) {
    el.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-dim-dark);">This folder is empty</div>`;
    return;
  }
  el.innerHTML = items.map((it) => {
    const isDir = it.type === "dir";
    return `<div class="file-row ${isDir ? "is-dir" : ""}" data-path="${escapeHtml(it.path)}" data-type="${it.type}" data-name="${escapeHtml(it.name)}">
      <div class="col-name"><span class="file-icon">${fileIcon(it.type, it.name)}</span>${escapeHtml(it.name)}</div>
      <div class="col-size">${isDir ? "&lt;dir&gt;" : fmtSize(it.size)}</div>
      <div class="col-date">${fmtDate(it.modifiedAt)}</div>
      <div class="col-perm">${typeof it.permissions === "object" ? JSON.stringify(it.permissions) : (it.permissions || "-")}</div>
      <div class="col-actions row-actions">
        ${isDir ? "" : `<button class="edit" title="Edit">Edit</button>`}
        <button class="ren" title="Rename">Ren</button>
        <button class="dl" title="Download">DL</button>
        <button class="del" title="Delete">Del</button>
      </div>
    </div>`;
  }).join("");

  $$("#fileList .file-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      $$("#fileList .file-row").forEach((r) => r.classList.remove("selected"));
      row.classList.add("selected");
      state.selected = { path: row.dataset.path, type: row.dataset.type, name: row.dataset.name };
    });
    row.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      if (row.dataset.type === "dir") navigate(row.dataset.path);
      else openEditor(row.dataset.path);
    });
    const btn = (cls, fn) => { const b = row.querySelector("." + cls); if (b) b.addEventListener("click", (e) => { e.stopPropagation(); fn(); }); };
    btn("edit", () => openEditor(row.dataset.path));
    btn("ren", () => openRename(row.dataset.path, row.dataset.name));
    btn("dl", () => { window.location = api.downloadUrl(state.activeProfile.id, row.dataset.path); });
    btn("del", () => deleteItem(row.dataset.path, row.dataset.type === "dir", row.dataset.name));
  });
}

function updateStatus() {
  const items = state.items;
  $("#statusItems").textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
}

/* ---------- Ribbon actions ---------- */
function handleRibbon(action) {
  switch (action) {
    case "connect": {
      if (!state.profiles.length) openProfileModal();
      else toast("Select a connection on the left or in the dropdown.", "info");
      break;
    }
    case "new-profile": openProfileModal(); break;
    case "upload": triggerUpload(); break;
    case "new-folder": newFolder(); break;
    case "refresh": if (state.activeProfile) navigate(state.currentPath); break;
    case "back": goUp(); break;
  }
}

/* ---------- Profiles modal ---------- */
function openProfileModal(id) {
  $("#profileModal").classList.remove("hidden");
  $("#profileFormError").classList.add("hidden");
  const f = $("#profileForm");
  f.reset();
  f.dataset.id = id || "";
  $("#profileModalTitle").textContent = id ? "Edit Connection" : "New FTP Connection";
  f.querySelector('[name="port"]').value = id ? "" : 21;
}
function openEditProfile() {
  const p = state.profiles.find((x) => x.id === Number($("#profileSelect").value));
  if (p) openProfileModal(p.id);
}

$("#profileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#profileFormError");
  err.classList.add("hidden");
  const fd = new FormData(e.target);
  const body = Object.fromEntries(fd);
  body.port = Number(body.port) || 21;
  body.secure = !!body.secure;
  try {
    const id = e.target.dataset.id;
    await api.saveProfile(body, id || undefined);
    $("#profileModal").classList.add("hidden");
    await loadProfiles();
    toast("Profile saved.", "success");
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove("hidden");
  }
});
$("#testConnBtn")?.addEventListener("click", async () => {
  const err = $("#profileFormError");
  err.classList.add("hidden");
  const fd = new FormData($("#profileForm"));
  const body = Object.fromEntries(fd);
  body.port = Number(body.port) || 21;
  body.secure = !!body.secure;
  // Save first if new, otherwise test existing
  let id = $("#profileForm").dataset.id;
  if (!id) {
    try { const r = await api.saveProfile(body); id = r.id; $("#profileForm").dataset.id = id; await loadProfiles(); }
    catch (ex) { err.textContent = ex.message; err.classList.remove("hidden"); return; }
  } else {
    try { await api.saveProfile(body, id); } catch (ex) { err.textContent = ex.message; err.classList.remove("hidden"); return; }
  }
  try {
    const r = await api.testProfile(id);
    toast(r.message || "Connection successful", "success");
  } catch (ex) {
    toast("Test failed: " + ex.message, "error");
  }
});

async function deleteCurrentProfile() {
  const id = Number($("#profileSelect").value);
  if (!id) return;
  if (!confirm("Delete this saved connection?")) return;
  try {
    await api.deleteProfile(id);
    if (state.activeProfile?.id === id) { state.activeProfile = null; $("#fileList").innerHTML = ""; $("#emptyState").classList.remove("hidden"); $("#statusConn").textContent = "Not connected"; }
    await loadProfiles();
    toast("Profile deleted.", "success");
  } catch (e) { toast(e.message, "error"); }
}

/* ---------- File operations ---------- */
async function newFolder() {
  if (!state.activeProfile) return toast("Connect to a server first.", "error");
  const name = prompt("New folder name:", "New Folder");
  if (!name) return;
  const path = state.currentPath.endsWith("/") ? state.currentPath + name : state.currentPath + "/" + name;
  try {
    await api.mkdir(state.activeProfile.id, path);
    navigate(state.currentPath);
    toast("Folder created.", "success");
  } catch (e) { toast(e.message, "error"); }
}

async function deleteItem(path, isDir, name) {
  if (!confirm(`Delete ${isDir ? "folder" : "file"} "${name}"?\n${isDir ? "All contents will be removed." : ""}`)) return;
  try {
    await api.del(state.activeProfile.id, path, isDir);
    navigate(state.currentPath);
    toast("Deleted.", "success");
  } catch (e) { toast(e.message, "error"); }
}

function openRename(path, name) {
  $("#renameModal").classList.remove("hidden");
  $("#renameInput").value = path;
  $("#renameForm").dataset.from = path;
}
$("#renameForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const from = e.target.dataset.from;
  const to = $("#renameInput").value;
  try {
    await api.rename(state.activeProfile.id, from, to);
    $("#renameModal").classList.add("hidden");
    navigate(state.currentPath);
    toast("Renamed.", "success");
  } catch (ex) { toast(ex.message, "error"); }
});

/* ---------- Upload ---------- */
function triggerUpload() {
  if (!state.activeProfile) return toast("Connect to a server first.", "error");
  $("#fileInput").click();
}
$("#fileInput")?.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files);
  if (files.length) await uploadFiles(files);
  e.target.value = "";
});
async function uploadFiles(files) {
  if (!state.activeProfile) return;
  const dir = state.currentPath;
  for (const f of files) addQueueItem(f.name, "upload", "active");
  try {
    await api.upload(state.activeProfile.id, dir, files);
    files.forEach((f) => completeQueueItem(f.name, "done"));
    navigate(dir);
    toast(`Uploaded ${files.length} file(s).`, "success");
  } catch (e) {
    files.forEach((f) => completeQueueItem(f.name, "error", e.message));
    toast("Upload error: " + e.message, "error");
  }
}

/* ---------- Queue ---------- */
function addQueueItem(name, dir, status) {
  const el = $("#queueList");
  if (el.querySelector(".queue-empty")) el.innerHTML = "";
  const item = document.createElement("div");
  item.className = "queue-item";
  item.dataset.name = name;
  item.innerHTML = `
    <div class="qi-name">${dir === "upload" ? "⬆" : "⬇"} ${escapeHtml(name)}</div>
    <div class="qi-meta">${escapeHtml(state.currentPath)}</div>
    <div class="qi-bar"><div class="qi-fill" style="width:30%"></div></div>
    <div class="qi-status ${status}">${status}</div>`;
  el.prepend(item);
}
function completeQueueItem(name, status, msg) {
  const items = $$(`#queueList .queue-item`);
  for (const it of items) {
    if (it.dataset.name === name) {
      it.querySelector(".qi-status").className = "qi-status " + status;
      it.querySelector(".qi-status").textContent = status === "done" ? "complete" : "error: " + (msg || "");
      it.querySelector(".qi-fill").style.width = "100%";
      return;
    }
  }
}

/* ---------- Editor ---------- */
async function openEditor(path) {
  showLoading("Opening " + path);
  try {
    const { content } = await api.read(state.activeProfile.id, path);
    const normalized = content.replace(/\r\n/g, "\n");
    state.editor = { path, content: normalized, dirty: false };
    $("#editorPath").textContent = path;
    $("#editorTitle").textContent = "Edit - " + path.split("/").pop();
    $("#editorTextarea").value = normalized;
    $("#editorDirty").classList.add("hidden");
    $("#editorModal").classList.remove("hidden");
  } catch (e) {
    toast("Cannot open file: " + e.message, "error");
  } finally {
    hideLoading();
  }
}
async function saveEditedFile() {
  if (!state.activeProfile || !state.editor.path) return;
  const content = $("#editorTextarea").value;
  try {
    await api.saveText(state.activeProfile.id, state.editor.path, content);
    state.editor.content = content;
    state.editor.dirty = false;
    $("#editorDirty").classList.add("hidden");
    toast("File saved.", "success");
  } catch (e) { toast("Save failed: " + e.message, "error"); }
}

/* ---------- Modals close ---------- */
function bindModals() {
  $$("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest(".modal").classList.add("hidden")));
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); }));
  const sb = $("#settingsBtn");
  if (sb) sb.addEventListener("click", () => {
    $("#settingsApiBase").value = api.apiBase || "";
    $("#settingsModal").classList.remove("hidden");
  });
  const sf = $("#settingsForm");
  if (sf) sf.addEventListener("submit", (e) => {
    e.preventDefault();
    api.setApiBase($("#settingsApiBase").value.trim());
    location.reload();
  });
}

/* ---------- Drag & drop ---------- */
function bindDragDrop() {
  let overlay = null;
  const show = () => {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "drop-overlay";
    overlay.innerHTML = '<div class="drop-msg">Drop files here to upload</div>';
    document.body.appendChild(overlay);
  };
  const hide = () => { if (overlay) { overlay.remove(); overlay = null; } };
  ["dragenter", "dragover"].forEach((ev) => window.addEventListener(ev, (e) => {
    if (!state.activeProfile) return;
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault(); show();
    }
  }));
  ["dragleave", "drop"].forEach((ev) => window.addEventListener(ev, (e) => { if (ev === "dragleave" && e.relatedTarget) return; hide(); }));
  window.addEventListener("drop", async (e) => {
    if (!state.activeProfile) return;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) { e.preventDefault(); await uploadFiles(files); }
  });
}

/* ---------- Activity log ---------- */
async function refreshActivity() {
  if (!state.user) return;
  try {
    const rows = await api.activity();
    const el = $("#activityLog");
    el.innerHTML = rows.map((r) => {
      const t = new Date(r.created_at + "Z").toLocaleTimeString();
      const cls = r.status === "error" ? "error" : "";
      return `<div class="log-line ${cls}"><span class="lt">${t}</span> <span class="lm">${escapeHtml(r.action)}</span> ${escapeHtml(r.detail || "")}</div>`;
    }).join("");
  } catch {}
}

/* ---------- Misc UI ---------- */
function showLoading(msg) { $("#loadingOverlay").classList.remove("hidden"); $("#loadingText").textContent = msg || "Working..."; }
function hideLoading() { $("#loadingOverlay").classList.add("hidden"); }

function toast(msg, type = "info") {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = "position:fixed;bottom:34px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:6px;font-size:13px;z-index:300;box-shadow:0 6px 20px rgba(0,0,0,0.4);max-width:80vw;";
    document.body.appendChild(t);
  }
  t.style.background = type === "error" ? "#d13438" : type === "success" ? "#107c10" : "#0078d4";
  t.style.color = "#fff";
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.transition = "opacity 0.5s"; t.style.opacity = "0"; }, 3500);
}

function refreshClock() {
  $("#statusTime").textContent = new Date().toLocaleTimeString();
}

boot();
