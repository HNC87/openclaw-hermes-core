# Hermes Core - OpenClaw Plugin

Hermes Core is an OpenClaw plugin that adds self-learning capabilities and four-layer memory architecture to the OpenClaw agent system.

## Features

- **Four-Layer Memory Architecture**: Short-term, long-term, semantic, and procedural memory
- **Self-Learning Loop**: Automatically generates skills from complex task execution
- **Session Search**: FTS5-based full-text search of conversation history
- **Memory Management**: Persistent storage of user preferences and environment facts
- **Profit Factor Analysis**: Mining trading data to discover profitable patterns and factors

## Compatibility

| Component | Version |
|----------|---------|
| OpenClaw | >= 2026.4.0 |
| Typebox | ^0.34.0 |

Tested with OpenClaw 2026.4.10.

## Installation

### Option 1: npm install (after publishing)
```bash
npm install hermes-core
```

### Option 2: Clone from GitHub
```bash
git clone https://github.com/HNC87/openclaw-hermes-core.git ~/.openclaw/extensions/openclaw-hermes-core
cd ~/.openclaw/extensions/openclaw-hermes-core
npm install
```

### Option 3: Configure in openclaw.json
```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/hermes-core/src/index.js"]
    }
  }
}
```

## Configuration

In `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["hermes-core"],
    "entries": {
      "hermes-core": {
        "enabled": true
      }
    }
  }
}
```

### Memory Configuration (Optional)
```json
{
  "plugins": {
    "entries": {
      "hermes-core": {
        "config": {
          "memory": {
            "max_memory_size": 2200,
            "max_user_size": 1375
          },
          "learning": {
            "min_tool_calls": 5,
            "auto_skill_generation": true
          }
        }
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `session_search` | Search conversation history using full-text search (FTS5) |
| `memory_manage` | Read/write to USER.md and MEMORY.md memory files |
| `skill_manage` | Create, update, and manage reusable agent skills |

### Tool Usage Examples

**Session Search:**
```
用 session_search 搜索 "上次讨论的交易策略"
```

**Memory Management:**
```
用 memory_manage 读取 memory 内容
用 memory_manage 追加内容到 MEMORY.md
用 memory_manage 查看统计信息
```

**Skill Management:**
```
用 skill_manage 创建一个 skill，名字是 xxx，描述是 xxx
用 skill_manage 列出所有 skills
用 skill_manage 读取某个 skill 内容
用 skill_manage 更新已有 skill
```

## Self-Learning

Hermes Core automatically detects when the agent completes complex tasks and can generate reusable skills from them.

### Trigger Conditions

| Condition | Threshold | Description |
|-----------|-----------|-------------|
| Tool Calls | >= 5 | Complex task detection |
| Error Recovery | 1+ | Recovery from tool errors |
| User Correction | 1+ | User provides corrective feedback |
| Multi-step Success | 3+ steps | Non-trivial workflow completion |

### Self-Learning Flow

```
Agent executes task (5+ tool calls)
    ↓
agent_end hook detects trigger condition
    ↓
Sets flag: hermes_should_generate_skill = true
    ↓
Agent perceives this flag
    ↓
Agent calls skill_manage to create skill
```

## Memory Architecture

```
~/.openclaw/hermes/
├── memories/
│   ├── MEMORY.md      # Environment facts, project conventions
│   └── USER.md        # User preferences and profile
├── skills/            # Agent skill library
│   └── {skill-name}/SKILL.md
└── session.db        # SQLite session history with FTS5
```

## File Structure

```
openclaw-hermes-core/
├── src/
│   ├── index.js                    # Main plugin entry
│   ├── context-engine/             # Hermes ContextEngine
│   ├── hooks/                      # before_prompt, after_tool, agent_end hooks
│   ├── learning/                   # Trigger detection logic
│   ├── memory/                     # FileStore, SQLiteStore
│   ├── providers/                  # Auxiliary router
│   └── tools/                      # Tool implementations
├── test/unit/                      # Unit tests
├── package.json
├── openclaw.plugin.json
└── README.md
```

## Testing

```bash
npm install
npm test
```

## License

MIT