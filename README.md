# bws-mcp-server

A Model Context Protocol server for Bitwarden Secrets Manager. Wraps the official `bws` CLI so Claude (and any other MCP client) can manage your infrastructure secrets.

```bash
npx -y @kvncrw/bws-mcp-server
```

## Why this exists

The official [`bitwarden/mcp-server`](https://github.com/bitwarden/mcp-server) covers Bitwarden Password Manager — your personal vault, logins, folders, sends, the whole browser-extension surface. It does not cover Bitwarden Secrets Manager (BSM), which is Bitwarden's separate product for machine-to-machine secrets: API keys, database URLs, service tokens, everything you'd otherwise stuff into `.env` files or Kubernetes Secret objects.

That's a pretty real gap if you run infrastructure. BSM has a good CLI (`bws`) and a sensible API, but there's no way to get an LLM to drive them through MCP. So here's one.

This server is a thin wrapper (~500 lines of TypeScript) around the `bws` binary. It spawns the real CLI via `child_process.spawn` (so you get real exit codes, not eval magic), parses stdout as JSON, and exposes 12 tools across project, secret, status, and run operations.

## What it does

| Tool | Purpose | Risk |
|---|---|---|
| `bws_status` | Report bws version, whether a token is set, whether the API is reachable | read |
| `bws_project_list` | List every project the machine token can see | read |
| `bws_project_get` | Fetch one project by UUID | read |
| `bws_project_create` | Create a new project | write |
| `bws_project_edit` | Rename a project | write |
| `bws_project_delete` | Delete a project | **destructive** (requires `confirm: true`) |
| `bws_secret_list` | List secrets in a project (values redacted by default) | read |
| `bws_secret_get` | Fetch one secret with its plaintext value | read |
| `bws_secret_create` | Create a secret inside a project | write |
| `bws_secret_edit` | Update a secret's key, value, note, or project | write |
| `bws_secret_delete` | Delete a secret | **destructive** (requires `confirm: true`) |
| `bws_run` | Run a shell command with secrets injected as env vars | **execution** (requires `confirm: true`) |

The destructive tools reject any call that doesn't include `{"confirm": true}` in the arguments. That check happens as the very first thing in each handler, before anything else runs. It's a policy gate, not a cryptographic barrier — the model can still pass `confirm: true` if it decides to — but it forces the decision to the surface instead of letting a "delete everything" ask slip through on a single turn.

### Tool details

A closer look at the less-obvious ones:

- **`bws_status`** runs `bws --version` first (so it works even without a token), then tries `bws project list` to see whether the token reaches the API. It returns a JSON report with `bws_version`, `token_set`, `api_reachable`, and `visible_project_count`. Call it first whenever something looks wrong.
- **`bws_secret_list`** is the only tool that behaves differently based on an argument. By default, it strips every secret's `value` and `note` down to `[REDACTED]` — so the model can see what keys exist in a project without ever seeing their plaintext. Set `include_values: true` to get the real values. Think of it as an opt-in dump.
- **`bws_secret_get`** always returns the plaintext value. There's no redaction mode here, because "get one secret by id" only makes sense when you actually need the value. If you just want to know whether a secret exists, use `bws_secret_list` and scan the `key` field.
- **`bws_secret_edit`** is the only tool where every input field is optional except the id. You have to provide at least one of `key`, `value`, `note`, or `project_id` — the schema refuses a no-op edit — but you can change any combination in a single call. That matches bws's own behavior; it's not a convenience wrapper.
- **`bws_run`** is the big one. It deserves its own section — see [How `bws_run` works](#how-bws_run-works) below.

## Setup

### 1. Install the bws CLI

The MCP server shells out to `bws`, so you need the binary somewhere on `PATH`. Grab it from the [Bitwarden releases](https://github.com/bitwarden/sdk-sm/releases) (look for `bws-<arch>-<os>.zip`) or follow the [install docs](https://bitwarden.com/help/secrets-manager-cli/). On Arch Linux it's in the AUR (`yay -S bws`). On macOS, `brew install bitwarden-sm`.

Quick sanity check:

```bash
bws --version
```

### 2. Get a machine token

Log into your Bitwarden web vault, pick the organization that owns your secrets, and go to **Secrets Manager → Machine accounts**. Create one, scope it to the projects you want this MCP server to touch, then issue an access token. It'll start with `0.`.

Keep that token somewhere safe — you can't retrieve it again, only regenerate.

### 3. Configure the environment

The server reads three env vars:

| Variable | Required? | Purpose |
|---|---|---|
| `BWS_ACCESS_TOKEN` | yes (for any real operation) | The machine token from step 2 |
| `BWS_SERVER_URL` | no | Self-hosted Bitwarden API base URL |
| `BWS_DEFAULT_PROJECT_ID` | no | Reserved for future default-project behavior |
| `BWS_BINARY` | no | Override the `bws` binary path (defaults to `bws` on PATH) |

The server will start without `BWS_ACCESS_TOKEN` set — that's intentional, so you can call `bws_status` and see a clear error message instead of a crash on boot — but every tool that touches the API will return a friendly "missing token" response until you set it.

### 4. Wire it into your client

- **Claude Desktop** — see [`examples/claude-desktop.md`](examples/claude-desktop.md)
- **Claude Code** — see [`examples/claude-code.md`](examples/claude-code.md)
- **hermes-agent** — see [`examples/hermes-agent.md`](examples/hermes-agent.md)

The TL;DR for any stdio-capable MCP client:

```json
{
  "mcpServers": {
    "bws": {
      "command": "npx",
      "args": ["-y", "@kvncrw/bws-mcp-server"],
      "env": { "BWS_ACCESS_TOKEN": "0.your-token" }
    }
  }
}
```

## A few example interactions

To give you a feel for what this looks like in practice, here are some real prompts and the tool calls they translate into. Nothing fancy — just day-to-day operator stuff you'd otherwise do from a shell.

**Prompt:** "What's in the deletemyai-staging project? Just the keys."

Claude calls `bws_secret_list` with `{ "project_id": "a4b7f3ff-...", "include_values": false }` and gets back an array of secret objects with every `value` and `note` replaced by `[REDACTED]`. The model can then reason about *which* secrets exist (is `DB_URL` set? is `STRIPE_WEBHOOK_SECRET` there?) without ever seeing the plaintext, so nothing sensitive gets pinned into the conversation context.

**Prompt:** "Rotate the Stripe webhook secret — here's the new value from the Stripe dashboard: `<pasted-value>`"

Claude calls `bws_secret_edit` with the existing secret id and the new `value`. Bitwarden returns the updated secret object, and the model confirms the revisionDate changed. If you're running this through Claude Code, the `value` you pasted shows up in the local session history — keep that in mind.

**Prompt:** "Delete the old `API_KEY_LEGACY` secret."

Claude has to call `bws_secret_delete` with `{ "id": "...", "confirm": true }`. Without the confirm, the server returns an error that reads:

> `bws_secret_delete is a destructive operation and refused to run without explicit confirmation. Re-send the request with { "confirm": true } in the arguments to proceed.`

Claude (or your MCP client's approval UI) then has to explicitly opt in. It's a policy gate, not a safety net — a model can absolutely set `confirm: true` if it's told to — but it forces the decision to the surface on every single destructive call.

**Prompt:** "Run `./scripts/smoke-test.sh` with staging secrets."

Claude calls `bws_run` with `{ "command": "./scripts/smoke-test.sh", "project_id": "staging-uuid", "confirm": true }`. The MCP server shells out to `bws run --project-id staging-uuid -- sh -c './scripts/smoke-test.sh'`, which starts the script with every secret in that project already exported as environment variables. The tool returns stdout, stderr, and exit code separately, so the model can reason about pass/fail without you having to parse interleaved output.

## How `bws_run` works

`bws_run` is the most powerful tool in the set, and probably the one you'll reach for more often than the CRUD tools. It wraps `bws run --project-id <id> -- sh -c '<command>'`, which is Bitwarden's way of saying "fetch every secret I can see, set them as environment variables, then exec this child command."

So if you've got a secret `DB_URL` in project `deletemyai-staging`, and you ask the model:

> Run `psql -c "SELECT count(*) FROM users"` against the staging DB.

…the model can call `bws_run` with `{ "command": "psql -c 'SELECT count(*) FROM users'", "project_id": "deletemyai-staging-uuid", "confirm": true }`, and the `psql` process will start up with `DB_URL` already in its environment. No file writes, no manual export, no leaking the value through the model's context (the plaintext only ever lives in the child process).

Two knobs worth knowing about:

- **`project_id`** scopes which secrets get injected. If you leave it off, you get everything the token can see, which is usually too much.
- **`no_inherit_env`** starts the child from a clean environment, with only the injected secrets. Useful when you want to guarantee the command can't see anything from the MCP server's own environment.

The tool returns `stdout`, `stderr`, and `exit_code` — all three, separately, so the model can reason about success and failure without you having to parse a glob of interleaved output.

A few patterns that work well:

- **One-shot database queries.** `psql -c 'SELECT ...'`, `redis-cli GET foo`, `mongosh --eval '...'`. The credential stays inside the child process; it doesn't flow back through the model unless you `echo` it.
- **Deploy scripts.** If your `deploy.sh` reads `DEPLOY_TOKEN` from the environment, `bws_run` is the cleanest way to hand it a token without writing a temp file.
- **Sanity checks.** `curl -sf "$API_URL/health"`, `kubectl get pods`, `helm list -A`. Great for "is staging up?" style questions.

And a few that don't work well:

- **Interactive commands.** `bws_run` doesn't give you a TTY. Anything that expects a terminal (editors, TUIs, interactive prompts) will probably hang.
- **Long-running processes.** The server waits for the child to exit before returning. If you `exec` a web server here, you'll wedge the whole conversation until it crashes.
- **Commands where the secret is the output.** `echo "$DB_URL"` works mechanically, but the secret ends up in the model's context and the LLM provider's logs. If that's what you want, `bws_secret_get` is usually a better fit (and still surfaces the value to the model — there's no way around that).

## Configuration reference

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BWS_ACCESS_TOKEN` | for real operations | — | The machine token. Starts with `0.`. |
| `BWS_SERVER_URL` | no | `https://api.bitwarden.com` | Override for self-hosted Bitwarden. |
| `BWS_DEFAULT_PROJECT_ID` | no | — | Reserved for future default-project ergonomics. Not used yet. |
| `BWS_BINARY` | no | `bws` | Path to the bws binary. Useful for non-standard installs. |
| `BWS_STATE_FILE` | no | — | Forwarded to bws; controls where the CLI caches state. |

The server deliberately does **not** inherit the full parent process environment into the `bws` subprocess. Only `PATH`, `HOME`, and the four `BWS_*` vars above are forwarded. That's a belt-and-suspenders move against accidental leakage — your `AWS_SECRET_ACCESS_KEY` in the MCP server's environment shouldn't end up as a env var on every `bws run` call.

## Security notes

See [SECURITY.md](SECURITY.md) for the full threat model. The short version: this server is as safe as the machine token you give it. Scope tokens narrowly, run the server as a non-root user, and remember that anything returned from `bws_secret_get` or `bws_secret_list --include-values` flows back to the model — and from there, possibly to the model provider. Prefer listing keys without values when the model only needs to know what's there.

Two specific recommendations worth calling out:

1. **One token per MCP deployment, scoped narrowly.** Don't reuse an org-wide admin token across every instance of Claude Desktop you own. Create a fresh machine account per machine (or per agent), give it access to exactly the projects that context should see, and rotate it if anything feels off.
2. **Audit your `bws_run` usage.** It's gated, but gates aren't airtight. If you're exposing this server to an automated agent that can self-approve, treat `bws_run` as equivalent to giving the agent a root shell on whatever box the server is running on. That might be fine for a homelab; it's probably not fine for production.

## Architecture

This is a deliberately thin wrapper. The interesting bits all live in a handful of files:

```
src/
├── index.ts          # entrypoint — shebang, runServer()
├── server.ts         # MCP server bootstrap + handler wiring
├── config.ts         # env var loading, buildSpawnEnv()
├── bws/
│   ├── client.ts     # spawn('bws', [...]) wrapper + typed helpers
│   ├── errors.ts     # BwsError + stderr-to-message mapping
│   └── types.ts      # JSON shapes from bws output
└── tools/
    ├── index.ts      # exports allTools[] + toolHandlers map
    ├── types.ts      # requireConfirm() gate + result helpers
    ├── status.ts     # bws_status
    ├── projects.ts   # bws_project_*
    ├── secrets.ts    # bws_secret_*
    └── run.ts        # bws_run
```

A `tools/call` request flows through the server like this:

1. The MCP SDK dispatches the request to our handler in `server.ts`.
2. We look up the tool name in `toolHandlers` and call the matching function.
3. The handler parses args with zod, checks the confirm gate if the tool is destructive, and calls a typed helper in `bws/client.ts`.
4. `client.ts` spawns `bws` with the right argv, captures stdout/stderr, and either parses the JSON or throws a `BwsError` with a friendly message.
5. The handler wraps the result into `{ content: [{ type: 'text', text: '...' }] }` and returns it up the stack.

The whole wrapper is around 500 lines of TypeScript excluding tests. That's intentional — every extra layer between the model and `bws` is another place for bugs to hide. Keep the translation dumb and the tests real.

## Running in Docker

There's a `docker/Dockerfile` in the repo that builds a Debian-based image (`node:22-bookworm-slim`) with the `bws` binary pre-installed. Run it like this:

```bash
docker build -t bws-mcp-server -f docker/Dockerfile .
docker run --rm -i \
  -e BWS_ACCESS_TOKEN="$BWS_ACCESS_TOKEN" \
  bws-mcp-server
```

The container runs as a non-root user (`bwsmcp`) by default and speaks MCP over stdin/stdout, so it slots into any MCP client that can spawn a process. No Alpine involved — `bws` is distributed as a glibc binary, and I'd rather not fight `musl` shims.

## Development

```bash
git clone https://github.com/kvncrw/bws-mcp-server.git
cd bws-mcp-server
npm install
npm run lint
npm run build
npm run test:unit
npm run test:protocol
```

The test strategy has three tiers, and none of them use mocking libraries:

1. **Unit tests** (`tests/unit/`) — pure functions, no subprocesses. Exercise the argv builders, the stderr parser, the confirm-gate helper, and the zod schemas. Always green, zero external deps.
2. **Protocol E2E tests** (`tests/protocol/`) — spawn the real built MCP server as a subprocess and talk JSON-RPC to it over stdio. The "bws" binary it calls is a shell script at `tests/protocol/fixtures/bws-stub.sh` that emits canned JSON. Not a mock — a real executable with stub behavior, which the test harness puts on `PATH`.
3. **Integration tests** (`tests/integration/`) — call the real `bws` binary against a real BSM project. Gated behind `BWS_ACCESS_TOKEN_TEST` and `BWS_TEST_PROJECT_ID`; the `describe` block gets skipped (with a logged reason) when those are unset.

### Why real subprocess tests instead of mocks?

Because the whole point of this server is wrapping a subprocess. If you mock `child_process.spawn`, you're testing a fiction — you've stubbed out the exact layer where the bugs actually live. Argument escaping, PATH resolution, stdin/stdout buffering, exit code propagation, environment variable forwarding: all of that is invisible to a mock and painfully visible in production.

The stub `bws-stub.sh` script used in protocol tests is a real executable. It's on the real PATH. The real MCP server process calls `spawn('bws', [...])` on it with the real argv encoding. The only thing that's different from production is the JSON comes from a shell `echo` instead of the Bitwarden API. Every other layer is exercised end to end.

It's a small thing, but it's the difference between tests that pass and tests that catch bugs.

### Coverage

Each tier only runs when you ask for it:

```bash
npm run test:unit         # always safe
npm run test:protocol     # requires a prior `npm run build`
npm run test:integration  # requires real BSM credentials
```

The default `npm test` runs unit + protocol + integration; integration will skip cleanly if the env vars aren't there. CI (via `.github/workflows/ci.yml`) runs lint + build + unit + protocol on every PR. A separate `integration.yml` workflow runs against real BSM on pushes to `main` — that one requires `BWS_ACCESS_TOKEN_TEST` and `BWS_TEST_PROJECT_ID` to be set as GitHub repository secrets.

## FAQ

**Why 12 tools? Couldn't you collapse some?**
You could fold `bws_project_edit` into `bws_project_create` with an "if exists, update" mode, and probably the same for secrets. I chose not to because it makes the LLM's decisions more legible. When the model says "I'm going to call `bws_secret_delete`," you know exactly what's about to happen. A polymorphic `bws_secret` tool with a `mode: "delete"` parameter hides that intent one level deeper.

**Why GPL-3.0 instead of MIT?**
Upstream `bitwarden/mcp-server` is GPL, and I wanted this to live in the same license family so anything that borrows from that side of the ecosystem can flow both ways. It's not a statement about licensing philosophy — it's just the path of least friction.

**Does this work with non-Claude MCP clients?**
Yes, in theory. The server implements the MCP stdio transport and speaks standard JSON-RPC. Any client that can spawn a process and talk MCP should work — Continue, Cursor, hermes-agent, Zed, whatever. I've only actively tested it with Claude Desktop, Claude Code, and hermes-agent, so if you hit something weird with another client, open an issue.

**What about the Bitwarden Secrets Manager API directly — why use the CLI?**
Two reasons. First, the CLI's already maintained by Bitwarden, so this repo gets a free ride on their release cycle for things like auth token rotation and self-hosted support. Second, the CLI gives us `bws run`, which is the single most useful thing in the whole toolkit — and there's no clean API-level equivalent.

**Can I add my own tools?**
Sure. Look at `src/tools/` for the pattern — a tool is a `Tool` object (name, description, JSON-schema input) plus an async handler function that takes parsed args and returns `ToolHandlerResult`. Add both to `src/tools/index.ts` and you're done. Keep it close to the 1:1-with-bws-subcommand philosophy, though — this isn't the right place for high-level orchestration.

```bash
git clone https://github.com/kvncrw/bws-mcp-server.git
cd bws-mcp-server
npm install
npm run lint
npm run build
npm run test:unit
npm run test:protocol
```

The test strategy has three tiers, and none of them use mocking libraries:

1. **Unit tests** (`tests/unit/`) — pure functions, no subprocesses. Exercise the argv builders, the stderr parser, the confirm-gate helper, and the zod schemas. Always green, zero external deps.
2. **Protocol E2E tests** (`tests/protocol/`) — spawn the real built MCP server as a subprocess and talk JSON-RPC to it over stdio. The "bws" binary it calls is a shell script at `tests/protocol/fixtures/bws-stub.sh` that emits canned JSON. Not a mock — a real executable with stub behavior, which the test harness puts on `PATH`.
3. **Integration tests** (`tests/integration/`) — call the real `bws` binary against a real BSM project. Gated behind `BWS_ACCESS_TOKEN_TEST` and `BWS_TEST_PROJECT_ID`; the `describe` block gets skipped (with a logged reason) when those are unset.

Each tier only runs when you ask for it:

```bash
npm run test:unit         # always safe
npm run test:protocol     # requires a prior `npm run build`
npm run test:integration  # requires real BSM credentials
```

The default `npm test` runs unit + protocol + integration; integration will skip cleanly if the env vars aren't there.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: no mocks, no Alpine, conventional commits, keep the tool surface small.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE). This matches upstream `bitwarden/mcp-server`, which is GPL-licensed for the same reasons.
