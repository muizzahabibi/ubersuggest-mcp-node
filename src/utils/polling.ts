import { PollTimeoutError } from './errors.js'

export async function pollUntil<T>(
  action: () => Promise<T>,
  isDone: (value: T) => boolean,
  intervalMs: number,
  timeoutMs: number,
): Promise<T> {
  const startedAt = Date.now()

  while (true) {
    const value = await action()
    if (isDone(value)) {
      return value
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new PollTimeoutError(`Polling timed out after ${timeoutMs}ms`)
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
