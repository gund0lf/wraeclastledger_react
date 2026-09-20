/** One status request at a time, including manual retries. False means terminal. */
export function startAuthorPolling(poll: () => Promise<boolean>, onError: () => void) {
  let stopped = false, running = false, retryQueued = false, attempt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    if (stopped || running) return
    running = true
    let again = true
    try { again = await poll() }
    catch { if (!stopped) onError() }
    finally {
      running = false
      if (!stopped && (again || retryQueued)) {
        const delay = retryQueued ? 0 : [2000, 4000, 8000, 15000][Math.min(attempt++, 3)]
        retryQueued = false
        timer = setTimeout(() => void run(), delay)
      }
    }
  }
  void run()
  return {
    retry() {
      if (stopped) return
      clearTimeout(timer)
      attempt = 0
      if (running) retryQueued = true
      else void run()
    },
    stop() { stopped = true; clearTimeout(timer) },
  }
}
