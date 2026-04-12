/**
 * FileStore Unit Tests
 *
 * Tests for MEMORY.md and USER.md file management.
 */

import { FileStore } from '../../src/memory/file-store.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FileStore', () => {
  let tempDir;
  let store;
  const TEST_MAX_MEMORY = 100;
  const TEST_MAX_USER = 50;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-test-'));
    store = new FileStore(tempDir, {
      maxMemorySize: TEST_MAX_MEMORY,
      maxUserSize: TEST_MAX_USER
    });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('loadMemory', () => {
    test('should return null when file does not exist', async () => {
      const result = await store.loadMemory();
      expect(result).toBeNull();
    });

    test('should return content when file exists', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'MEMORY.md'), 'Test memory content');
      const result = await store.loadMemory();
      expect(result).toBe('Test memory content');
    });

    test('should trim whitespace', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'MEMORY.md'), '  Trimmed content  \n');
      const result = await store.loadMemory();
      expect(result).toBe('Trimmed content');
    });
  });

  describe('loadUser', () => {
    test('should return null when file does not exist', async () => {
      const result = await store.loadUser();
      expect(result).toBeNull();
    });

    test('should return content when file exists', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'USER.md'), 'User profile data');
      const result = await store.loadUser();
      expect(result).toBe('User profile data');
    });
  });

  describe('saveMemory', () => {
    test('should save content successfully', async () => {
      const result = await store.saveMemory('Memory content');
      expect(result.success).toBe(true);
      expect(result.truncated).toBe(false);
    });

    test('should truncate content exceeding max size', async () => {
      const longContent = 'a'.repeat(150);
      const result = await store.saveMemory(longContent);
      expect(result.success).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.actualSize).toBe(TEST_MAX_MEMORY);
    });

    test('should write truncated content to file', async () => {
      const longContent = 'b'.repeat(150);
      await store.saveMemory(longContent);
      const saved = await fs.promises.readFile(path.join(tempDir, 'MEMORY.md'), 'utf-8');
      expect(saved.length).toBe(TEST_MAX_MEMORY);
    });
  });

  describe('saveUser', () => {
    test('should save content successfully', async () => {
      const result = await store.saveUser('User content');
      expect(result.success).toBe(true);
      expect(result.truncated).toBe(false);
    });

    test('should truncate content exceeding max size', async () => {
      const longContent = 'c'.repeat(100);
      const result = await store.saveUser(longContent);
      expect(result.truncated).toBe(true);
      expect(result.actualSize).toBe(TEST_MAX_USER);
    });
  });

  describe('appendMemory', () => {
    test('should create file if not exists', async () => {
      await store.appendMemory('New content');
      const exists = await store.hasMemory();
      expect(exists).toBe(true);
    });

    test('should append with separator', async () => {
      await store.saveMemory('Original content');
      await store.appendMemory('Appended content');
      const result = await store.loadMemory();
      expect(result).toContain('Original content');
      expect(result).toContain('Appended content');
    });

    test('should not add separator for first entry', async () => {
      await store.appendMemory('First entry');
      const result = await store.loadMemory();
      expect(result).toBe('First entry');
      expect(result).not.toContain('---');
    });
  });

  describe('hasMemory / hasUser', () => {
    test('should return false when files do not exist', async () => {
      expect(await store.hasMemory()).toBe(false);
      expect(await store.hasUser()).toBe(false);
    });

    test('should return true when files exist', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'MEMORY.md'), 'data');
      await fs.promises.writeFile(path.join(tempDir, 'USER.md'), 'data');
      expect(await store.hasMemory()).toBe(true);
      expect(await store.hasUser()).toBe(true);
    });
  });

  describe('clearMemory / clearUser', () => {
    test('should delete memory file', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'MEMORY.md'), 'data');
      await store.clearMemory();
      expect(await store.hasMemory()).toBe(false);
    });

    test('should delete user file', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'USER.md'), 'data');
      await store.clearUser();
      expect(await store.hasUser()).toBe(false);
    });

    test('should not throw when file does not exist', async () => {
      await expect(store.clearMemory()).resolves.not.toThrow();
      await expect(store.clearUser()).resolves.not.toThrow();
    });
  });

  describe('getStats', () => {
    test('should return correct stats when files do not exist', async () => {
      const stats = await store.getStats();
      expect(stats.memoryExists).toBe(false);
      expect(stats.userExists).toBe(false);
      expect(stats.memorySize).toBe(0);
      expect(stats.userSize).toBe(0);
    });

    test('should return correct stats when files exist', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'MEMORY.md'), 'memory');
      await fs.promises.writeFile(path.join(tempDir, 'USER.md'), 'user');
      const stats = await store.getStats();
      expect(stats.memoryExists).toBe(true);
      expect(stats.userExists).toBe(true);
      expect(stats.memorySize).toBe(6); // 'memory'.length
      expect(stats.userSize).toBe(4);  // 'user'.length
    });
  });
});
