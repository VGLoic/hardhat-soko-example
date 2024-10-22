/**
 * Converts a promise to a promise of a result.
 * @param promise Promise to convert
 * @returns The result of the promise
 */
export function toResult<T>(fn: () => T):
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: unknown;
    } {
  try {
    const result = fn();
    return {
      success: true,
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      error: err,
    };
  }
}

export function toAsyncResult<T, TError = Error>(
  promise: Promise<T>,
  opts: {
    debug?: boolean;
  } = {},
): Promise<{ success: true; value: T } | { success: false; error: TError }> {
  return promise
    .then((value) => ({ success: true as const, value }))
    .catch((error) => {
      if (opts.debug) {
        console.error(error);
      }
      return { success: false as const, error };
    });
}
