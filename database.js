const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'words.db'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT UNIQUE,
        length INTEGER,
        mined_count INTEGER DEFAULT 1
    )`);
});

module.exports = db;
