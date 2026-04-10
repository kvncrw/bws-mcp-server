/**
 * Runtime configuration loaded from environment variables.
 *
 * We read env at call time (not module init) so tests can change
 * process.env between runs without reloading the module.
 */

export interface BwsConfig {
  accessToken: string | undefined;
  serverUrl: string | undefined;
  defaultProjectId: string | undefined;
  bwsBinary: string;
  stateFile: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BwsConfig {
  return {
    accessToken: env['BWS_ACCESS_TOKEN'],
    serverUrl: env['BWS_SERVER_URL'],
    defaultProjectId: env['BWS_DEFAULT_PROJECT_ID'],
    bwsBinary: env['BWS_BINARY'] ?? 'bws',
    stateFile: env['BWS_STATE_FILE'],
  };
}

/**
 * Returns the env vars we pass through to spawned bws processes.
 * We deliberately do NOT forward the full process.env to minimize
 * accidental leakage — only the ones bws actually reads.
 */
export function buildSpawnEnv(
  config: BwsConfig,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: base['PATH'],
    HOME: base['HOME'],
  };
  if (config.accessToken) env['BWS_ACCESS_TOKEN'] = config.accessToken;
  if (config.serverUrl) env['BWS_SERVER_URL'] = config.serverUrl;
  if (config.stateFile) env['BWS_STATE_FILE'] = config.stateFile;
  return env;
}
