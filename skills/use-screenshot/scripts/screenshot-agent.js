#!/usr/bin/env node
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ERR_NOT_FOUND = 'no image found';
const CLIPBOARD_MAX_BUFFER = 50 * 1024 * 1024;

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message || String(err));
    printUsage(process.stderr);
    process.exit(2);
  }
  if (opts.help) {
    printUsage(process.stdout);
    return;
  }

  run(opts)
    .then((result) => {
      if (!result) {
        process.exit(1);
      }
      process.stdout.write(result.source + '\n' + result.tempPath + '\n');
    })
    .catch((err) => {
      if (err && err.code === ERR_NOT_FOUND) {
        process.exit(1);
      }
      console.error(err && err.message ? err.message : String(err));
      process.exit(2);
    });
}

function parseArgs(args) {
  const opts = {
    clipboardOnly: false,
    useDownloads: false,
    verbose: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--clipboard-only') {
      opts.clipboardOnly = true;
    } else if (arg === '--downloads') {
      opts.useDownloads = true;
    } else if (arg === '--verbose' || arg === '-v') {
      opts.verbose = true;
    } else if (arg === '--help' || arg === '-h' || arg === '-help') {
      opts.help = true;
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return opts;
}

function printUsage(stream) {
  stream.write('usage: screenshot-agent [options]\n\n');
  stream.write('Print two lines: source (clipboard or original file path) and\n');
  stream.write('the temp path of a PNG/JPG/JPEG image from Desktop or Downloads.\n');
  stream.write('Desktop files are copied to temp and trashed; Downloads are moved.\n');
  stream.write('Exits 1 if nothing is found.\n\n');
  stream.write('options:\n');
  stream.write('  -h, -help, --help    show this help and exit\n');
  stream.write('  --clipboard-only      use clipboard only (no file fallback)\n');
  stream.write('  --downloads          search Downloads instead of Desktop\n');
  stream.write('  -v, --verbose         verbose logging to stderr\n');
}

async function run(opts) {
  const clipboardResult = await readClipboardImage().catch((err) => err);
  if (opts.clipboardOnly) {
    if (clipboardResult && clipboardResult.data) {
      log(opts, 'selected clipboard candidate (clipboard-only)');
      return handleClipboardCandidate(clipboardResult);
    }
    if (clipboardResult && clipboardResult.code !== ERR_NOT_FOUND) {
      throw clipboardResult;
    }
    return null;
  }

  const fileResult = await findFallbackImage(opts.useDownloads).catch((err) => err);
  const now = Date.now();

  if (clipboardResult && clipboardResult.data && fileResult && fileResult.path) {
    if (preferFileCandidate(fileResult, now)) {
      log(opts, `selected file candidate: ${fileResult.path}`);
      return handleFileCandidate(fileResult, opts);
    }
    log(opts, 'selected clipboard candidate');
    return handleClipboardCandidate(clipboardResult);
  }

  if (clipboardResult && clipboardResult.data) {
    log(opts, 'selected clipboard candidate (file missing)');
    return handleClipboardCandidate(clipboardResult);
  }

  if (fileResult && fileResult.path) {
    log(opts, `selected file candidate (clipboard missing): ${fileResult.path}`);
    return handleFileCandidate(fileResult, opts);
  }

  if (fileResult && fileResult.code && fileResult.code !== ERR_NOT_FOUND) {
    throw fileResult;
  }
  if (clipboardResult && clipboardResult.code && clipboardResult.code !== ERR_NOT_FOUND) {
    throw clipboardResult;
  }
  return null;
}

function log(opts, message) {
  if (!opts.verbose) return;
  process.stderr.write(message + '\n');
}

function preferFileCandidate(candidate, nowMs) {
  if (!candidate || !candidate.modTimeMs) return false;
  if (candidate.modTimeMs > nowMs) return true;
  return nowMs - candidate.modTimeMs <= 30 * 1000;
}

async function handleClipboardCandidate(candidate) {
  const tempPath = await writeClipboardToTemp(candidate.data);
  return { source: 'clipboard', tempPath };
}

async function handleFileCandidate(candidate, opts) {
  const source = candidate.path;
  if (opts.useDownloads) {
    log(opts, `moving Downloads file to temp: ${candidate.path}`);
    const tempPath = await moveImageToTemp(candidate.path);
    return { source, tempPath };
  }
  log(opts, `copying Desktop file to temp and trashing: ${candidate.path}`);
  const tempPath = await copyImageToTemp(candidate.path);
  try {
    await trashFile(candidate.path);
  } catch (err) {
    await safeUnlink(tempPath);
    throw err;
  }
  return { source, tempPath };
}

async function readClipboardImage() {
  const tmp = await tempPath('clipboard-XXXXXX.png');
  const cleanup = async () => safeUnlink(tmp);

  try {
    if (commandExists('pngpaste')) {
      try {
        execFileSync('pngpaste', [tmp], { stdio: 'ignore' });
        if (await fileHasContent(tmp)) {
          const data = await fsp.readFile(tmp);
          await cleanup();
          return { data };
        }
      } catch (err) {
        // fall through to other methods
      }
    }

    if (process.platform === 'darwin' && commandExists('osascript')) {
      try {
        const safeTmp = tmp.replace(/"/g, '\\"');
        const script = [
          'set theData to (the clipboard as «class PNGf»)',
          `set theFile to POSIX file "${safeTmp}"`,
          'set theFileRef to open for access theFile with write permission',
          'set eof of theFileRef to 0',
          'write theData to theFileRef',
          'close access theFileRef',
        ];
        const args = [];
        for (const line of script) {
          args.push('-e', line);
        }
        execFileSync('osascript', args, { stdio: 'ignore' });
        if (await fileHasContent(tmp)) {
          const data = await fsp.readFile(tmp);
          await cleanup();
          return { data };
        }
      } catch (err) {
        // fall through
      }
    }

    if (commandExists('wl-paste')) {
      try {
        const data = execFileSync('wl-paste', ['--type', 'image/png'], {
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: CLIPBOARD_MAX_BUFFER,
        });
        if (data && data.length > 0) {
          await cleanup();
          return { data };
        }
      } catch (err) {
        // fall through
      }
    }

    if (commandExists('xclip')) {
      try {
        const data = execFileSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'], {
          stdio: ['ignore', 'pipe', 'ignore'],
          maxBuffer: CLIPBOARD_MAX_BUFFER,
        });
        if (data && data.length > 0) {
          await cleanup();
          return { data };
        }
      } catch (err) {
        // fall through
      }
    }
  } finally {
    await cleanup();
  }

  const err = new Error(ERR_NOT_FOUND);
  err.code = ERR_NOT_FOUND;
  throw err;
}

