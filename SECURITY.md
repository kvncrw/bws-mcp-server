# Security

## Reporting a vulnerability

If you find something that looks like a security issue, please do **not** open a public GitHub issue. Send a report to the maintainer via a GitHub private security advisory on this repo, or open an issue titled "security disclosure request" and I'll get you a private channel. Include the usual: repro steps, affected version, and blast radius.

I'll acknowledge within a few days and aim to ship a fix before any public disclosure.

## Threat model

This project is a thin MCP wrapper around the `bws` CLI. The sensitive boundaries to be aware of:

1. **`BWS_ACCESS_TOKEN`** lives in the MCP server process environment. Anything that can read `/proc/<pid>/environ` of the server can read it. Don't run the server as root, don't share it across users, and rotate the token if it's ever exposed.
2. **MCP clients get to see every secret value they request.** When a tool returns a plaintext secret (`bws_secret_get`, `bws_secret_list` with `include_values: true`, `bws_run` stdout), that value ends up in the client's conversation history and may be sent to a model provider. Prefer `bws_secret_list` without `include_values` when the model just needs to know *which* keys exist.
3. **`bws_run` executes shell commands.** It's gated behind `confirm: true`, but the model can still ask for `confirm: true` — the confirmation is a policy gate, not a cryptographic barrier. Run the server in an isolated context when you expose this tool.

## Destructive-operation gating

Every destructive tool (`bws_project_delete`, `bws_secret_delete`, `bws_run`) rejects the call unless the caller explicitly sets `{"confirm": true}` in the arguments. The gate is enforced as the very first thing in each handler, before any schema parsing, so you can trust that a missing `confirm` never falls through to `bws`.

## Secret hygiene

- The server never writes secrets to disk.
- `bws_secret_list` redacts values and notes by default; you have to opt in with `include_values: true`.
- Integration tests use random key prefixes and clean up after themselves.

## What this server does not protect against

- A hostile or compromised MCP client. If your client is malicious, it can request anything.
- Credentials stored in a BSM project that a compromised machine token has access to. Scope your tokens tightly per-environment.
- Side channels through conversation history retention at the LLM provider. Assume anything that flows through a tool response can persist.
