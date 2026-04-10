/**
 * Error types and stderr → user-facing message mapping for the bws CLI.
 *
 * The bws binary writes structured-ish error messages to stderr. They
 * look roughly like:
 *
 *   Error:
 *      0: Missing access token
 *
 *   Location:
 *      crates/bws/src/main.rs:66
 *
 * We strip the location block and normalize a few common cases so
 * MCP clients get a short, actionable message.
 */

export class BwsError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly rawStderr: string,
  ) {
    super(message);
    this.name = 'BwsError';
  }
}

export class BwsNotInstalledError extends Error {
  constructor(binary: string) {
    super(
      `The '${binary}' binary was not found on PATH. Install it from ` +
        `https://bitwarden.com/help/secrets-manager-cli/ and make sure it is executable.`,
    );
    this.name = 'BwsNotInstalledError';
  }
}

export class BwsMissingTokenError extends Error {
  constructor() {
    super(
      'BWS_ACCESS_TOKEN is not set. Export a Bitwarden Secrets Manager ' +
        'machine token in the environment of the MCP server before calling this tool.',
    );
    this.name = 'BwsMissingTokenError';
  }
}

/**
 * Turn the bws binary's multi-line error format into a single clean line.
 * Drops the `Location:` block and the file:line trailer if present.
 */
export function formatBwsStderr(stderr: string): string {
  if (!stderr || stderr.trim().length === 0) {
    return 'bws exited with an empty error message';
  }

  // Drop the Location: block and anything after it.
  const beforeLocation = stderr.split(/\n\s*Location:/i)[0] ?? stderr;

  // Collapse "Error:\n   0: message" → "message".
  const lines = beforeLocation
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== 'Error:');

  // Strip leading "0:" / "1:" chain prefixes that bws adds for nested errors.
  const cleaned = lines.map((l) => l.replace(/^\d+:\s*/, ''));

  return cleaned.join(': ').trim();
}

/**
 * Map a known stderr pattern to a more helpful message. Falls through
 * to the cleaned stderr for anything we don't recognize.
 */
export function mapBwsError(stderr: string, exitCode: number): string {
  // Special case: empty stderr with a nonzero exit — surface the code.
  if ((!stderr || stderr.trim().length === 0) && exitCode !== 0) {
    return `bws exited with code ${exitCode} and no stderr output`;
  }
  const clean = formatBwsStderr(stderr);
  const lower = clean.toLowerCase();

  if (lower.includes('missing access token')) {
    return 'Missing access token. Set BWS_ACCESS_TOKEN in the MCP server environment.';
  }
  if (lower.includes('invalid access token') || lower.includes('401')) {
    return 'The BWS access token was rejected by the server (401). Check that it is current and has not been revoked.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return `Resource not found: ${clean}`;
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return `Access forbidden: ${clean}. The machine token may lack permission for this project or secret.`;
  }
  if (exitCode !== 0 && clean.length === 0) {
    return `bws exited with code ${exitCode} and no stderr output`;
  }
  return clean;
}
