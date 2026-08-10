# SmartFTP Web

A professional, SmartFTP-inspired web-based FTP / FTPS / SFTP client.

Users first sign in (or create an account), then save multiple remote-server
credentials as "profiles", connect to them, and fully manage remote files
(browse, create, edit, upload, download, rename, delete, chmod) — all from the
browser.

## Features

- **Authentication** — register / login with JWT sessions (bcrypt-hashed passwords).
- **Saved connections** — store any number of FTP/FTPS/SFTP profiles per user.
  Passwords are encrypted at rest with AES-256-GCM.
- **Multi-protocol** — FTP, FTPS (FTP over SSL/TLS), and SFTP (over SSH).
- **File operations** — list, navigate, upload (multi-file + drag & drop),
  download, inline text editing with save, new folder, rename/move, delete
  (files & directories), and chmod (SFTP / FTP SITE CHMOD).
- **SmartFTP-style UI** — ribbon toolbar, connection/address bar, dual-pane
  layout (saved connections + activity log | remote file table | transfer
  queue), status bar, and modals for profile editing and the code editor.
- **Activity log** — every connection and file operation is recorded.
- **Transfer queue** — visual upload/download tracking.

## Tech stack

- **Backend:** Node.js + Express, ES modules
- **Database:** SQLite (via `better-sqlite3`)
- **Auth:** `bcryptjs` + `jsonwebtoken`
- **FTP/FTPS:** `basic-ftp`
- **SFTP:** `ssh2-sftp-client`
- **Crypto:** Node `crypto` (AES-256-GCM)
- **Frontend:** vanilla HTML/CSS/JS (ES modules), no build step

## Setup

```bash
npm install
cp .env .env        # then edit JWT_SECRET and ENCRYPTION_KEY
npm start           # default port 12000
```

Then open `http://localhost:12000`, create an account, and add a connection.

## Environment variables (`.env`)

| Variable         | Description                              | Default            |
|------------------|------------------------------------------|--------------------|
| `PORT`           | Server listen port                       | `12000`            |
| `JWT_SECRET`     | Secret for signing auth tokens           | `dev-secret-...`   |
| `ENCRYPTION_KEY` | 32-byte key for encrypting FTP passwords | `default-dev-key…` |
| `DB_PATH`        | SQLite file path                         | `data/app.db`      |

> Change `JWT_SECRET` and `ENCRYPTION_KEY` before any real deployment.

## API overview

All `/api/*` routes (except `auth/register` and `auth/login`) require an
`Authorization: Bearer <token>` header.

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/profiles
POST   /api/profiles
PUT    /api/profiles/:id
DELETE /api/profiles/:id
POST   /api/profiles/:id/test
GET    /api/profiles/:id/list?path=
POST   /api/profiles/:id/mkdir
POST   /api/profiles/:id/delete
POST   /api/profiles/:id/rename
POST   /api/profiles/:id/upload       (multipart: path, files[])
GET    /api/profiles/:id/download?path=
POST   /api/profiles/:id/chmod
GET    /api/profiles/:id/read?path=
POST   /api/profiles/:id/save
GET    /api/activity
```

## Project structure

```
server.js          # Express app entry
server/db.js       # SQLite schema + connection
server/auth.js     # bcrypt hashing, JWT signing/verify, auth middleware
server/crypto.js   # AES-256-GCM encrypt/decrypt for stored passwords
server/ftpClient.js# FTP/FTPS/SFTP connection + operations wrapper
server/routes.js   # all API route handlers
public/index.html  # login + client UI markup
public/css/*.css   # SmartFTP theme + app styling
public/js/api.js   # fetch-based API client
public/js/app.js   # client-side application logic
```