async function writeClipboardToTemp(data) {
  const tempPath = await tempMovePath('clipboard-*.png');
  await fsp.writeFile(tempPath, data);
  return path.resolve(tempPath);
}

async function findFallbackImage(useDownloads) {
  const fallbackDir = await locateFallbackDir(useDownloads);
  return latestImage(fallbackDir);
}

async function copyImageToTemp(src) {
  const ext = normalizeExt(path.extname(src));
  const tempPath = await tempMovePath(`image-*${ext}`);
  await copyFile(src, tempPath);
  return path.resolve(tempPath);
}

async function moveImageToTemp(src) {
  const ext = normalizeExt(path.extname(src));
  const tempPath = await tempMovePath(`image-*${ext}`);
  await moveFile(src, tempPath);
  return path.resolve(tempPath);
}

async function locateFallbackDir(useDownloads) {
  if (useDownloads) {
    return locateDownloads();
  }
  return locateDesktop();
}

async function locateDesktop() {
  const home = os.homedir();
  const defaultDesktop = path.join(home, 'Desktop');
  if (await isDir(defaultDesktop)) {
    return defaultDesktop;
  }
  if (process.platform === 'linux') {
    const dir = await xdgUserDir(home, 'DESKTOP');
    if (dir && (await isDir(dir))) {
      return dir;
    }
  }
  throw notFoundError();
}

