/**
 * Thin wrapper around the `bws` CLI binary.
 *
 * Every call spawns a real subprocess via child_process.spawn (NOT exec,
 * because exec buffers stdout and chokes on large secret lists). stdout
 * and stderr are captured separately, and we parse stdout as JSON when
 * the exit code is 0. Errors go through mapBwsError for a friendly
 * single-line message.
 */

import { spawn } from 'child_process';
import type { SpawnOptions } from 'child_process';
import {
  BwsError,
  BwsMissingTokenError,
  BwsNotInstalledError,
  mapBwsError,
} from './errors.js';
import type { BwsConfig } from '../config.js';
import { buildSpawnEnv } from '../config.js';
import type { BwsProject, BwsSecret } from './types.js';

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Raw spawn — used directly by a couple of tools that need access to the
 * exit code and stderr without JSON parsing (e.g. `bws_status`).
 */
export async function spawnBws(
  config: BwsConfig,
  args: readonly string[],
  opts: { requireToken?: boolean; stdin?: string } = {},
): Promise<SpawnResult> {
  if (opts.requireToken !== false && !config.accessToken) {
    throw new BwsMissingTokenError();
  }

  return new Promise<SpawnResult>((resolve, reject) => {
    const spawnOpts: SpawnOptions = {
      env: buildSpawnEnv(config),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    const child = spawn(config.bwsBinary, [...args], spawnOpts);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new BwsNotInstalledError(config.bwsBinary));
        return;
      }
      reject(err);
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? -1,
      });
    });

    if (opts.stdin !== undefined) {
      child.stdin?.end(opts.stdin);
    } else {
      child.stdin?.end();
    }
  });
}

/**
 * Run bws and parse stdout as JSON. Throws BwsError on non-zero exit.
 *
 * Note: Most bws commands return JSON, but `bws project delete` and
 * `bws secret delete` return a plain-text confirmation line like
 * "1 secret deleted successfully." If the stdout doesn't look like JSON
 * (i.e. doesn't start with `{` or `[` after trimming), we treat it as a
 * non-JSON success response and return null instead of throwing.
 */
export async function runBwsJson<T>(
  config: BwsConfig,
  args: readonly string[],
): Promise<T> {
  const result = await spawnBws(config, args);
  if (result.exitCode !== 0) {
    throw new BwsError(
      mapBwsError(result.stderr, result.exitCode),
      result.exitCode,
      result.stderr,
    );
  }
  const trimmed = result.stdout.trim();
  if (trimmed.length === 0) {
    return null as unknown as T;
  }
  // bws delete commands return plain text, not JSON. Detect by leading char.
  const first = trimmed[0];
  if (first !== '{' && first !== '[') {
    return null as unknown as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new BwsError(
      `Failed to parse bws stdout as JSON: ${(err as Error).message}. Raw output: ${trimmed.slice(0, 200)}`,
      result.exitCode,
      result.stderr,
    );
  }
}

// Typed helpers for each tool.

export async function bwsVersion(config: BwsConfig): Promise<string> {
  const result = await spawnBws(config, ['--version'], {
    requireToken: false,
  });
  if (result.exitCode !== 0) {
    throw new BwsError(
      mapBwsError(result.stderr, result.exitCode),
      result.exitCode,
      result.stderr,
    );
  }
  return result.stdout.trim();
}

export async function listProjects(
  config: BwsConfig,
): Promise<BwsProject[]> {
  return runBwsJson<BwsProject[]>(config, ['project', 'list']);
}

export async function getProject(
  config: BwsConfig,
  id: string,
): Promise<BwsProject> {
  return runBwsJson<BwsProject>(config, ['project', 'get', id]);
}

export async function createProject(
  config: BwsConfig,
  name: string,
): Promise<BwsProject> {
  return runBwsJson<BwsProject>(config, ['project', 'create', name]);
}

export async function editProject(
  config: BwsConfig,
  id: string,
  name: string,
): Promise<BwsProject> {
  return runBwsJson<BwsProject>(config, [
    'project',
    'edit',
    id,
    '--name',
    name,
  ]);
}

export async function deleteProject(
  config: BwsConfig,
  id: string,
): Promise<unknown> {
  return runBwsJson<unknown>(config, ['project', 'delete', id]);
}

export async function listSecrets(
  config: BwsConfig,
  projectId?: string,
): Promise<BwsSecret[]> {
  const args = projectId
    ? ['secret', 'list', projectId]
    : ['secret', 'list'];
  return runBwsJson<BwsSecret[]>(config, args);
}

export async function getSecret(
  config: BwsConfig,
  id: string,
): Promise<BwsSecret> {
  return runBwsJson<BwsSecret>(config, ['secret', 'get', id]);
}

export async function createSecret(
  config: BwsConfig,
  key: string,
  value: string,
  projectId: string,
  note?: string,
): Promise<BwsSecret> {
  const args = ['secret', 'create', key, value, projectId];
  if (note !== undefined) {
    args.push('--note', note);
  }
  return runBwsJson<BwsSecret>(config, args);
}

export interface EditSecretInput {
  id: string;
  key?: string;
  value?: string;
  note?: string;
  projectId?: string;
}

export async function editSecret(
  config: BwsConfig,
  input: EditSecretInput,
): Promise<BwsSecret> {
  const args: string[] = ['secret', 'edit', input.id];
  if (input.key !== undefined) args.push('--key', input.key);
  if (input.value !== undefined) args.push('--value', input.value);
  if (input.note !== undefined) args.push('--note', input.note);
  if (input.projectId !== undefined)
    args.push('--project-id', input.projectId);
  return runBwsJson<BwsSecret>(config, args);
}

export async function deleteSecret(
  config: BwsConfig,
  id: string,
): Promise<unknown> {
  return runBwsJson<unknown>(config, ['secret', 'delete', id]);
}

/**
 * Build argv for `bws run` — takes an explicit argv tail (program + args)
 * that gets forwarded to the child process directly. We deliberately do
 * NOT default to wrapping in `sh -c`; the previous shape exposed two
 * problems we don't want to ship:
 *
 *   1. Eval-equivalent risk. An MCP tool that takes a free-form shell
 *      string and pipes it to `sh -c` is a remote-code-execution surface
 *      for the LLM driving the agent. Direct argv keeps the user in
 *      control of what runs.
 *   2. /bin/sh portability. On Debian /bin/sh is dash; on Arch and macOS
 *      it's bash; on Alpine it's busybox ash. Each has subtly different
 *      builtin behavior (printf, echo, expansion rules) and bash also
 *      slurps exported function definitions from the parent env, which
 *      breaks reproducibility across hosts.
 *
 * If callers genuinely need a shell, they can pass `['sh', '-c', cmd]`
 * explicitly — we just don't default to it.
 */
export function buildRunArgs(input: {
  argv: readonly string[];
  projectId?: string;
  noInheritEnv?: boolean;
}): string[] {
  if (!input.argv || input.argv.length === 0) {
    throw new Error('buildRunArgs: argv must contain at least one element');
  }
  const args: string[] = ['run'];
  if (input.projectId) {
    args.push('--project-id', input.projectId);
  }
  if (input.noInheritEnv) {
    args.push('--no-inherit-env');
  }
  args.push('--', ...input.argv);
  return args;
}

export async function runWithSecrets(
  config: BwsConfig,
  input: {
    argv: readonly string[];
    projectId?: string;
    noInheritEnv?: boolean;
  },
): Promise<SpawnResult> {
  const args = buildRunArgs(input);
  return spawnBws(config, args);
}
