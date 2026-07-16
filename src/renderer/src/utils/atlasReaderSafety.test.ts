import { describe, expect, it, vi } from 'vitest';
import { createKeyedSerialTask, isAllowedPathOfPathingUrl } from '../../../shared/atlasReaderSafety';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('isAllowedPathOfPathingUrl', () => {
  it('accepts only exact HTTPS pathofpathing URLs', () => {
    expect(isAllowedPathOfPathingUrl('https://pathofpathing.com/?v=3.28#tree')).toBe(true);
    expect(isAllowedPathOfPathingUrl('http://pathofpathing.com/')).toBe(false);
    expect(isAllowedPathOfPathingUrl('https://www.pathofpathing.com/')).toBe(false);
    expect(isAllowedPathOfPathingUrl('https://pathofpathing.com.evil.example/')).toBe(false);
    expect(isAllowedPathOfPathingUrl('not a URL')).toBe(false);
  });
});

describe('createKeyedSerialTask', () => {
  it('shares one in-flight task for identical keys', async () => {
    const gate = deferred<string>();
    const task = vi.fn(() => gate.promise);
    const run = createKeyedSerialTask(task);

    const first = run('tree-a');
    const duplicate = run('tree-a');
    await Promise.resolve();

    expect(first).toBe(duplicate);
    expect(task).toHaveBeenCalledTimes(1);
    gate.resolve('stats-a');
    await expect(first).resolves.toBe('stats-a');
  });

  it('serialises different keys and preserves each result', async () => {
    const firstGate = deferred<string>();
    const secondGate = deferred<string>();
    let active = 0;
    let maximumActive = 0;
    const task = vi.fn(async (key: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const value = await (key === 'tree-a' ? firstGate.promise : secondGate.promise);
      active -= 1;
      return value;
    });
    const run = createKeyedSerialTask(task);

    const first = run('tree-a');
    const second = run('tree-b');
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);

    firstGate.resolve('stats-a');
    await expect(first).resolves.toBe('stats-a');
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(2);

    secondGate.resolve('stats-b');
    await expect(second).resolves.toBe('stats-b');
    expect(maximumActive).toBe(1);
  });

  it('continues after a rejected task', async () => {
    const task = vi.fn(async (key: string) => {
      if (key === 'bad') throw new Error('failed');
      return key;
    });
    const run = createKeyedSerialTask(task);

    await expect(run('bad')).rejects.toThrow('failed');
    await expect(run('good')).resolves.toBe('good');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
