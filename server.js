import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "./server/db.js";

import apiRoutes from "./server/routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 12000;

// Base path when the app is served behind a reverse proxy at a subpath.
// Leave empty for root deployment. Set BASE_PATH=/agrofavor (or via env) when
// the reverse proxy passes the full path through (does not strip the prefix).
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(`${BASE_PATH}/api`, apiRoutes);
app.use(BASE_PATH, express.static(join(__dirname, "public")));

// SPA fallback to login/client
app.get(`${BASE_PATH}/*`, (req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`SmartFTP Web running on http://localhost:${PORT}${BASE_PATH}`);
});
