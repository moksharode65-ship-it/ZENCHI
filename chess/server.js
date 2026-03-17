const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const initSqlJs = require('sql.js');

const app = express();
app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'games.db');

async function startServer() {
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  function saveDb() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }

  db.run(`CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fen TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameId INTEGER NOT NULL,
    notation TEXT NOT NULL,
    fen TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(gameId) REFERENCES games(id) ON DELETE CASCADE
  )`);

  const defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const sampleFenAfterE4 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';

  const countResult = db.exec('SELECT COUNT(*) AS count FROM games');
  const gamesCount = countResult.length ? countResult[0].values[0][0] : 0;
  if (gamesCount === 0) {
    db.run('INSERT INTO games (name, fen) VALUES (?, ?)', ['Sample opener', defaultFen]);
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    db.run('INSERT INTO moves (gameId, notation, fen) VALUES (?, ?, ?)', [lastId, 'e4', sampleFenAfterE4]);
    saveDb();
  }

  function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows.length ? rows[0] : null;
  }

  app.get('/api/games', (req, res) => {
    const rows = queryAll(
      `SELECT g.id, g.name, g.fen, g.createdAt,
        (SELECT COUNT(*) FROM moves m WHERE m.gameId = g.id) AS moveCount
      FROM games g
      ORDER BY g.createdAt DESC`
    );
    res.json({ games: rows });
  });

  app.get('/api/games/:gameId', (req, res) => {
    const game = queryOne('SELECT id, name, fen, createdAt FROM games WHERE id = ?', [Number(req.params.gameId)]);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  });

  app.get('/api/games/:gameId/moves', (req, res) => {
    const moves = queryAll('SELECT id, notation, fen, createdAt FROM moves WHERE gameId = ? ORDER BY id ASC', [Number(req.params.gameId)]);
    res.json({ moves });
  });

  app.post('/api/games', (req, res) => {
    const payload = req.body || {};
    if (!payload.name || typeof payload.name !== 'string') {
      return res.status(400).json({ error: 'Game name is required' });
    }
    const fen = typeof payload.fen === 'string' && payload.fen.trim().length ? payload.fen.trim() : defaultFen;
    db.run('INSERT INTO games (name, fen) VALUES (?, ?)', [payload.name.trim(), fen]);
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    const game = queryOne('SELECT id, name, fen, createdAt FROM games WHERE id = ?', [lastId]);
    saveDb();
    res.status(201).json(game);
  });

  app.post('/api/games/:gameId/moves', (req, res) => {
    const payload = req.body || {};
    if (!payload.notation || typeof payload.notation !== 'string') {
      return res.status(400).json({ error: 'Move notation is required' });
    }
    const gameId = Number(req.params.gameId);
    const game = queryOne('SELECT id, fen FROM games WHERE id = ?', [gameId]);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const fen = typeof payload.fen === 'string' && payload.fen.trim().length ? payload.fen.trim() : game.fen;
    db.run('INSERT INTO moves (gameId, notation, fen) VALUES (?, ?, ?)', [gameId, payload.notation.trim(), fen]);
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    if (fen !== game.fen) {
      db.run('UPDATE games SET fen = ? WHERE id = ?', [fen, gameId]);
    }
    const move = queryOne('SELECT id, notation, fen, createdAt FROM moves WHERE id = ?', [lastId]);
    saveDb();
    res.status(201).json(move);
  });

  app.use(express.static(path.join(__dirname)));

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Chess backend listening on http://localhost:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
