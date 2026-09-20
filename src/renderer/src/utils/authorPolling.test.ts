import { afterEach, expect, it, vi } from 'vitest'
import { startAuthorPolling } from './authorPolling'

afterEach(() => vi.useRealTimers())

it('recovers from transport rejection and transient responses, then stops at terminal status', async () => {
  vi.useFakeTimers()
  const poll = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  const error = vi.fn(), controller = startAuthorPolling(poll, error)
  await vi.advanceTimersByTimeAsync(2000)
  expect(error).toHaveBeenCalledTimes(1)
  expect(poll).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(4000)
  expect(poll).toHaveBeenCalledTimes(3)
  await vi.advanceTimersByTimeAsync(60000)
  expect(poll).toHaveBeenCalledTimes(3)
  controller.stop()
})

it('caps automatic backoff and lets explicit retry run without overlapping requests', async () => {
  vi.useFakeTimers()
  const poll = vi.fn().mockResolvedValue(true)
  const controller = startAuthorPolling(poll, vi.fn())
  await vi.advanceTimersByTimeAsync(44000) // 2s + 4s + 8s + 15s + 15s
  expect(poll).toHaveBeenCalledTimes(6)
  let release!: (value: boolean) => void
  poll.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
  controller.retry(); controller.retry(); controller.retry()
  expect(poll).toHaveBeenCalledTimes(7)
  release(true)
  await vi.advanceTimersByTimeAsync(0)
  expect(poll).toHaveBeenCalledTimes(8)
  controller.stop()
  await vi.advanceTimersByTimeAsync(60000)
  expect(poll).toHaveBeenCalledTimes(8)
})

it('does not report or schedule a late failure after the panel is closed', async () => {
  vi.useFakeTimers()
  let reject!: (error: Error) => void
  const poll = vi.fn(() => new Promise<boolean>((_resolve, fail) => { reject = fail }))
  const error = vi.fn(), controller = startAuthorPolling(poll, error)
  controller.stop()
  reject(new Error('late timeout'))
  await vi.advanceTimersByTimeAsync(60000)
  expect(error).not.toHaveBeenCalled()
  expect(poll).toHaveBeenCalledTimes(1)
})
