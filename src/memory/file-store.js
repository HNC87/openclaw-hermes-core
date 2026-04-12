/**
 * FileStore - MEMORY.md and USER.md File Management
 *
 * Implements the first layer of Hermes's four-layer memory architecture:
 * - USER.md (~1,375 chars): User profile, preferences, communication style
 * - MEMORY.md (~2,200 chars): Agent's personal notes, environment facts, project conventions
 */

import * as fs from 'fs';
import * as path from 'path';

export class FileStore {
  constructor(basePath, config) {
    this.basePath = basePath;
    this.config = config;
  }

  get memoryPath() {
    return path.join(this.basePath, 'MEMORY.md');
  }

  get userPath() {
    return path.join(this.basePath, 'USER.md');
  }

  /**
   * Load MEMORY.md content
   */
  async loadMemory() {
    try {
      const content = await fs.promises.readFile(this.memoryPath, 'utf-8');
      return content.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Load USER.md content
   */
  async loadUser() {
    try {
      const content = await fs.promises.readFile(this.userPath, 'utf-8');
      return content.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Save MEMORY.md with character limit enforcement
   */
  async saveMemory(content) {
    const maxSize = this.config.maxMemorySize;
    let actualContent = content;
    let truncated = false;

    if (content.length > maxSize) {
      actualContent = content.substring(0, maxSize);
      truncated = true;
    }

    await fs.promises.writeFile(this.memoryPath, actualContent, 'utf-8');

    return {
      success: true,
      truncated,
      actualSize: actualContent.length
    };
  }

  /**
   * Save USER.md with character limit enforcement
   */
  async saveUser(content) {
    const maxSize = this.config.maxUserSize;
    let actualContent = content;
    let truncated = false;

    if (content.length > maxSize) {
      actualContent = content.substring(0, maxSize);
      truncated = true;
    }

    await fs.promises.writeFile(this.userPath, actualContent, 'utf-8');

    return {
      success: true,
      truncated,
      actualSize: actualContent.length
    };
  }

  /**
   * Append to MEMORY.md (for incremental learning)
   */
  async appendMemory(newContent) {
    const existing = await this.loadMemory();
    const separator = existing ? '\n\n---\n\n' : '';
    const combined = (existing || '') + separator + newContent;
    await this.saveMemory(combined);
  }

  /**
   * Check if memory files exist
   */
  async hasMemory() {
    try {
      await fs.promises.access(this.memoryPath);
      return true;
    } catch {
      return false;
    }
  }

  async hasUser() {
    try {
      await fs.promises.access(this.userPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete memory files
   */
  async clearMemory() {
    try {
      await fs.promises.unlink(this.memoryPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async clearUser() {
    try {
      await fs.promises.unlink(this.userPath);
    } catch {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Get memory stats
   */
  async getStats() {
    const memoryExists = await this.hasMemory();
    const userExists = await this.hasUser();

    let memorySize = 0;
    let userSize = 0;

    if (memoryExists) {
      const content = await fs.promises.readFile(this.memoryPath, 'utf-8');
      memorySize = content.length;
    }

    if (userExists) {
      const content = await fs.promises.readFile(this.userPath, 'utf-8');
      userSize = content.length;
    }

    return {
      memorySize,
      userSize,
      memoryExists,
      userExists
    };
  }
}
