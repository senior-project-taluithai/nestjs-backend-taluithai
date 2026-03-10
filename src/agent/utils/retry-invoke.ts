/**
 * Retry wrapper for LLM .invoke() calls.
 * OpenRouter sometimes returns malformed JSON in SSE streams,
 * causing "JSON error injected into SSE stream". This retries
 * with exponential backoff for transient streaming errors.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const RETRYABLE_PATTERNS = [
  'JSON error injected into SSE',
  'SSE stream',
  'ECONNRESET',
  'ETIMEDOUT',
  'socket hang up',
  'network error',
  'fetch failed',
  '429',       // rate limit
  '500',       // server error
  '502',       // bad gateway
  '503',       // service unavailable
  '529',       // overloaded
];

function isRetryable(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return RETRYABLE_PATTERNS.some((p) =>
    msg.toLowerCase().includes(p.toLowerCase()),
  );
}

/**
 * Invoke an LLM (or any async callable) with automatic retry on transient errors.
 *
 * Usage:
 *   const response = await retryInvoke(() => model.invoke(messages));
 */
export async function retryInvoke<T>(
  fn: () => Promise<T>,
  maxRetries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryable(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[retryInvoke] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${
            err instanceof Error ? err.message : err
          }. Retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }
  // Should never reach here, but TypeScript needs it
  throw lastError;
}
