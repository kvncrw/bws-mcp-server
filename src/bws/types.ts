/**
 * Type definitions mirroring the JSON shapes emitted by the bws CLI.
 * These were captured from real `bws project list` / `bws secret list`
 * output against a live BSM organization.
 */

export interface BwsProject {
  object?: 'project';
  id: string;
  organizationId: string;
  name: string;
  creationDate: string;
  revisionDate: string;
}

export interface BwsSecret {
  object?: 'secret';
  id: string;
  organizationId: string;
  projectId: string | null;
  key: string;
  value: string;
  note: string;
  creationDate: string;
  revisionDate: string;
}

/**
 * A secret entry with the value scrubbed — used when the caller
 * asks for a list without explicitly opting in to `include_values`.
 */
export type BwsSecretSummary = Omit<BwsSecret, 'value' | 'note'> & {
  value: '[REDACTED]';
  note: '[REDACTED]';
};

export interface BwsVersion {
  version: string;
}

export interface BwsCliResult<T = unknown> {
  stdout: string;
  stderr: string;
  exitCode: number;
  parsed?: T;
}
