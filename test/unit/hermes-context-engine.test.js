/**
 * HermesContextEngine Unit Tests
 *
 * Tests for the ContextEngine implementation.
 */

import { HermesContextEngine } from '../../src/context-engine/hermes-context-engine.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('HermesContextEngine', () => {
  let tempBaseDir;
  let engine;

  beforeEach(async () => {
    tempBaseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-engine-test-'));
    engine = new HermesContextEngine({
      memory: {
        max_memory_size: 2200,
        max_user_size: 1375,
        memory_path: path.join(tempBaseDir, 'hermes')
      },
      session_archive: {
        db_path: path.join(tempBaseDir, 'hermes', 'session.db'),
        fts5_enabled: true
      }
    });
  });

  afterEach(async () => {
    if (engine.dispose) await engine.dispose();
    await fs.promises.rm(tempBaseDir, { recursive: true, force: true });
  });

  describe('info', () => {
    test('should have correct plugin info', () => {
      expect(engine.info.id).toBe('hermes-core');
      expect(engine.info.name).toBe('Hermes Context Engine');
      expect(engine.info.version).toBe('1.0.0');
      expect(engine.info.ownsCompaction).toBe(false);
    });
  });

  describe('bootstrap', () => {
    test('should initialize successfully', async () => {
      const result = await engine.bootstrap({
        sessionId: 'test-session',
        sessionFile: '/tmp/test.json'
      });

      expect(result.bootstrapped).toBe(true);
    });

    test('should be idempotent', async () => {
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });
      const result = await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });
      expect(result.bootstrapped).toBe(true);
    });
  });

  describe('ingest', () => {
    beforeEach(async () => {
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });
    });

    test('should ingest user message', async () => {
      const result = await engine.ingest({
        sessionId: 'test-session',
        message: {
          role: 'user',
          content: 'Hello world'
        }
      });

      expect(result.ingested).toBe(true);
    });

    test('should skip heartbeat messages', async () => {
      const result = await engine.ingest({
        sessionId: 'test-session',
        message: { role: 'user', content: 'test' },
        isHeartbeat: true
      });

      expect(result.ingested).toBe(false);
    });

    test('should handle array content', async () => {
      const result = await engine.ingest({
        sessionId: 'test-session',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' }
          ]
        }
      });

      expect(result.ingested).toBe(true);
    });
  });

  describe('assemble', () => {
    beforeEach(async () => {
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });
    });

    test('should return original messages', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const result = await engine.assemble({
        sessionId: 'test-session',
        messages
      });

      expect(result.messages).toEqual(messages);
    });

    test('should inject memory content when available', async () => {
      const memoryPath = path.join(tempBaseDir, 'hermes', 'memories', 'MEMORY.md');
      await fs.promises.mkdir(path.dirname(memoryPath), { recursive: true });
      await fs.promises.writeFile(memoryPath, 'User prefers concise responses');

      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.systemPromptAddition).toContain('## Persistent Memory');
      expect(result.systemPromptAddition).toContain('prefers concise responses');
    });

    test('should inject user profile', async () => {
      const userPath = path.join(tempBaseDir, 'hermes', 'memories', 'USER.md');
      await fs.promises.mkdir(path.dirname(userPath), { recursive: true });
      await fs.promises.writeFile(userPath, 'Name: Test User');

      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.systemPromptAddition).toContain('Name: Test User');
    });

    test('should search relevant history', async () => {
      // First ingest some messages
      await engine.ingest({
        sessionId: 'other-session',
        message: { role: 'user', content: 'Tell me about gold trading' }
      });

      const result = await engine.assemble({
        sessionId: 'current-session',
        messages: [{ role: 'user', content: 'gold trading' }]
      });

      expect(result.systemPromptAddition).toContain('Relevant History');
    });

    test('should calculate estimated tokens', async () => {
      const memoryPath = path.join(tempBaseDir, 'hermes', 'memories', 'MEMORY.md');
      await fs.promises.mkdir(path.dirname(memoryPath), { recursive: true });
      await fs.promises.writeFile(memoryPath, 'a'.repeat(1000));

      const result = await engine.assemble({
        sessionId: 'test-session',
        messages: [{ role: 'user', content: 'Hello' }]
      });

      expect(result.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('compact', () => {
    test('should acknowledge compaction', async () => {
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });

      const result = await engine.compact({
        sessionId: 'test-session',
        sessionFile: '/tmp/test'
      });

      expect(result.ok).toBe(true);
      expect(result.compacted).toBe(true);
    });
  });

  describe('afterTurn', () => {
    test('should set session id in runtime context', async () => {
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });

      const runtimeContext = {};
      await engine.afterTurn({
        sessionId: 'test-session',
        sessionFile: '/tmp/test',
        messages: [],
        prePromptMessageCount: 0,
        runtimeContext
      });

      expect(runtimeContext.hermesSessionId).toBe('test-session');
    });
  });

  describe('dispose', () => {
    test('should cleanup resources', async () => {
      await engine.bootstrap({ sessionId: 'test', sessionFile: '/tmp/test' });
      await engine.dispose();

      // After dispose, should reinitialize
      const result = await engine.ingest({
        sessionId: 'test-session',
        message: { role: 'user', content: 'test' }
      });
      expect(result.ingested).toBe(true);
    });
  });
});
