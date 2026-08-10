import * as ftp from "basic-ftp";
import Client from "ssh2-sftp-client";

/**
 * Resolve default port for a protocol.
 */
export function defaultPort(protocol) {
  if (protocol === "sftp") return 22;
  if (protocol === "ftps") return 990;
  return 21;
}

/**
 * Normalize a list entry from basic-ftp into a common shape.
 */
function normalizeFtpEntry(entry, basePath) {
  const name = entry.name;
  const full = basePath && !basePath.endsWith("/") ? basePath + "/" + name : basePath + name;
  let perms = entry.permissions;
  if (perms && typeof perms === "object") {
    const { user, group, other } = perms;
    perms = [user, group, other].filter(Boolean).join("");
  }
  return {
    name,
    path: full,
    type: entry.isDirectory ? "dir" : "file",
    size: entry.size || 0,
    modifiedAt: entry.modifiedAt ? new Date(entry.modifiedAt).toISOString() : null,
    permissions: perms || null,
    owner: entry.user || null,
    group: entry.group || null,
  };
}

/**
 * Connect to FTP / FTPS / SFTP and run an operation.
 * `op` receives a context { protocol, client, sftp } and must return a value.
 */
export async function withConnection(profile, op) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    const sftp = new Client();
    try {
      await sftp.connect({
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        readyTimeout: 20000,
      });
      return await op({ protocol, client: null, sftp });
    } finally {
      try { await sftp.end(); } catch {}
    }
  }

  // FTP / FTPS via basic-ftp
  const client = new ftp.Client(20000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: profile.host,
      port: profile.port,
      user: profile.username,
      password: profile.password,
      secure: protocol === "ftps" || !!profile.secure,
      secureOptions: { rejectUnauthorized: false },
    });
    return await op({ protocol, client, sftp: null });
  } finally {
    try { client.close(); } catch {}
  }
}

/**
 * List a remote directory.
 */
export async function listRemote(profile, dirPath) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => {
      const items = await sftp.list(dirPath);
      return items
        .filter((i) => i.name !== "." && i.name !== "..")
        .map((i) => ({
          name: i.name,
          path: joinPath(dirPath, i.name),
          type: i.type === "d" ? "dir" : "file",
          size: i.size,
          modifiedAt: i.modifyTime ? new Date(i.modifyTime * 1000).toISOString() : null,
          permissions: i.rights ? (i.rights.user || "") + (i.rights.group || "") + (i.rights.other || "") : null,
          owner: i.owner || null,
          group: i.group || null,
        }));
    });
  }
  return withConnection(profile, async ({ client }) => {
    await client.cd(dirPath);
    const listing = await client.list();
    return listing.map((e) => normalizeFtpEntry(e, dirPath));
  });
}

/**
 * Stat a single path (used to detect dir vs file before edits).
 */
export async function statRemote(profile, remotePath) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => {
      const info = await sftp.stat(remotePath);
      return { isDirectory: info.isDirectory, size: info.size };
    });
  }
  return withConnection(profile, async ({ client }) => {
    // basic-ftp has no direct stat; use list on parent and find the entry
    const parts = remotePath.split("/");
    const name = parts.pop();
    const parent = parts.join("/") || "/";
    const listing = await client.list(parent);
    const entry = listing.find((e) => e.name === name);
    if (!entry) throw new Error("Path not found");
    return { isDirectory: !!entry.isDirectory, size: entry.size || 0 };
  });
}

/**
 * Create a directory (including parents).
 */
export async function makeDir(profile, remotePath) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => sftp.mkdir(remotePath, true));
  }
  return withConnection(profile, async ({ client }) => client.ensureDir(remotePath));
}

/**
 * Delete a file or directory recursively.
 */
export async function deleteRemote(profile, remotePath, isDir) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => {
      if (isDir) return sftp.rmdir(remotePath, true);
      return sftp.delete(remotePath);
    });
  }
  return withConnection(profile, async ({ client }) => {
    if (isDir) return client.removeDir(remotePath);
    return client.remove(remotePath);
  });
}

