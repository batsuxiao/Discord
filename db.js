const Database = require('better-sqlite3');
const db = new Database('tasks.db');

function initializeDatabase() {
  console.log('データベースを初期化中...');
  // tasks テーブルの作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      message_id TEXT UNIQUE NOT NULL,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'incomplete',
      completed_at TEXT,
      due_date TEXT,
      reminded INTEGER DEFAULT 0
    )
  `);

  // カラムが存在しない場合に備えて追加（初回起動時やアップデート時に役立つ）
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN due_date TEXT');
  } catch (err) { /* already exists */ }
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN reminded INTEGER DEFAULT 0');
  } catch (err) { /* already exists */ }

  console.log('データベースの準備ができました。');
}

initializeDatabase();

module.exports = db;
