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

  it('guarantees strict FIFO execution order for queued requests', async () => {
    const limiter = new ConcurrencyAdmissionController({
      maxConcurrent: 1,
      maxQueueSize: 10,
    });

    const executionOrder: number[] = [];
    const blocker = () => new Promise((r) => setTimeout(r, 30));

    // Fill capacity
    const active = limiter.run(async () => {
      await blocker();
      executionOrder.push(0);
    });

    // Enqueue 3 tasks in order 1, 2, 3
    const q1 = limiter.run(async () => {
      executionOrder.push(1);
    });
    const q2 = limiter.run(async () => {
      executionOrder.push(2);
    });
    const q3 = limiter.run(async () => {
      executionOrder.push(3);
    });

    await Promise.all([active, q1, q2, q3]);
    expect(executionOrder).toEqual([0, 1, 2, 3]);
  });

  it('proves that rejected work does not execute', async () => {
    const limiter = new ConcurrencyAdmissionController({
      maxConcurrent: 1,
      maxQueueSize: 0, // No queue
    });

    let executed = false;
    const taskThatMustNotRun = async () => {
      executed = true;
      return 'executed';
    };

    // Saturate with active task
    const active = limiter.run(() => new Promise((r) => setTimeout(r, 50)));

    // Second task rejected immediately
    await expect(limiter.run(taskThatMustNotRun)).rejects.toThrow('CONCURRENCY_LIMIT_EXCEEDED');

    await active;
    expect(executed).toBe(false);
  });

  it('handles task cancellation via AbortSignal cleanly while queued without permit leakage', async () => {
    const limiter = new ConcurrencyAdmissionController({
      maxConcurrent: 1,
      maxQueueSize: 5,
    });

    const controller = new AbortController();
    const slowTask = () => new Promise((r) => setTimeout(r, 50));

    // Active
    const p1 = limiter.run(slowTask);

    // Queued with abort controller
    let queuedRan = false;
    const p2 = limiter.run(async () => {
      queuedRan = true;
    }, controller.signal);

    expect(limiter.queued).toBe(1);

    // Cancel while queued
    controller.abort();

    await expect(p2).rejects.toThrow('CONCURRENCY_ABORTED');
    expect(limiter.queued).toBe(0);

    // Wait for active task to complete
    await p1;
    expect(queuedRan).toBe(false);
    expect(limiter.running).toBe(0);

    // Verify permits remain fully functional
    const nextResult = await limiter.run(async () => 'ok');
    expect(nextResult).toBe('ok');
    expect(limiter.running).toBe(0);
  });
});
