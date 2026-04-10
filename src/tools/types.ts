/**
 * Shared types for tool handlers.
 */

export interface ToolHandlerResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Shape of the confirm gate shared by every destructive tool.
 * We reject the call unless the caller explicitly sets `confirm: true`.
 */
export function requireConfirm(
  args: Record<string, unknown> | undefined,
  toolName: string,
): ToolHandlerResult | null {
  const confirm = args?.['confirm'];
  if (confirm !== true) {
    return {
      content: [
        {
          type: 'text',
          text:
            `${toolName} is a destructive operation and refused to run without explicit confirmation. ` +
            `Re-send the request with { "confirm": true } in the arguments to proceed.`,
        },
      ],
      isError: true,
    };
  }
  return null;
}

export function errorResult(err: unknown): ToolHandlerResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

export function okResult(data: unknown): ToolHandlerResult {
  const text =
    typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: 'text', text }],
  };
}
