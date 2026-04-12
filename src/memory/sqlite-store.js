/**
 * SQLiteStore - Session Archive Store
 *
 * Provides storage and search on conversation history for the Hermes
 * four-layer memory architecture.
 *
 * Uses FTS5 if available, otherwise falls back to LIKE search.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export class SQLiteStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.initialized = false;
    this.fts5Available = false;
  }

  async initialize() {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.promises.mkdir(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Try FTS5 first, fall back to regular table
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS session_messages USING fts5(
          session_id UNINDEXED,
          message_id UNINDEXED,
          role UNINDEXED,
          content,
          timestamp UNINDEXED,
          tool_calls,
          tokenize='porter unicode61'
        );
      `);
      this.fts5Available = true;
    } catch (ftsError) {
      console.warn('[HermesContextEngine] FTS5 not available, using LIKE search:', ftsError.message);
      this.fts5Available = false;

      // Create regular table as fallback
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS session_messages (
          session_id TEXT,
          message_id TEXT,
          role TEXT,
          content TEXT,
          timestamp TEXT,
          tool_calls TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session
        ON session_messages(session_id);

        CREATE INDEX IF NOT EXISTS idx_messages_timestamp
        ON session_messages(timestamp);
      `);
    }

    // Always create metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_metadata (
        session_id TEXT PRIMARY KEY,
        start_time TEXT,
        end_time TEXT,
        message_count INTEGER DEFAULT 0
      );
    `);

    this.initialized = true;
  }

  insertMessageSync(msg) {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO session_messages (session_id, message_id, role, content, timestamp, tool_calls)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(msg.session_id, msg.message_id, msg.role, msg.content, msg.timestamp, msg.tool_calls || null);

    // Update metadata
    const metaStmt = this.db.prepare(`
      INSERT INTO session_metadata (session_id, start_time, message_count)
      VALUES (?, ?, 1)
      ON CONFLICT(session_id) DO UPDATE SET
        message_count = message_count + 1,
        end_time = excluded.end_time
    `);

    metaStmt.run(msg.session_id, msg.timestamp);
  }

  async insertMessage(msg) {
    this.insertMessageSync(msg);
  }

  searchRelevant(query, currentSessionId, options = {}) {
    if (!this.db) throw new Error('Database not initialized');

    const limit = options.limit || 10;

    if (this.fts5Available) {
      return this.searchFTS(query, currentSessionId, limit);
    } else {
      return this.searchLike(query, currentSessionId, limit);
    }
  }

  searchFTS(query, currentSessionId, limit) {
    let sql = `
      SELECT session_id, message_id, role, content, timestamp,
             bm25(session_messages) as rank
      FROM session_messages
      WHERE content MATCH ?
    `;

    const params = [`"${query}"*`];

    if (currentSessionId) {
      sql += ` AND session_id != ?`;
      params.push(currentSessionId);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    try {
      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params);
      // Fallback to LIKE if FTS5 returns no results (may happen with non-English text)
      if (results.length === 0) {
        return this.searchLike(query, currentSessionId, limit);
      }
      return results;
    } catch (error) {
      // Fallback to LIKE search if FTS5 fails
      return this.searchLike(query, currentSessionId, limit);
    }
  }

  searchLike(query, currentSessionId, limit) {
    let sql = `
      SELECT session_id, message_id, role, content, timestamp, 0 as rank
      FROM session_messages
      WHERE content LIKE ?
    `;

    const params = [`%${query}%`];

    if (currentSessionId) {
      sql += ` AND session_id != ?`;
      params.push(currentSessionId);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  getSessionMessages(sessionId, limit = 100) {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM session_messages
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(sessionId, limit);
  }

  cleanupOldSessions(retentionDays) {
    if (!this.db) throw new Error('Database not initialized');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const stmt = this.db.prepare(`
      DELETE FROM session_messages WHERE timestamp < ?
    `);

    const result = stmt.run(cutoff.toISOString());
    return result.changes;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}
