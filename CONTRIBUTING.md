# Contributing

Contributions are welcome. A few ground rules to keep the feedback loop short:

1. **No mocking libraries.** This repo uses real subprocesses, real stub binaries, and real BSM for its integration tests. Don't import `jest.mock`, `sinon`, or `nock`.
2. **No Alpine containers.** The Dockerfile uses Debian. Glibc-based images are a hard requirement because of how the `bws` binary is distributed.
3. **Conventional commits.** Prefix your commit messages with `feat:`, `fix:`, `chore:`, `docs:`, `test:`, etc.
4. **Keep the tool surface small.** If you're adding a new tool, it should map roughly 1:1 to a `bws` subcommand. Anything that wraps multiple commands into one convenience action probably belongs in a downstream project.
5. **Run the full local verification before opening a PR**:
   ```bash
   npm run lint
   npm run build
   npm run test:unit
   npm run test:protocol
   ```

## Running integration tests locally

You need a real Bitwarden Secrets Manager machine token scoped to a disposable project.

```bash
export BWS_ACCESS_TOKEN_TEST='0.xxxxx...'
export BWS_TEST_PROJECT_ID='a4b7f3ff-...'
npm run test:integration
```

Do **not** commit the token. Integration tests create secrets with a `mcp-test-` prefix and clean up after themselves, but double-check the project is empty before running against any shared environment.

## Code style

Prettier + ESLint. Just run `npm run lint:fix` before committing — that handles most of it.
