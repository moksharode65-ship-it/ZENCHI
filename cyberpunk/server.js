const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'game-db.json');
const MAX_RUNS = 5000;

function defaultDb() {
  return {
    players: {},
    runs: [],
    meta: { createdAt: new Date().toISOString() }
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2), 'utf8');
  }
}

function readDb() {
  ensureDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return defaultDb();
    if (!parsed.players || typeof parsed.players !== 'object') parsed.players = {};
    if (!Array.isArray(parsed.runs)) parsed.runs = [];
    if (!parsed.meta || typeof parsed.meta !== 'object') parsed.meta = { createdAt: new Date().toISOString() };
    return parsed;
  } catch (e) {
    return defaultDb();
  }
}

function writeDb(db) {
  ensureDb();
  db.meta = db.meta || {};
  db.meta.lastUpdatedAt = new Date().toISOString();
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function sanitizeName(name) {
  const cleaned = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
  return cleaned;
}

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function extractBestWaveFromSave(saveData) {
  if (!saveData || typeof saveData !== 'object') return 0;
  let best = 0;

  if (Array.isArray(saveData.runHistory)) {
    for (const run of saveData.runHistory) {
      best = Math.max(best, Math.floor(toSafeNumber(run && run.wave, 0)));
    }
  }

  if (typeof saveData.bestWave === 'number') {
    best = Math.max(best, Math.floor(toSafeNumber(saveData.bestWave, 0)));
  }

  return best;
}

function createDefaultPlayer(name) {
  const now = new Date().toISOString();
  return {
    name,
    credits: 0,
    wave: 0,
    totalRuns: 0,
    lastRunAt: null,
    syncedAt: now,
    saveData: null
  };
}

function upsertPlayerFromSave(db, name, saveData) {
  const player = db.players[name] || createDefaultPlayer(name);
  const now = new Date().toISOString();
  const credits = Math.max(0, Math.floor(toSafeNumber(saveData && saveData.credits, player.credits || 0)));
  const bestWave = Math.max(player.wave || 0, extractBestWaveFromSave(saveData));

  player.name = name;
  player.credits = credits;
  player.wave = bestWave;
  player.syncedAt = now;
  player.saveData = saveData && typeof saveData === 'object' ? saveData : player.saveData;

  db.players[name] = player;
  return player;
}

function upsertPlayerFromRun(db, name, run, saveData) {
  const player = db.players[name] || createDefaultPlayer(name);
  const creditsFromSave = Math.max(0, Math.floor(toSafeNumber(saveData && saveData.credits, player.credits || 0)));
  const runWave = Math.max(0, Math.floor(toSafeNumber(run && run.wave, 0)));

  player.name = name;
  player.credits = creditsFromSave;
  player.wave = Math.max(player.wave || 0, runWave, extractBestWaveFromSave(saveData));
  player.totalRuns = Math.max(0, Math.floor(toSafeNumber(player.totalRuns, 0))) + 1;
  player.lastRunAt = (run && run.timestamp) ? String(run.timestamp) : new Date().toISOString();
  player.syncedAt = new Date().toISOString();
  if (saveData && typeof saveData === 'object') player.saveData = saveData;

  db.players[name] = player;
  return player;
}

function makeRunEntry(name, run) {
  return {
    id: crypto.randomUUID(),
    name,
    timestamp: run && run.timestamp ? String(run.timestamp) : new Date().toISOString(),
    won: !!(run && run.won),
    wave: Math.max(0, Math.floor(toSafeNumber(run && run.wave, 0))),
    score: Math.max(0, Math.floor(toSafeNumber(run && run.score, 0))),
    creditsEarned: Math.max(0, Math.floor(toSafeNumber(run && run.creditsEarned, 0))),
    kills: Math.max(0, Math.floor(toSafeNumber(run && run.kills, 0))),
    maxCombo: Math.max(0, Math.floor(toSafeNumber(run && run.maxCombo, 0)))
  };
}

function buildLeaderboard(db) {
  return Object.values(db.players)
    .map((p) => ({
      name: p.name,
      wave: Math.max(0, Math.floor(toSafeNumber(p.wave, 0))),
      credits: Math.max(0, Math.floor(toSafeNumber(p.credits, 0))),
      totalRuns: Math.max(0, Math.floor(toSafeNumber(p.totalRuns, 0))),
      lastRunAt: p.lastRunAt || p.syncedAt || null
    }))
    .sort((a, b) => {
      if (b.wave !== a.wave) return b.wave - a.wave;
      if (b.credits !== a.credits) return b.credits - a.credits;
      return String(b.lastRunAt || '').localeCompare(String(a.lastRunAt || ''));
    })
    .slice(0, 20);
}

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.post('/api/sync', (req, res) => {
  const saveData = (req.body && typeof req.body.data === 'object') ? req.body.data : null;
  const requestedName = sanitizeName(req.body && req.body.name);
  const fallbackFromSave = sanitizeName(saveData && saveData.pilotName);
  const name = requestedName || fallbackFromSave || `PILOT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  if (!saveData) {
    res.status(400).json({ success: false, error: 'Invalid save data payload' });
    return;
  }

  const db = readDb();
  const player = upsertPlayerFromSave(db, name, saveData);
  writeDb(db);

  res.json({
    success: true,
    name,
    syncedAt: player.syncedAt
  });
});

app.post('/api/run', (req, res) => {
  const run = (req.body && typeof req.body.run === 'object') ? req.body.run : null;
  const saveData = (req.body && typeof req.body.data === 'object') ? req.body.data : null;
  const requestedName = sanitizeName(req.body && req.body.name);
  const fallbackFromSave = sanitizeName(saveData && saveData.pilotName);
  const name = requestedName || fallbackFromSave || `PILOT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  if (!run) {
    res.status(400).json({ success: false, error: 'Invalid run payload' });
    return;
  }

  const db = readDb();
  const entry = makeRunEntry(name, run);
  db.runs.unshift(entry);
  if (db.runs.length > MAX_RUNS) db.runs.length = MAX_RUNS;

  upsertPlayerFromRun(db, name, run, saveData);
  writeDb(db);

  res.json({ success: true, runId: entry.id });
});

app.get('/api/leaderboard', (_req, res) => {
  const db = readDb();
  res.json({ entries: buildLeaderboard(db), updatedAt: new Date().toISOString() });
});

app.get('/api/player/:name', (req, res) => {
  const name = sanitizeName(req.params.name);
  if (!name) {
    res.status(400).json({ success: false, error: 'Invalid player name' });
    return;
  }

  const db = readDb();
  const player = db.players[name];
  if (!player) {
    res.status(404).json({ success: false, error: 'Player not found' });
    return;
  }

  res.json({ success: true, player });
});

app.use(express.static(ROOT_DIR, { extensions: ['html'] }));

app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  ensureDb();
  console.log(`Neon Dominion backend online at http://${HOST}:${PORT}`);
  console.log(`Data store: ${DB_FILE}`);
});