import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}
export function verifyPassword(pw, hash) {
  return bcrypt.compareSync(pw, hash);
}
export function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: "7d" });
}
export function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare("SELECT id, username, email FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ error: "Invalid session" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function logActivity(userId, profileId, action, detail, status = "success") {
  db.prepare(
    "INSERT INTO activity_log (user_id, profile_id, action, detail, status) VALUES (?,?,?,?,?)"
  ).run(userId, profileId || null, action, detail || "", status);
}
