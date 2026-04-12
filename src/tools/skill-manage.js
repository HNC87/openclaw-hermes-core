/**
 * Skill Manage Tool - Create, Update, and Manage Agent Skills
 *
 * This is the core tool for Hermes's self-learning loop. It allows the Agent
 * to automatically create skills when it completes complex tasks.
 *
 * Skill Format: Follows agentskills.io standard
 * Location: ~/.openclaw/hermes/skills/{skill-name}/SKILL.md
 *
 * Supported Actions:
 * - create: Create a new skill from task execution
 * - patch: Update specific sections of an existing skill
 * - read: Read a skill's content
 * - list: List all available skills
 */

import * as fs from 'fs';
import * as path from 'path';
import { Type } from '@sinclair/typebox';

const SkillManageParams = Type.Object({
  action: Type.String(),
  name: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  patch_target: Type.Optional(Type.String()),
  patch_content: Type.Optional(Type.String()),
  metadata: Type.Optional(Type.Object({
    trigger_reason: Type.Optional(Type.String()),
    tool_calls_used: Type.Optional(Type.Number())
  }))
});

export const skillManageTool = {
  name: 'skill_manage',
  description: `Create, update, and manage agent skills.
    After completing a complex task (5+ tool calls), fixing a tricky error,
    or discovering a non-trivial workflow, save the approach as a skill
    with action='create' so you can reuse it next time.
    When using a skill and finding it outdated or wrong, use action='patch' to update it.`,

  parameters: SkillManageParams,

  async execute(_id, params) {
    const homeDir = process.env.HOME || '/Users/hnc';
    const skillsBasePath = `${homeDir}/.openclaw/hermes/skills`;

    // Ensure skills directory exists
    await fs.promises.mkdir(skillsBasePath, { recursive: true });

    const action = params.action;
    const name = params.name;
    const content = params.content;
    const metadata = params.metadata || {};

    switch (action) {
      case 'create': {
        if (!name || !content) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'name and content are required for create action' }) }] };
        }

        // Validate skill name format
        if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name)) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Skill name must start with letter, contain only lowercase letters/numbers/hyphens, and end with letter or number' }) }] };
        }

        const skillPath = path.join(skillsBasePath, name, 'SKILL.md');

        // Check if skill already exists
        try {
          await fs.promises.access(skillPath);
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Skill "${name}" already exists` }) }] };
        } catch {
          // Skill doesn't exist, good
        }

        // Create skill directory
        await fs.promises.mkdir(path.dirname(skillPath), { recursive: true });

        // Build skill content with YAML frontmatter
        const frontmatter = {
          name: name,
          description: content.split('\n')[0]?.substring(0, 200) || 'Auto-generated skill',
          version: '1.0.0',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          trigger_reason: metadata.trigger_reason,
          tool_calls_used: metadata.tool_calls_used
        };

        const yamlFrontmatter = Object.entries(frontmatter)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('\n');

        const fullContent = `---\n${yamlFrontmatter}\n---\n\n${content}`;

        await fs.promises.writeFile(skillPath, fullContent, 'utf-8');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              skill_name: name,
              path: skillPath,
              message: `Skill "${name}" created successfully`
            })
          }]
        };
      }

      case 'patch': {
        if (!name || !params.patch_target || params.patch_content === undefined) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'name, patch_target, and patch_content are required for patch action' }) }] };
        }

        const skillPath = path.join(skillsBasePath, name, 'SKILL.md');

        // Check if skill exists
        try {
          const existingContent = await fs.promises.readFile(skillPath, 'utf-8');

          // Parse and update frontmatter
          const lines = existingContent.split('\n');
          const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
          const frontmatterLines = lines.slice(1, frontmatterEnd);
          const bodyContent = lines.slice(frontmatterEnd + 1).join('\n');

          const frontmatter = {};
          for (const line of frontmatterLines) {
            const [key, ...valueParts] = line.split(': ');
            if (key && valueParts.length > 0) {
              frontmatter[key.trim()] = valueParts.join(': ').replace(/^["']|["']$/g, '');
            }
          }

          frontmatter['updated_at'] = new Date().toISOString();

          // Build new content with patched section
          const newYamlFrontmatter = Object.entries(frontmatter)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join('\n');

          // Insert patch content after the appropriate section header
          let newBody = bodyContent;
          const sectionHeader = `## ${params.patch_target.replace('_', ' ').toUpperCase()}`;
          const sectionPattern = new RegExp(`${sectionHeader}[^#]*`, 'i');

          if (sectionPattern.test(newBody)) {
            newBody = newBody.replace(sectionPattern, `${sectionHeader}\n${params.patch_content}`);
          } else {
            newBody += `\n\n${sectionHeader}\n${params.patch_content}`;
          }

          const newContent = `---\n${newYamlFrontmatter}\n---\n${newBody}`;

          await fs.promises.writeFile(skillPath, newContent, 'utf-8');

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                skill_name: name,
                patch_target: params.patch_target,
                message: `Skill "${name}" patched successfully`
              })
            }]
          };
        } catch {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Skill "${name}" not found` }) }] };
        }
      }

      case 'read': {
        if (!name) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'name is required for read action' }) }] };
        }

        const skillPath = path.join(skillsBasePath, name, 'SKILL.md');

        try {
          const content = await fs.promises.readFile(skillPath, 'utf-8');
          const lines = content.split('\n');
          const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
          const frontmatterLines = lines.slice(1, frontmatterEnd);
          const bodyContent = lines.slice(frontmatterEnd + 1).join('\n').trim();

          const metadata = {};
          for (const line of frontmatterLines) {
            const [key, ...valueParts] = line.split(': ');
            if (key && valueParts.length > 0) {
              metadata[key.trim()] = valueParts.join(': ').replace(/^["']|["']$/g, '');
            }
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                skill_name: name,
                metadata,
                content: bodyContent
              })
            }]
          };
        } catch {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Skill "${name}" not found` }) }] };
        }
      }

      case 'list': {
        const entries = await fs.promises.readdir(skillsBasePath, { withFileTypes: true });
        const skills = [];

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(skillsBasePath, entry.name, 'SKILL.md');
            try {
              const content = await fs.promises.readFile(skillPath, 'utf-8');
              const lines = content.split('\n');
              const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
              const frontmatterLines = lines.slice(1, frontmatterEnd);

              const metadata = {};
              for (const line of frontmatterLines) {
                const [key, ...valueParts] = line.split(': ');
                if (key && valueParts.length > 0) {
                  metadata[key.trim()] = valueParts.join(': ').replace(/^["']|["']$/g, '');
                }
              }

              skills.push({
                name: entry.name,
                version: metadata['version'] || 'unknown',
                updated_at: metadata['updated_at']
              });
            } catch {
              // Skip malformed skills
            }
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              skills,
              total: skills.length
            })
          }]
        };
      }

      case 'delete': {
        if (!name) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'name is required for delete action' }) }] };
        }

        const skillDir = path.join(skillsBasePath, name);

        try {
          await fs.promises.rm(skillDir, { recursive: true });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                skill_name: name,
                message: `Skill "${name}" deleted successfully`
              })
            }]
          };
        } catch {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Skill "${name}" not found` }) }] };
        }
      }

      default:
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }) }] };
    }
  }
};