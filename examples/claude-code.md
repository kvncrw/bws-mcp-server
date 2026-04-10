# Using bws-mcp-server with Claude Code

Claude Code (the CLI) registers MCP servers through `claude mcp add` or by editing `~/.claude/settings.json`.

## Quick add

```bash
claude mcp add bws \
  --scope user \
  --env BWS_ACCESS_TOKEN=0.your-token-here \
  -- npx -y @kvncrw/bws-mcp-server
```

## Manual config

Edit `~/.claude/settings.json` and add under `mcpServers`:

```json
{
  "mcpServers": {
    "bws": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@kvncrw/bws-mcp-server"],
      "env": {
        "BWS_ACCESS_TOKEN": "0.your-machine-token-here"
      }
    }
  }
}
```

Restart Claude Code (or run `claude mcp list` to confirm the server is registered). From there you can ask things like:

> List the secrets in project `a4b7f3ff-5ee3-4e8f-94cb-b4280132df6e` — just the keys, don't show the values.

> Create a new secret `DEPLOY_WEBHOOK_URL` in the `deletemyai` project with value `https://...`.

> Run `./scripts/smoke.sh` with secrets from the `staging` project injected.

The last one triggers `bws_run`, which is gated behind `confirm: true` — Claude Code will prompt for approval before running anything.