async function locateDownloads() {
  const home = os.homedir();
  const defaultDownloads = path.join(home, 'Downloads');
  if (await isDir(defaultDownloads)) {
    return defaultDownloads;
  }
  if (process.platform === 'linux') {
    const dir = await xdgUserDir(home, 'DOWNLOAD');
    if (dir && (await isDir(dir))) {
      return dir;
    }
  }
  throw notFoundError();
}

async function xdgUserDir(home, key) {
  const configPath = path.join(home, '.config', 'user-dirs.dirs');
  let data;
  try {
    data = await fsp.readFile(configPath, 'utf8');
  } catch (err) {
    return '';
  }
  const prefix = `XDG_${key}_DIR=`;
  for (const rawLine of data.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith(prefix)) continue;
    let value = line.slice(prefix.length).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    value = value.replace(/\$\{HOME\}/g, home).replace(/\$HOME/g, home);
    if (value.startsWith('~')) {
      value = path.join(home, value.slice(1));
    }
    if (!value) return '';
    if (!path.isAbsolute(value)) {
      value = path.join(home, value);
    }
    return path.normalize(value);
  }
  return '';
}

async function latestImage(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw notFoundError();
    }
    throw err;
  }

  let latestTagged = null;
  let latestTaggedTime = 0;
  let latestAny = null;
  let latestAnyTime = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!hasImageExt(name)) continue;
    const fullPath = path.join(dir, name);
    let info;
    try {
      info = await fsp.stat(fullPath);
    } catch (err) {
      continue;
    }
    if (!info.isFile()) continue;
    const modTimeMs = info.mtimeMs;
    const candidate = { path: fullPath, modTimeMs };
    if (isScreenshotName(name)) {
      if (!latestTagged || modTimeMs > latestTaggedTime) {
        latestTagged = candidate;
        latestTaggedTime = modTimeMs;
      }
      continue;
    }
    if (!latestAny || modTimeMs > latestAnyTime) {
      latestAny = candidate;
      latestAnyTime = modTimeMs;
    }
  }

  if (latestTagged) return latestTagged;
  if (latestAny) return latestAny;
  throw notFoundError();
}

function hasImageExt(name) {
  switch (path.extname(name).toLowerCase()) {
    case '.png':
    case '.jpg':
    case '.jpeg':
      return true;
    default:
      return false;
  }
}

function isScreenshotName(name) {
  const lower = name.toLowerCase();
  return lower.includes('screenshot') || lower.includes('screen shot');
}

async function tempMovePath(pattern) {
  return uniqueTempPath(pattern);
}

async function tempPath(pattern) {
  return uniqueTempPath(pattern);
}

async function moveFile(src, dst) {
  try {
    await fsp.rename(src, dst);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      await copyAndRemove(src, dst);
      return;
    }
    throw err;
  }
}

async function copyFile(src, dst) {
  await fsp.copyFile(src, dst);
}

async function copyAndRemove(src, dst) {
  await copyFile(src, dst);
  await fsp.unlink(src);
}

async function trashFile(filePath) {
  const absPath = path.resolve(filePath);
  if (process.platform === 'darwin') {
    return trashDarwin(absPath);
  }
  if (process.platform === 'linux') {
    return trashLinux(absPath);
  }
  throw new Error(`trash unsupported on ${process.platform}`);
}

async function trashDarwin(absPath) {
  const home = os.homedir();
  const trashDir = path.join(home, '.Trash');
  await fsp.mkdir(trashDir, { recursive: true, mode: 0o700 });
  const name = await uniqueTrashName(path.basename(absPath), trashDir, '');
  const dest = path.join(trashDir, name);
  await moveFile(absPath, dest);
}

