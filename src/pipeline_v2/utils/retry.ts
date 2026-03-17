export async function withRetry<T>(
  action: () => Promise<T>,
  retries: number,
  delayMs: number
): Promise<{ value: T; attempts: number }> {
  let attempts = 0;
  let lastError: unknown = null;

  while (attempts <= retries) {
    attempts += 1;
    try {
      const value = await action();
      return { value, attempts };
    } catch (error) {
      lastError = error;
      if (attempts > retries) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("withRetry failed with unknown error");
}
