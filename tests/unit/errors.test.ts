/**
 * Unit tests for the bws stderr → user-facing message mapping.
 * The stderr fixtures below were captured from real `bws` runs.
 */

import { describe, expect, test } from '@jest/globals';
import {
  BwsError,
  BwsMissingTokenError,
  BwsNotInstalledError,
  formatBwsStderr,
  mapBwsError,
} from '../../src/bws/errors.js';

describe('formatBwsStderr', () => {
  test('collapses the Error:\\n   0: message\\nLocation: format to one line', () => {
    const raw =
      'Error: \n   0: Missing access token\n\nLocation:\n   crates/bws/src/main.rs:66\n';
    expect(formatBwsStderr(raw)).toBe('Missing access token');
  });

  test('handles single-line errors untouched', () => {
    expect(formatBwsStderr('boom')).toBe('boom');
  });

  test('strips multiple numeric chain prefixes', () => {
    const raw =
      'Error: \n   0: top level\n   1: root cause\n\nLocation:\n   foo.rs:1';
    expect(formatBwsStderr(raw)).toBe('top level: root cause');
  });

  test('returns a placeholder on empty stderr', () => {
    expect(formatBwsStderr('')).toContain('empty');
    expect(formatBwsStderr('   ')).toContain('empty');
  });
});

describe('mapBwsError', () => {
  test('recognizes Missing access token', () => {
    const msg = mapBwsError('Error: \n   0: Missing access token', 1);
    expect(msg.toLowerCase()).toContain('missing access token');
    expect(msg).toContain('BWS_ACCESS_TOKEN');
  });

  test('recognizes 401 responses as token rejection', () => {
    const msg = mapBwsError(
      'Error: \n   0: request failed with status 401',
      1,
    );
    expect(msg).toContain('401');
    expect(msg.toLowerCase()).toContain('rejected');
  });

  test('recognizes 403 / forbidden', () => {
    const msg = mapBwsError('Error: \n   0: 403 forbidden', 1);
    expect(msg.toLowerCase()).toContain('forbidden');
  });

  test('recognizes 404 as not-found', () => {
    const msg = mapBwsError('Error: \n   0: 404 not found', 1);
    expect(msg.toLowerCase()).toContain('not found');
  });

  test('falls through to cleaned stderr for unknown errors', () => {
    const msg = mapBwsError('Error: \n   0: something unexpected', 1);
    expect(msg).toBe('something unexpected');
  });

  test('emits a placeholder when stderr is empty and exit is nonzero', () => {
    const msg = mapBwsError('', 127);
    expect(msg).toContain('127');
  });
});

describe('error classes', () => {
  test('BwsError carries exit code and raw stderr', () => {
    const err = new BwsError('oops', 42, 'raw');
    expect(err.name).toBe('BwsError');
    expect(err.exitCode).toBe(42);
    expect(err.rawStderr).toBe('raw');
  });

  test('BwsNotInstalledError mentions the binary name', () => {
    const err = new BwsNotInstalledError('bws');
    expect(err.message).toContain('bws');
    expect(err.message.toLowerCase()).toContain('install');
  });

  test('BwsMissingTokenError mentions BWS_ACCESS_TOKEN', () => {
    const err = new BwsMissingTokenError();
    expect(err.message).toContain('BWS_ACCESS_TOKEN');
  });
});
