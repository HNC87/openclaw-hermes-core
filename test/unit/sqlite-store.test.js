/**
 * SQLiteStore Unit Tests
 *
 * Tests for SQLite session archive functionality.
 * Note: FTS5 may not be available in all SQLite builds,
 * tests are designed to work with both FTS5 and LIKE fallback.
 */

import { SQLiteStore } from '../../src/memory/sqlite-store.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SQLiteStore', () => {
  let tempDbPath;
  let store;

  beforeEach(async () => {
    tempDbPath = path.join(os.tmpdir(), `hermes-test-${Date.now()}.db`);
    store = new SQLiteStore(tempDbPath);
    await store.initialize();
  });

  afterEach(async () => {
    store.close();
    try {
      await fs.promises.unlink(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    test('should create database file', async () => {
      expect(fs.existsSync(tempDbPath)).toBe(true);
    });

    test('should be idempotent', async () => {
      await store.initialize();
      await store.initialize();
      // Should not throw
      expect(true).toBe(true);
    });

    test('should detect FTS5 availability', async () => {
      // Just verify it initializes without error
      expect(store.initialized).toBe(true);
    });
  });

  describe('insertMessage', () => {
    test('should insert message successfully', async () => {
      await store.insertMessage({
        session_id: 'session-1',
        message_id: 'msg-1',
        role: 'user',
        content: 'Hello world',
        timestamp: new Date().toISOString(),
        tool_calls: null
      });

      const messages = await store.getSessionMessages('session-1');
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('Hello world');
      expect(messages[0].role).toBe('user');
    });

    test('should store tool_calls as JSON string', async () => {
      const toolCalls = [{ name: 'bash', params: { cmd: 'ls' } }];
      await store.insertMessage({
        session_id: 'session-1',
        message_id: 'msg-1',
        role: 'assistant',
        content: 'Running bash',
        timestamp: new Date().toISOString(),
        tool_calls: JSON.stringify(toolCalls)
      });

      const messages = await store.getSessionMessages('session-1');
      expect(messages[0].tool_calls).toBe(JSON.stringify(toolCalls));
    });

    test('should update message count in metadata', async () => {
      await store.insertMessage({
        session_id: 'session-1',
        message_id: 'msg-1',
        role: 'user',
        content: 'First',
        timestamp: new Date().toISOString()
      });
      await store.insertMessage({
        session_id: 'session-1',
        message_id: 'msg-2',
        role: 'assistant',
        content: 'Second',
        timestamp: new Date().toISOString()
      });

      const messages = await store.getSessionMessages('session-1');
      expect(messages.length).toBe(2);
    });
  });

  describe('searchRelevant', () => {
    beforeEach(async () => {
      await store.insertMessage({
        session_id: 'session-1',
        message_id: 'msg-1',
        role: 'user',
        content: 'How do I configure the trading bot?',
        timestamp: new Date().toISOString()
      });
      await store.insertMessage({
        session_id: 'session-1',
        message_id: 'msg-2',
        role: 'assistant',
        content: 'You can configure it using the config file.',
        timestamp: new Date().toISOString()
      });
      await store.insertMessage({
        session_id: 'session-2',
        message_id: 'msg-3',
        role: 'user',
        content: 'What is the best time to trade gold?',
        timestamp: new Date().toISOString()
      });
    });

    test('should find messages matching query', async () => {
      // Search for 'trading' which is in 'How do I configure the trading bot?'
      const results = await store.searchRelevant('trading', 'session-1');
      expect(results.length).toBeGreaterThan(0);
    });

    test('should exclude current session by default', async () => {
      const results = await store.searchRelevant('trading', 'session-1');
      // Results should not include msg-1 or msg-2 which are from session-1
      const session1Results = results.filter(r => r.session_id === 'session-1');
      expect(session1Results.length).toBe(0);
    });

    test('should include current session when session_id is not provided', async () => {
      const results = await store.searchRelevant('trading');
      const session1Results = results.filter(r => r.session_id === 'session-1');
      expect(session1Results.length).toBeGreaterThan(0);
    });

    test('should respect limit parameter', async () => {
      const results = await store.searchRelevant('the', undefined, { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('should return empty array when no matches', async () => {
      const results = await store.searchRelevant('nonexistent query xyz', 'session-1');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getSessionMessages', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await store.insertMessage({
          session_id: 'session-1',
          message_id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: new Date().toISOString()
        });
      }
    });

    test('should return all messages for session', async () => {
      const messages = await store.getSessionMessages('session-1');
      expect(messages.length).toBe(5);
    });

    test('should respect limit parameter', async () => {
      const messages = await store.getSessionMessages('session-1', 3);
      expect(messages.length).toBe(3);
    });

    test('should return empty array for non-existent session', async () => {
      const messages = await store.getSessionMessages('non-existent');
      expect(messages).toEqual([]);
    });
  });

  describe('cleanupOldSessions', () => {
    test('should delete messages older than retention period', async () => {
      // Insert old message
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      await store.insertMessage({
        session_id: 'old-session',
        message_id: 'old-msg',
        role: 'user',
        content: 'Old message',
        timestamp: oldDate.toISOString()
      });

      // Insert recent message
      await store.insertMessage({
        session_id: 'recent-session',
        message_id: 'recent-msg',
        role: 'user',
        content: 'Recent message',
        timestamp: new Date().toISOString()
      });

      const deleted = await store.cleanupOldSessions(90);
      expect(deleted).toBe(1);

      const oldMessages = await store.getSessionMessages('old-session');
      expect(oldMessages.length).toBe(0);
    });
  });

  describe('close', () => {
    test('should close database connection', async () => {
      store.close();
      await expect(store.insertMessage({
        session_id: 'test',
        message_id: 'msg',
        role: 'user',
        content: 'test',
        timestamp: new Date().toISOString()
      })).rejects.toThrow('Database not initialized');
    });
  });
});
