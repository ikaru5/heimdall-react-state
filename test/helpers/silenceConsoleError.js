import { jest } from "@jest/globals";

/**
 * Temporarily silences console.error while executing the provided callback.
 * Ensures React error logging for expected failures does not pollute test output.
 *
 * @template T
 * @param {() => T} callback
 * @returns {T}
 */
export function silenceConsoleError(callback) {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    return callback();
  } finally {
    spy.mockRestore();
  }
}