async function trashLinux(absPath) {
  const home = os.homedir();
  const trashRoot = path.join(home, '.local', 'share', 'Trash');
  const filesDir = path.join(trashRoot, 'files');
  const infoDir = path.join(trashRoot, 'info');
  await fsp.mkdir(filesDir, { recursive: true, mode: 0o700 });
  await fsp.mkdir(infoDir, { recursive: true, mode: 0o700 });

  const name = await uniqueTrashName(path.basename(absPath), filesDir, infoDir);
  const dest = path.join(filesDir, name);
  await moveFile(absPath, dest);

  const infoPath = path.join(infoDir, `${name}.trashinfo`);
  const info = trashInfoContent(absPath, new Date());
  try {
    await fsp.writeFile(infoPath, info, { mode: 0o600 });
  } catch (err) {
    await moveFile(dest, absPath).catch(() => {});
    throw err;
  }
}

async function uniqueTrashName(base, filesDir, infoDir) {
  if (!base) {
    throw new Error('empty trash name');
  }
  if (!(await trashNameExists(base, filesDir, infoDir))) {
    return base;
  }
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  for (let i = 1; i < 10000; i += 1) {
    const name = `${stem}.${i}${ext}`;
    if (!(await trashNameExists(name, filesDir, infoDir))) {
      return name;
    }
  }
  throw new Error('unable to find unique trash name');
}

async function trashNameExists(name, filesDir, infoDir) {
  if (await exists(path.join(filesDir, name))) {
    return true;
  }
  if (!infoDir) return false;
  return exists(path.join(infoDir, `${name}.trashinfo`));
}

async function exists(checkPath) {
  try {
    await fsp.stat(checkPath);
    return true;
  } catch (err) {
    return err && err.code !== 'ENOENT';
  }
}

function trashInfoContent(absPath, deletedAt) {
  return `[Trash Info]\nPath=${trashEscapePath(absPath)}\nDeletionDate=${formatTrashDate(deletedAt)}\n`;
}

function trashEscapePath(filePath) {
  return encodeURI(filePath).replace(/%2F/gi, '/');
}

function formatTrashDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function normalizeExt(ext) {
  if (!ext) return '.png';
  const lower = ext.toLowerCase();
  if (lower === '.png' || lower === '.jpg' || lower === '.jpeg') return lower;
  return '.png';
}

async function isDir(checkPath) {
  try {
    const info = await fsp.stat(checkPath);
    return info.isDirectory();
  } catch (err) {
    return false;
  }
}

async function fileHasContent(filePath) {
  try {
    const info = await fsp.stat(filePath);
    return info.isFile() && info.size > 0;
  } catch (err) {
    return false;
  }
}

function commandExists(cmd) {
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, cmd);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return true;
    } catch (err) {
      // keep looking
    }
  }
  if (process.platform === 'win32') {
    const pathExt = (process.env.PATHEXT || '').split(';').filter(Boolean);
    for (const ext of pathExt) {
      for (const dir of pathEnv.split(path.delimiter)) {
        if (!dir) continue;
        const full = path.join(dir, cmd + ext.toLowerCase());
        try {
          fs.accessSync(full, fs.constants.X_OK);
          return true;
        } catch (err) {
          // keep looking
        }
      }
    }
  }
  return false;
}

async function safeUnlink(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    // ignore
  }
}

function notFoundError() {
  const err = new Error(ERR_NOT_FOUND);
  err.code = ERR_NOT_FOUND;
  return err;
}

async function uniqueTempPath(pattern) {
  const { prefix, suffix } = splitPattern(pattern);
  for (let i = 0; i < 20; i += 1) {
    const name = `${prefix}${randomToken()}${suffix}`;
    const full = path.join(os.tmpdir(), name);
    try {
      await fsp.stat(full);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return full;
      }
    }
  }
  throw new Error('unable to generate temp path');
}

function splitPattern(pattern) {
  const match = pattern.match(/^(.*?)([*X]+)(.*)$/);
  if (!match) {
    return { prefix: pattern, suffix: '' };
  }
  return { prefix: match[1], suffix: match[3] };
}

function randomToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

main();
