# AGENTS.md - Repository Memory

## Project: SmartFTP Web
A web-based FTP/FTPS/SFTP client with a SmartFTP-inspired theme. Users log in
first, then save and connect to remote FTP servers.

### Stack
- Node.js + Express (ES modules), SQLite (better-sqlite3)
- Auth: bcryptjs + jsonwebtoken; passwords AES-256-GCM encrypted at rest
- FTP/FTPS via `basic-ftp`; SFTP via `ssh2-sftp-client`
- Vanilla HTML/CSS/JS frontend (ES modules, no build step)

### Key files
- `server.js` — entry; serves `/api` routes + static `public/`
- `server/ftpClient.js` — connection wrapper + all remote file ops
- `server/routes.js` — API handlers; `getProfile()` decrypts password
- `public/index.html`, `public/js/app.js`, `public/js/api.js`, `public/css/*`

### Run
```bash
npm install && npm start   # port 12000
```
SQLite DB is created at `data/app.db` on first run.

### Gotchas learned
- Script tags loading ES-module JS must use `type="module"`.
- `ssh2-sftp-client` `get()` returns a Buffer (not a stream) when no dest arg
  is given; `downloadFile` handles both buffer and stream results.
- `basic-ftp` `downloadTo(writableStream, path)` ends the stream itself; do NOT
  call `dest.end()` again afterward or it hangs/errors.
- `basic-ftp` list entries expose `permissions` as an object `{user,group,other}`
  — normalize to a string before sending to the client.
- For file deletion on FTP, use `client.remove(path)` for files and
  `client.removeDir(path)` for directories (removeDir errors on files).

### Test servers used during verification
- `test.rebex.net:21` (FTP, demo/password) — read-only
- `test.rebex.net:22` (SFTP, demo/password) — read-only
- local `pyftpdlib` on port 2121 (testuser/testpass, writable) for write ops
