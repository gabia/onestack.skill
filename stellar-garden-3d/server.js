import Database from 'better-sqlite3';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 4877);
const host = process.env.HOST || '0.0.0.0';
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'stellar-garden.sqlite');
const distDir = path.join(__dirname, 'dist');
const indexPath = path.join(distDir, 'index.html');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS stars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mood TEXT NOT NULL,
    color TEXT NOT NULL,
    brightness REAL NOT NULL,
    orbit_radius REAL NOT NULL,
    orbit_speed REAL NOT NULL,
    angle REAL NOT NULL,
    height REAL NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    visits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT
  );
`);

const seedStars = [
  ['새벽 차고지', 'calm', '#91c7ff', 1.2, '아직 출발하지 않은 생각들이 줄지어 서 있는 곳'],
  ['복숭아 유성', 'lucky', '#f7a1d7', 1.7, '운이 좋으면 꼬리가 분홍색으로 접힌다'],
  ['주머니 태양', 'bold', '#ffd166', 2.1, '작지만 자신감은 항성급'],
  ['녹슨 나침반', 'curious', '#4ecdc4', 1.5, '길을 잃을 때마다 새 길을 만든다'],
  ['화요일의 커피', 'curious', '#ff6b5f', 1.4, '카페인과 중력 사이 어딘가']
];

const count = db.prepare('SELECT COUNT(*) AS count FROM stars').get().count;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO stars (name, mood, color, brightness, orbit_radius, orbit_speed, angle, height, note)
    VALUES (@name, @mood, @color, @brightness, @orbit_radius, @orbit_speed, @angle, @height, @note)
  `);

  const seed = db.transaction(() => {
    seedStars.forEach((star, index) => {
      insert.run({
        name: star[0],
        mood: star[1],
        color: star[2],
        brightness: star[3],
        orbit_radius: 2.4 + index * 0.72,
        orbit_speed: 0.1 + index * 0.018,
        angle: index * 1.22,
        height: (index % 2 === 0 ? 0.28 : -0.2) + index * 0.04,
        note: star[4]
      });
    });
  });

  seed();
}

app.use(express.json({ limit: '32kb' }));

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

const allowedMoods = new Set(['curious', 'calm', 'bold', 'lucky']);
const colorPattern = /^#[0-9a-f]{6}$/i;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readStar(id) {
  return db.prepare('SELECT * FROM stars WHERE id = ?').get(id);
}

function gardenStats() {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM(visits), 0) AS sparks,
      COALESCE(AVG(brightness), 0) AS average_brightness
    FROM stars
  `).get();

  return {
    count: stats.count,
    sparks: stats.sparks,
    average_brightness: Number(stats.average_brightness).toFixed(1)
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: path.relative(__dirname, dbPath) });
});

app.get('/api/garden', (req, res) => {
  const stars = db.prepare('SELECT * FROM stars ORDER BY created_at ASC, id ASC').all();
  res.json({ stars, stats: gardenStats() });
});

app.post('/api/stars', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 24);
  const mood = allowedMoods.has(req.body.mood) ? req.body.mood : 'curious';
  const color = colorPattern.test(req.body.color || '') ? req.body.color : '#ff6b5f';
  const brightness = clampNumber(req.body.brightness, 0.8, 2.4, 1.4);
  const note = String(req.body.note || '').trim().slice(0, 120);

  if (!name) {
    res.status(400).json({ error: '별 이름이 필요합니다.' });
    return;
  }

  const orbitRadius = 2.2 + Math.random() * 3.9;
  const orbitSpeed = 0.075 + Math.random() * 0.085;
  const angle = Math.random() * Math.PI * 2;
  const height = -0.75 + Math.random() * 1.5;

  const result = db.prepare(`
    INSERT INTO stars (name, mood, color, brightness, orbit_radius, orbit_speed, angle, height, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, mood, color, brightness, orbitRadius, orbitSpeed, angle, height, note);

  res.status(201).json({ star: readStar(result.lastInsertRowid), stats: gardenStats() });
});

app.patch('/api/stars/:id/spark', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare(`
    UPDATE stars
    SET visits = visits + 1, last_seen_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: '별을 찾을 수 없습니다.' });
    return;
  }

  res.json({ star: readStar(id), stats: gardenStats() });
});

app.delete('/api/stars/:id', (req, res) => {
  const id = Number(req.params.id);
  const result = db.prepare('DELETE FROM stars WHERE id = ?').run(id);

  if (result.changes === 0) {
    res.status(404).json({ error: '별을 찾을 수 없습니다.' });
    return;
  }

  res.json({ ok: true, stats: gardenStats() });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  res.status(503).send('Build assets are missing. Run `npm run build` first.');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '정원 서버가 잠깐 길을 잃었습니다.' });
});

app.listen(port, host, () => {
  console.log(`Stellar Garden is running at http://${host}:${port}`);
});