/**
 * Rename / move a remote path.
 */
export async function renameRemote(profile, from, to) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => sftp.rename(from, to));
  }
  return withConnection(profile, async ({ client }) => client.rename(from, to));
}

/**
 * Upload a local readable stream to a remote path.
 */
export async function uploadFile(profile, source, remotePath) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => sftp.put(source, remotePath));
  }
  return withConnection(profile, async ({ client }) => client.uploadFrom(source, remotePath));
}

/**
 * Download a remote file to a local writable stream.
 * Resolves once all data has been written.
 */
export async function downloadFile(profile, remotePath, dest) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol === "sftp") {
    return withConnection(profile, async ({ sftp }) => {
      const result = await sftp.get(remotePath);
      // ssh2-sftp-client returns a Buffer when no dest is given, or a stream when {readStream:true}
      if (Buffer.isBuffer(result)) {
        await writeBufferTo(dest, result);
      } else {
        const done = streamToPromise(result, dest);
        result.pipe(dest);
        await done;
      }
    });
  }
  return withConnection(profile, async ({ client }) => {
    await client.downloadTo(dest, remotePath);
  });
}

/**
 * Get a file's text content.
 */
export async function readTextFile(profile, remotePath) {
  const { Writable } = await import("stream");
  const bufs = [];
  const sink = new Writable({
    write(chunk, _enc, cb) { bufs.push(chunk); cb(); },
  });
  await downloadFile(profile, remotePath, sink);
  return Buffer.concat(bufs).toString("utf8");
}

/**
 * Save text content back to a remote file.
 */
export async function writeTextFile(profile, remotePath, content) {
  const { Readable } = await import("stream");
  const stream = Readable.from(Buffer.from(content, "utf8"));
  await uploadFile(profile, stream, remotePath);
}

/**
 * Change permissions (chmod). Only supported on SFTP.
 */
export async function chmodRemote(profile, remotePath, mode) {
  const protocol = (profile.protocol || "ftp").toLowerCase();
  if (protocol !== "sftp") {
    // Try FTP SITE CHMOD
    return withConnection(profile, async ({ client }) => {
      await client.send(`SITE CHMOD ${mode} ${remotePath}`);
    });
  }
  return withConnection(profile, async ({ sftp }) => sftp.chmod(remotePath, parseInt(mode, 8)));
}

function joinPath(base, name) {
  if (!base) base = "/";
  if (base.endsWith("/")) return base + name;
  return base + "/" + name;
}

/**
 * Write a Buffer into a writable stream (works for HTTP responses and Writable).
 */
function writeBufferTo(dest, buffer) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(e);
    dest.on("error", onErr);
    if (typeof dest.write === "function" && typeof dest.end === "function") {
      const next = () => {
        dest.removeListener("error", onErr);
        resolve();
      };
      const ok = dest.write(buffer, "utf8", () => {});
      if (ok) { dest.end(() => next()); } else { dest.once("drain", () => { dest.end(() => next()); }); }
    } else {
      dest.removeListener("error", onErr);
      resolve();
    }
  });
}

/**
 * Resolve once a readable source has fully piped into dest and dest emitted 'finish'.
 */
function streamToPromise(source, dest) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      source.removeListener("error", onErr);
      dest.removeListener("error", onErr);
      dest.removeListener("finish", onDone);
    };
    const onErr = (err) => { cleanup(); reject(err); };
    const onDone = () => { cleanup(); resolve(); };
    source.on("error", onErr);
    dest.on("error", onErr);
    dest.on("finish", onDone);
  });
}

/**
 * Ensure a writable stream is ended (no-op if it's not a typical Writable).
 */
function endStream(dest) {
  return new Promise((resolve, reject) => {
    if (typeof dest.end === "function" && typeof dest.on === "function") {
      dest.on("error", reject);
      dest.on("finish", resolve);
      dest.on("close", resolve);
      try { dest.end(); } catch (e) { reject(e); }
    } else {
      resolve();
    }
  });
}
