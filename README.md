# Hermes Core - OpenClaw Plugin

Hermes Core is an OpenClaw plugin that adds self-learning capabilities and four-layer memory architecture to the OpenClaw agent system.

## Features

- **Four-Layer Memory Architecture**: Short-term, long-term, semantic, and procedural memory
- **Self-Learning Loop**: Automatically generates skills from complex task execution
- **Session Search**: FTS5-based full-text search of conversation history
- **Memory Management**: Persistent storage of user preferences and environment facts

## Installation

### Option 1: npm install (after publishing)
```bash
npm install hermes-core
```

### Option 2: Manual installation
```bash
# Clone or copy to OpenClaw extensions directory
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
    "entries": {
      "hermes-core": {
        "enabled": true
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `session_search` | Search conversation history using full-text search |
| `memory_manage` | Read/write to USER.md and MEMORY.md memory files |
| `skill_manage` | Create, update, and manage reusable agent skills |

## Self-Learning

Hermes Core automatically detects when the agent completes complex tasks and can generate reusable skills from them.

Trigger conditions:
- 5+ tool calls in a single task
- Error recovery from tool failures
- User corrections
- Non-trivial multi-step workflows

## License

MIT