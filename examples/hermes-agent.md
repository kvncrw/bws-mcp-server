# Using bws-mcp-server with hermes-agent

[hermes-agent](https://github.com/kvncrw/hermes-agent) is a lightweight local agent that speaks MCP. Point it at this server the same way you would any stdio MCP server.

Add to your hermes config (TOML or YAML, depending on which version you're running):

```yaml
mcp_servers:
  bws:
    command: npx
    args: ["-y", "@kvncrw/bws-mcp-server"]
    env:
      BWS_ACCESS_TOKEN: "${BWS_ACCESS_TOKEN}"
```

Note the `${BWS_ACCESS_TOKEN}` reference — hermes will expand env vars at load time, so you can keep the actual token in your shell environment (or pulled from Bitwarden via `bw get item`, or pulled from Bitwarden Secrets Manager itself via a bootstrap).

## Recommended scoping

Create one machine token per hermes deployment. Scope it to only the projects that hermes is allowed to touch — usually one "agent runtime" project per environment. Don't reuse a single org-wide token across multiple agents or multiple machines.
