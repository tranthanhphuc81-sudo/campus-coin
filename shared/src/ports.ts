/**
 * ports.ts
 * Parses TCP port numbers from environment variables (API_PORT, WEB_PORT) so the API,
 * the Vite dev server and Playwright all fail fast with the same clear message.
 * Exports: parsePort
 * Spec: docs/spec/10 §11.3 (environment configuration)
 */

const MIN_PORT = 1;
const MAX_PORT = 65_535;

/**
 * Read a port from an env value, falling back to a default when unset/empty.
 * @param value - raw env value, e.g. `process.env.API_PORT`.
 * @param fallback - port used when `value` is undefined or empty.
 * @param name - variable name, used in the error message.
 * @returns the port as an integer.
 * @throws Error when the value is not an integer in 1..65535.
 */
export function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `${name} must be an integer between ${MIN_PORT} and ${MAX_PORT}, got "${value}"`,
    );
  }
  return port;
}
