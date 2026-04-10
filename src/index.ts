#!/usr/bin/env node
/**
 * bws-mcp-server — entrypoint.
 *
 * An MCP server that wraps the Bitwarden Secrets Manager CLI (bws),
 * exposing project + secret operations as MCP tools so Claude (and other
 * MCP clients) can manage infrastructure secrets.
 */

import { runServer } from './server.js';

runServer().catch((err) => {
  console.error('Fatal error running bws-mcp-server:', err);
  process.exit(1);
});
