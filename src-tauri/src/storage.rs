/// SQLite storage via tauri-plugin-sql.
/// Schema is initialized from the frontend via the plugin's JS API.
/// SQL commands are defined here as constants for documentation.

#[allow(dead_code)]
pub const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS transcriptions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    raw_text   TEXT,
    model      TEXT    NOT NULL DEFAULT '',
    tier       TEXT    NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('setup_complete', 'false'),
    ('trial_start',    ''),
    ('license_key',    ''),
    ('model',          'whisper-large-v3-turbo'),
    ('cleanup_mode',   'local'),
    ('inject_mode',    'both');
"#;
