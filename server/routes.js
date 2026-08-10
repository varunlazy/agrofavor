import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { signToken, authRequired, hashPassword, logActivity } from "./auth.js";
import { encrypt, decrypt } from "./crypto.js";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

/* ---------------- Auth ---------------- */
router.post("/auth/register", (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (password.length < 6) return res.status(400).json({ error: "password must be at least 6 characters" });
  if (db.prepare("SELECT id FROM users WHERE username = ?").get(username))
    return res.status(409).json({ error: "username already taken" });
  const info = db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES (?,?,?)"
  ).run(username, email || null, hashPassword(password));
  const user = db.prepare("SELECT id, username, email FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.json({ user, token: signToken(user) });
});

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: "invalid credentials" });
  logActivity(user.id, null, "login", `User ${user.username} logged in`, "success");
  const safe = { id: user.id, username: user.username, email: user.email };
  res.json({ user: safe, token: signToken(safe) });
});

router.get("/auth/me", authRequired, (req, res) => res.json({ user: req.user }));

/* ---------------- Profiles ---------------- */
router.get("/profiles", authRequired, (req, res) => {
  const rows = db.prepare(
    "SELECT id, name, host, port, protocol, username, remote_path, secure, created_at, last_used FROM ftp_profiles WHERE user_id = ? ORDER BY name"
  ).all(req.user.id);
  res.json(rows);
});

router.post("/profiles", authRequired, (req, res) => {
  const { name, host, port, protocol, username, password, remote_path, secure } = req.body || {};
  if (!name || !host) return res.status(400).json({ error: "name and host required" });
  const info = db.prepare(
    `INSERT INTO ftp_profiles (user_id, name, host, port, protocol, username, password, remote_path, secure)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    req.user.id, name, host, port || 21, (protocol || "ftp").toLowerCase(),
    username || "", encrypt(password || ""), remote_path || "/", secure ? 1 : 0
  );
  logActivity(req.user.id, info.lastInsertRowid, "profile.create", name, "success");
  res.json({ id: info.lastInsertRowid, ok: true });
});

router.put("/profiles/:id", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM ftp_profiles WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "profile not found" });
  const { name, host, port, protocol, username, password, remote_path, secure } = req.body || {};
  db.prepare(
    `UPDATE ftp_profiles SET name=?, host=?, port=?, protocol=?, username=?, password=?, remote_path=?, secure=? WHERE id=?`
  ).run(
    name ?? row.name, host ?? row.host, port ?? row.port, (protocol || row.protocol).toLowerCase(),
    username ?? row.username,
    password !== undefined ? encrypt(password) : row.password,
    remote_path ?? row.remote_path, secure !== undefined ? (secure ? 1 : 0) : row.secure,
    req.params.id
  );
  logActivity(req.user.id, row.id, "profile.update", name || row.name, "success");
  res.json({ ok: true });
});

router.delete("/profiles/:id", authRequired, (req, res) => {
  const row = db.prepare("SELECT id, name FROM ftp_profiles WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: "profile not found" });
  db.prepare("DELETE FROM ftp_profiles WHERE id = ?").run(req.params.id);
  logActivity(req.user.id, req.params.id, "profile.delete", row.name, "success");
  res.json({ ok: true });
});

/* ---------------- Activity log ---------------- */
router.get("/activity", authRequired, (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"
  ).all(req.user.id);
  res.json(rows);
});

/* ---------------- Resolve a full profile (decrypted) ---------------- */
function getProfile(req) {
  const row = db.prepare("SELECT * FROM ftp_profiles WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return null;
  db.prepare("UPDATE ftp_profiles SET last_used = datetime('now') WHERE id = ?").run(row.id);
  return { ...row, password: decrypt(row.password) };
}

/* ---------------- FTP operations ---------------- */
const ftp = (await import("./ftpClient.js"));

router.post("/profiles/:id/test", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    await ftp.withConnection(profile, async () => "ok");
    logActivity(req.user.id, profile.id, "connection.test", profile.host, "success");
    res.json({ ok: true, message: "Connection successful" });
  } catch (e) {
    logActivity(req.user.id, profile.id, "connection.test", profile.host, "error: " + e.message);
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get("/profiles/:id/list", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  const dir = req.query.path || profile.remote_path || "/";
  try {
    const items = await ftp.listRemote(profile, dir);
    logActivity(req.user.id, profile.id, "list", dir, "success");
    res.json({ path: dir, items });
  } catch (e) {
    logActivity(req.user.id, profile.id, "list", dir, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

router.post("/profiles/:id/mkdir", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    await ftp.makeDir(profile, req.body.path);
    logActivity(req.user.id, profile.id, "mkdir", req.body.path, "success");
    res.json({ ok: true });
  } catch (e) {
    logActivity(req.user.id, profile.id, "mkdir", req.body.path, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

router.post("/profiles/:id/delete", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    await ftp.deleteRemote(profile, req.body.path, req.body.isDir);
    logActivity(req.user.id, profile.id, "delete", req.body.path, "success");
    res.json({ ok: true });
  } catch (e) {
    logActivity(req.user.id, profile.id, "delete", req.body.path, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

router.post("/profiles/:id/rename", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    await ftp.renameRemote(profile, req.body.from, req.body.to);
    logActivity(req.user.id, profile.id, "rename", `${req.body.from} -> ${req.body.to}`, "success");
    res.json({ ok: true });
  } catch (e) {
    logActivity(req.user.id, profile.id, "rename", req.body.from, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

router.post("/profiles/:id/upload", authRequired, upload.array("files"), async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  const dir = req.body.path || "/";
  try {
    for (const file of req.files) {
      const remote = dir.endsWith("/") ? dir + file.originalname : dir + "/" + file.originalname;
      const { Readable } = await import("stream");
      await ftp.uploadFile(profile, Readable.from(file.buffer), remote);
      logActivity(req.user.id, profile.id, "upload", remote, "success");
    }
    res.json({ ok: true, count: req.files.length });
  } catch (e) {
    logActivity(req.user.id, profile.id, "upload", dir, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

router.get("/profiles/:id/download", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  const remotePath = req.query.path;
  if (!remotePath) return res.status(400).json({ error: "path required" });
  try {
    const name = remotePath.split("/").pop();
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    logActivity(req.user.id, profile.id, "download", remotePath, "success");
    await ftp.downloadFile(profile, remotePath, res);
  } catch (e) {
    logActivity(req.user.id, profile.id, "download", remotePath, "error: " + e.message);
    if (!res.headersSent) res.status(400).json({ error: e.message });
  }
});

router.post("/profiles/:id/chmod", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    await ftp.chmodRemote(profile, req.body.path, req.body.mode);
    logActivity(req.user.id, profile.id, "chmod", `${req.body.path} ${req.body.mode}`, "success");
    res.json({ ok: true });
  } catch (e) {
    logActivity(req.user.id, profile.id, "chmod", req.body.path, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

router.get("/profiles/:id/read", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    const content = await ftp.readTextFile(profile, req.query.path);
    res.json({ content, path: req.query.path });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/profiles/:id/save", authRequired, async (req, res) => {
  const profile = getProfile(req);
  if (!profile) return res.status(404).json({ error: "profile not found" });
  try {
    await ftp.writeTextFile(profile, req.body.path, req.body.content);
    logActivity(req.user.id, profile.id, "edit.save", req.body.path, "success");
    res.json({ ok: true });
  } catch (e) {
    logActivity(req.user.id, profile.id, "edit.save", req.body.path, "error: " + e.message);
    res.status(400).json({ error: e.message });
  }
});

export default router;
