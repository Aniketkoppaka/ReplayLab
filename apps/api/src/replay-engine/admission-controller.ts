/**
 * Admission controller / bounded concurrency limiter for ReplayLab.
 *
 * NOTE: This is a process-local concurrency limiter.
 * It manages permits and bounded queues within a single Node.js process.
 * In a multi-replica or multi-worker deployment, global concurrency across
 * independent processes requires a distributed coordination layer (such as Redis or BullMQ).
 * However, this process-local limiter acts as the node-level safeguard ensuring that
 * individual processes never exceed their allocated connection/memory quotas.
 */

export interface ConcurrencyLimiterOptions {
  /** Maximum number of concurrent tasks allowed to run simultaneously. Default: 10 */
  maxConcurrent?: number;
  /** Maximum number of tasks queued waiting for a permit. Default: 50 */
  maxQueueSize?: number;
  /** Maximum milliseconds a task may wait in queue before timing out. Default: 10000ms */
  queueTimeoutMs?: number;
}

export class ConcurrencyAdmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyAdmissionError';
  }
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout | null;
}

export class ConcurrencyAdmissionController {
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;
  private readonly queueTimeoutMs: number;

  private runningCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queue: Array<QueuedTask<any>> = [];

  constructor(options: ConcurrencyLimiterOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 10);
    this.maxQueueSize = Math.max(0, options.maxQueueSize ?? 50);
    this.queueTimeoutMs = Math.max(100, options.queueTimeoutMs ?? 10000);
  }

  public get running(): number {
    return this.runningCount;
  }

  public get queued(): number {
    return this.queue.length;
  }

  public get capacity(): number {
    return this.maxConcurrent;
  }

  /**
   * Executes an async operation with guaranteed permit acquisition and release.
   * If running tasks < maxConcurrent, immediately acquires a permit and runs.
   * If running tasks == maxConcurrent, places task into bounded wait queue.
   * If queue is full, immediately rejects with ConcurrencyAdmissionError.
   * Permits are GUARANTEED to be released on success, timeout, network failure, or error.
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.runningCount < this.maxConcurrent) {
      this.runningCount++;
      try {
        return await fn();
      } finally {
        this.releasePermit();
      }
    }

    if (this.queue.length >= this.maxQueueSize) {
      throw new ConcurrencyAdmissionError(
        `CONCURRENCY_LIMIT_EXCEEDED: Replay queue is saturated (${this.queue.length}/${this.maxQueueSize} queued, ${this.runningCount}/${this.maxConcurrent} active)`
      );
    }

    return new Promise<T>((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;

      const queuedTask: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        timer: null,
      };

      timer = setTimeout(() => {
        // Remove from queue
        const idx = this.queue.indexOf(queuedTask);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(
            new ConcurrencyAdmissionError(
              `CONCURRENCY_QUEUE_TIMEOUT: Waited longer than ${this.queueTimeoutMs}ms for execution permit`
            )
          );
        }
      }, this.queueTimeoutMs);

      queuedTask.timer = timer;
      this.queue.push(queuedTask);
    });
  }

  private releasePermit(): void {
    this.runningCount--;

    if (this.queue.length > 0 && this.runningCount < this.maxConcurrent) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        if (nextTask.timer) {
          clearTimeout(nextTask.timer);
        }
        this.runningCount++;
        // Execute detached from the calling context but ensuring permit release on completion
        (async () => {
          try {
            const result = await nextTask.fn();
            nextTask.resolve(result);
          } catch (err) {
            nextTask.reject(err);
          } finally {
            this.releasePermit();
          }
        })();
      }
    }
  }

  /**
   * Resets the limiter state, clearing and rejecting any queued tasks.
   */
  public reset(): void {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        if (task.timer) clearTimeout(task.timer);
        task.reject(new ConcurrencyAdmissionError('CONCURRENCY_CONTROLLER_RESET'));
      }
    }
    this.runningCount = 0;
  }
}

/**
 * Default process-wide Replay Engine admission controller singleton.
 * Configured conservatively: max 20 concurrent replays, 100 queued.
 */
export const globalReplayLimiter = new ConcurrencyAdmissionController({
  maxConcurrent: 20,
  maxQueueSize: 100,
  queueTimeoutMs: 15000,
});
