/**
 * SkillManageTool Unit Tests
 *
 * Tests for the skill management tool (create/patch/read/list/delete).
 * Updated to use OpenClaw tool format with Typebox schema.
 */

import { jest } from '@jest/globals';
import { skillManageTool } from '../../src/tools/skill-manage.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Helper to parse tool result (OpenClaw format)
const parseResult = (result) => {
  const text = result.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// Mock context for tool execution
const createMockContext = () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
});

describe('skillManageTool', () => {
  let tempSkillsDir;
  const originalHome = process.env.HOME;

  beforeEach(async () => {
    tempSkillsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-skills-test-'));
    process.env.HOME = tempSkillsDir.replace('/hermes/skills', ''); // Base home dir
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    await fs.promises.rm(tempSkillsDir, { recursive: true, force: true });
  });

  describe('create action', () => {
    test('should create a new skill successfully', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'test-skill',
        content: '# Test Skill\n\nThis is a test skill.'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.skill_name).toBe('test-skill');
      expect(parsed.path).toContain('test-skill/SKILL.md');
    });

    test('should create skill with YAML frontmatter', async () => {
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'documented-skill',
        content: '# Documented Skill\n\nSteps:\n1. First step',
        metadata: {
          trigger_reason: 'high tool usage'
        }
      });

      const skillPath = path.join(tempSkillsDir, '.openclaw', 'hermes', 'skills', 'documented-skill', 'SKILL.md');
      const content = await fs.promises.readFile(skillPath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('name: "documented-skill"');
      expect(content).toContain('trigger_reason');
    });

    test('should reject invalid skill names', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'Invalid-Name', // Contains uppercase
        content: 'Skill content'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('lowercase');
    });

    test('should reject duplicate skill names', async () => {
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'duplicate-skill',
        content: 'First skill'
      });

      const result = await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'duplicate-skill',
        content: 'Second skill'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('already exists');
    });

    test('should require name and content', async () => {
      const result1 = await skillManageTool.execute('test-id', {
        action: 'create',
        content: 'Content only'
      });
      const parsed1 = parseResult(result1);
      expect(parsed1.success).toBe(false);

      const result2 = await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'name-only'
      });
      const parsed2 = parseResult(result2);
      expect(parsed2.success).toBe(false);
    });
  });

  describe('read action', () => {
    beforeEach(async () => {
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'readable-skill',
        content: '# Readable Skill\n\nSome content here.'
      });
    });

    test('should read existing skill', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'read',
        name: 'readable-skill'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.skill_name).toBe('readable-skill');
      expect(parsed.content).toContain('Readable Skill');
    });

    test('should return error for non-existent skill', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'read',
        name: 'non-existent'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });
  });

  describe('list action', () => {
    beforeEach(async () => {
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'skill-one',
        content: 'Skill one content'
      });
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'skill-two',
        content: 'Skill two content'
      });
    });

    test('should list all skills', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'list'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.total).toBe(2);
      expect(parsed.skills).toHaveLength(2);
    });

    test('should return empty list when no skills', async () => {
      // Use a different temp dir for this test
      const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hermes-empty-test-'));
      process.env.HOME = emptyDir.replace('/hermes/skills', '');

      const result = await skillManageTool.execute('test-id', {
        action: 'list'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.total).toBe(0);
      expect(parsed.skills).toEqual([]);

      await fs.promises.rm(emptyDir, { recursive: true, force: true });
      process.env.HOME = tempSkillsDir.replace('/hermes/skills', '');
    });
  });

  describe('patch action', () => {
    beforeEach(async () => {
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'patchable-skill',
        content: '# Patchable Skill\n\n## DESCRIPTION\n\nOriginal description.\n\n## STEPS\n\n1. Original step.'
      });
    });

    test('should patch existing section', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'patch',
        name: 'patchable-skill',
        patch_target: 'description',
        patch_content: 'Updated description text.'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.patch_target).toBe('description');

      const readResult = await skillManageTool.execute('test-id', {
        action: 'read',
        name: 'patchable-skill'
      });

      const readParsed = parseResult(readResult);
      expect(readParsed.content).toContain('Updated description text.');
    });

    test('should add new section if not exists', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'patch',
        name: 'patchable-skill',
        patch_target: 'edge_cases',
        patch_content: 'Handle edge case 1.'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);

      const readResult = await skillManageTool.execute('test-id', {
        action: 'read',
        name: 'patchable-skill'
      });

      const readParsed = parseResult(readResult);
      expect(readParsed.content).toContain('EDGE CASES');
    });

    test('should require patch_target and patch_content', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'patch',
        name: 'patchable-skill'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(false);
    });
  });

  describe('delete action', () => {
    beforeEach(async () => {
      await skillManageTool.execute('test-id', {
        action: 'create',
        name: 'deletable-skill',
        content: 'Will be deleted'
      });
    });

    test('should delete existing skill', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'delete',
        name: 'deletable-skill'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(true);

      const readResult = await skillManageTool.execute('test-id', {
        action: 'read',
        name: 'deletable-skill'
      });

      const readParsed = parseResult(readResult);
      expect(readParsed.success).toBe(false);
    });

    test('should return error for non-existent skill', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'delete',
        name: 'non-existent'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('not found');
    });
  });

  describe('invalid action', () => {
    test('should return error for unknown action', async () => {
      const result = await skillManageTool.execute('test-id', {
        action: 'invalid'
      });

      const parsed = parseResult(result);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Unknown action');
    });
  });
});