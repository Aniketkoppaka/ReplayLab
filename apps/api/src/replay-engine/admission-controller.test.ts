import { describe, it, expect } from 'vitest';
import {
  ConcurrencyAdmissionController,
  ConcurrencyAdmissionError,
} from './admission-controller.js';

describe('Concurrency Admission Controller (Resource Bounding)', () => {
  it('allows execution within concurrency limit', async () => {
    const limiter = new ConcurrencyAdmissionController({ maxConcurrent: 2 });
    let concurrent = 0;
    let maxSeen = 0;

    const task = async () => {
      concurrent++;
      maxSeen = Math.max(maxSeen, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      return 'done';
    };

    const results = await Promise.all([
      limiter.run(task),
      limiter.run(task),
      limiter.run(task),
      limiter.run(task),
    ]);

    expect(results).toEqual(['done', 'done', 'done', 'done']);
    expect(maxSeen).toBeLessThanOrEqual(2);
    expect(limiter.running).toBe(0);
    expect(limiter.queued).toBe(0);
  });

  it('rejects excess tasks when queue is saturated', async () => {
    const limiter = new ConcurrencyAdmissionController({
      maxConcurrent: 1,
      maxQueueSize: 2,
    });

    const blocker = () => new Promise((r) => setTimeout(r, 100));

    // Fill capacity (1 active)
    const p1 = limiter.run(blocker);
    // Fill queue (2 queued)
    const p2 = limiter.run(blocker);
    const p3 = limiter.run(blocker);

    // 4th request must be rejected immediately
    await expect(limiter.run(blocker)).rejects.toThrow(ConcurrencyAdmissionError);
    await expect(limiter.run(blocker)).rejects.toThrow('CONCURRENCY_LIMIT_EXCEEDED');

    await Promise.all([p1, p2, p3]);
    expect(limiter.running).toBe(0);
    expect(limiter.queued).toBe(0);
  });

  it('reliably releases permits on unhandled exceptions and errors', async () => {
    const limiter = new ConcurrencyAdmissionController({ maxConcurrent: 1 });

    const failingTask = async () => {
      throw new Error('Explosion');
    };

    await expect(limiter.run(failingTask)).rejects.toThrow('Explosion');

    // Permit MUST be available for the next task
    expect(limiter.running).toBe(0);

    const successTask = async () => 'recovered';
    const result = await limiter.run(successTask);
    expect(result).toBe('recovered');
    expect(limiter.running).toBe(0);
  });

  it('times out tasks waiting in queue if not granted permit within queueTimeoutMs', async () => {
    const limiter = new ConcurrencyAdmissionController({
      maxConcurrent: 1,
      maxQueueSize: 5,
      queueTimeoutMs: 50,
    });

    const slowBlocker = () => new Promise((r) => setTimeout(r, 200));

    const p1 = limiter.run(slowBlocker);
    const p2 = limiter.run(slowBlocker); // Waiting in queue, timeout is 50ms

    await expect(p2).rejects.toThrow('CONCURRENCY_QUEUE_TIMEOUT');

    await p1;
    expect(limiter.running).toBe(0);
    expect(limiter.queued).toBe(0);
  });
});
