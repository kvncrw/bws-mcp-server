# Using bws-mcp-server with Claude Desktop

Claude Desktop reads its MCP server config from `claude_desktop_config.json`. On macOS that's at `~/Library/Application Support/Claude/claude_desktop_config.json`; on Linux it's typically at `~/.config/Claude/claude_desktop_config.json`.

Add an entry under `mcpServers`:

```json
{
  "mcpServers": {
    "bws": {
      "command": "npx",
      "args": ["-y", "@kvncrw/bws-mcp-server"],
      "env": {
        "BWS_ACCESS_TOKEN": "0.your-machine-token-here"
      }
    }
  }
}
```

Or, if you've cloned the repo and built it locally:

```json
{
  "mcpServers": {
    "bws": {
      "command": "node",
      "args": ["/absolute/path/to/bws-mcp-server/dist/index.js"],
      "env": {
        "BWS_ACCESS_TOKEN": "0.your-machine-token-here"
      }
    }
  }
}
```

Restart Claude Desktop after editing the config. The tools will show up under the bws server in the tools drawer.

## Minimizing token exposure

If you'd rather not paste the machine token into the config file, wrap the command in a tiny shell script that reads the token from your system keychain or from Bitwarden itself, and exec into the server with `BWS_ACCESS_TOKEN` set. Point `command` at the wrapper.
