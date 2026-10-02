import { createHash } from 'node:crypto'
import { AuthorHandoffVault } from './authorHandoffVault'
import { encodeDiscordShareBrotli } from './discordShareCompression'
import { buildAuthorSubmission, canonicalAuthorJson } from '../shared/authorSubmission'
import { emptyAuthorPreferences, previewAuthorRecovery } from '../shared/authorRecognition'
import {
  AUTHOR_UUID, closedAuthorObject as exact, parseAuthorOutcome, validAuthorContext,
  validateAuthorManagement, type AuthorContext, type AuthorConfirmation, type AuthorStatus,
  type PreparedAuthorRequest, type AuthorServiceState,
} from '../shared/authorHandoff'

const digest = (domain: string, text: string) => createHash('sha256').update(domain + '\0').update(text).digest('hex')
const contextKey = (c: AuthorContext) => JSON.stringify(c)
const validDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))
const id = (v: unknown): v is string => typeof v === 'string' && AUTHOR_UUID.test(v)

export class AuthorExchangeError extends Error {
  constructor(message: string, readonly terminal = false, readonly status?: number, readonly code?: string) { super(message) }
}
const messages: Record<string, string> = {
  author_service_unavailable: 'Author controls are temporarily unavailable. Retry later.',
  handoff_unavailable: 'This confirmation is unavailable or expired. Prepare a new request.',
  handoff_expired: 'This confirmation expired. Close it and prepare a new request.',
  author_scope_changed: 'The affected strategies changed. Review a new request in Discord.',
  author_limit: 'You already have five active public names.',
  author_restore_locked: 'Author controls are awaiting recovery after a server restore.',
  online_strategies_temporarily_unavailable: 'Online strategies are temporarily unavailable. Retry later. Local tracking and saved sessions are still available.',
  protected_changes_temporarily_unavailable: 'This change is temporarily unavailable. Retry later.',
  invalid_confirmation: 'Copy the private confirmation token from Discord and try again.',
}
const publicReadMessages: Record<number, string> = {
  404: 'This strategy or retrospective is no longer available. Refresh the results.',
  409: 'The strategy results changed. Refresh to continue.',
  410: 'Update WraeclastLedger to the latest stable version to continue browsing. Local tracking and saved sessions are still available.',
  429: 'Too many strategy requests. Wait briefly and retry.',
  503: messages.online_strategies_temporarily_unavailable,
}
/** Accept only the known error envelopes. Their explanatory text is never shown. */
function errorCode(value: unknown): string | undefined {
  if (!(exact(value, ['error']) || exact(value, ['error', 'message']) || exact(value, ['error', 'field', 'reason'])) ||
    !Object.values(value).every(v => typeof v === 'string' && v.length <= 1024) ||
    typeof value.error !== 'string' || !/^[a-z_]{1,80}$/.test(value.error)) return undefined
  return value.error
}
function exchangeError(status: number, parsed?: unknown): AuthorExchangeError {
  const code = errorCode(parsed)
  return new AuthorExchangeError(status === 429
    ? 'Too many author requests. Wait before preparing another.'
    : code && Object.hasOwn(messages, code) ? messages[code]
    : status === 503 ? messages.author_service_unavailable
    : 'The author request could not be completed. Check its status or retry later.',
  code === 'handoff_expired' || code === 'handoff_unavailable', status, code)
}
/** Bounded streaming reader: an untrusted error body is never relayed or logged. */
export async function authorJsonFetch(url: string, init: RequestInit, fetcher = fetch, maxBytes = 16384): Promise<unknown> {
  const response = await fetcher(url, { ...init, redirect: 'error', credentials: 'omit',
    cache: 'no-store', signal: AbortSignal.timeout(10_000) })
  let parsed: unknown
  try {
    if (!response.body) throw new Error('Missing author response')
    const reader = response.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > maxBytes) throw new Error('Oversized author response')
        chunks.push(part.value)
      }
    } finally { await reader.cancel().catch(() => undefined) }
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (error) {
    if (!response.ok) throw exchangeError(response.status)
    throw error
  }
  if (!response.ok) throw exchangeError(response.status, parsed)
  return parsed
}

export class AuthorHandoffService {
  private active: string | null = null
  private fingerprint: string | null = null
  private pending = new Map<string, { context: AuthorContext; clientId: string; completionToken?: string }>()
  private prepared = new Map<string, { context: AuthorContext; clientId: string }>()
  private initialization: Promise<void> | null = null
  constructor(private options: {
    origin: string | null; vault: AuthorHandoffVault; readClipboard: () => string | Promise<string>
    exchange?: (url: string, init: RequestInit) => Promise<unknown>
  }) {}
  private current(c: AuthorContext) { return this.active === contextKey(c) }
  private async call(path: string, method = 'GET', body?: unknown, authorization?: string) {
    if (!this.options.origin) throw new Error('Author service is disabled')
    return (this.options.exchange ?? authorJsonFetch)(this.options.origin + '/desktop/v1/author-handoffs' + path,
      { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  }
  private requireContext(value: unknown): AuthorContext {
    if (!validAuthorContext(value) || !this.current(value)) throw new Error('Author operation changed')
    return value
  }
  private async prepare(c: AuthorContext, kind: string, intent: unknown, payload: string | null): Promise<PreparedAuthorRequest> {
    // Only confirmation needs protected capabilities. Context activation and
    // shares without confirmation must work even when the OS key store does not.
    if (!this.initialization) {
      this.initialization = this.options.vault.discardInterrupted((requestId, authorization) =>
        this.call('/' + requestId, 'DELETE', undefined, authorization))
        .catch((error) => { this.initialization = null; throw error })
    }
    try { await this.initialization }
    catch { throw new AuthorExchangeError('Protected confirmation storage is unavailable. You can prepare a share without local confirmation; retry confirmation when storage is available.') }
    // Startup cleanup can outlive an edit, dismissal or session switch.
    this.requireContext(c)
    const fingerprint = canonicalAuthorJson({ kind, intent, payload })
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) throw new Error('Author operation changed')
    this.fingerprint = fingerprint
    const local = await this.options.vault.prepare(c.sessionId, c.generation)
    this.prepared.set(local.client_request_id, { context: c, clientId: local.client_request_id })
    try {
      if (!this.current(c)) throw new Error('Author operation changed')
      const result = await this.call('/', 'POST', { schema_version: 1, ...local, kind, payload_sha256: payload, intent })
      if (!exact(result, ['request_id', 'expires_at']) || !id(result.request_id) || !validDate(result.expires_at))
        throw new Error('Invalid author request response')
      await this.options.vault.bind(local.client_request_id, result.request_id)
      if (!this.current(c)) {
        await this.options.vault.consume(result.request_id, c.sessionId, c.generation,
          (authorization) => this.call('/' + result.request_id, 'DELETE', undefined, authorization), () => true).catch(() => undefined)
        throw new Error('Author operation changed')
      }
      if (!this.pending.has(result.request_id)) {
        this.pending.set(result.request_id, { context: c, clientId: local.client_request_id })
        // Remove volatile completion material even if the window remains idle.
        setTimeout(() => this.pending.delete(result.request_id as string), 15 * 60_000).unref()
      }
      this.prepared.delete(local.client_request_id)
      return { request_id: result.request_id, expires_at: result.expires_at, client_request_id: local.client_request_id }
    } catch (e) {
      // Keep the same capability on an ambiguous network result for an idempotent retry.
      if (!this.current(c)) {
        await this.options.vault.cancelPrepared(local.client_request_id, c.sessionId, c.generation)
        this.prepared.delete(local.client_request_id)
      }
      throw e
    }
  }
  async handle(input: unknown): Promise<{ ok: true; value: unknown } | { ok: false; error: string; terminal?: boolean }> {
    try { return { ok: true, value: await this.dispatch(input) } }
    catch (e) { return { ok: false, error: e instanceof AuthorExchangeError ? e.message :
      'Author confirmation could not be completed. Check the selected operation and try again.',
      ...(e instanceof AuthorExchangeError && e.terminal ? { terminal: true } : {}) } }
  }
  private async dispatch(input: unknown): Promise<unknown> {
    if (exact(input, ['action']) && input.action === 'available') return this.options.origin !== null
    if (!this.options.origin) throw new Error('Disabled')
    if (exact(input, ['action', 'path']) && input.action === 'read') {
      if (typeof input.path !== 'string' || input.path.length > 4096 || /[\\#\r\n]/.test(input.path)) throw new Error('Invalid public read')
      const url = new URL(input.path, this.options.origin)
      const uuidPart = '[0-9a-f-]{36}'
      if (url.origin !== this.options.origin || !new RegExp(`^/web/v2/(?:strategies(?:/${uuidPart}(?:/evidence)?)?|retrospectives(?:/${uuidPart}/strategies(?:/${uuidPart})?)?)$`).test(url.pathname))
        throw new Error('Invalid public read')
      try { return await (this.options.exchange ?? ((u, init) => authorJsonFetch(u, init, fetch, 2 * 1024 * 1024)))(url.href, { method: 'GET' }) }
      catch (error) {
        throw new AuthorExchangeError(error instanceof AuthorExchangeError && error.status !== undefined
          ? publicReadMessages[error.status] ?? 'Could not load the public strategy data. Refresh and retry.'
          : 'Could not reach online strategies. Retry later. Local tracking and saved sessions are still available.')
      }
    }
    if (exact(input, ['action']) && input.action === 'state') {
      const r = await this.call('/state')
      if (!exact(r, ['schema_version', 'epoch', 'author_actions_available']) || r.schema_version !== 1 ||
        !id(r.epoch) || typeof r.author_actions_available !== 'boolean') throw new Error('Invalid author state')
      return r as unknown as AuthorServiceState
    }
    if (exact(input, ['action', 'context']) && input.action === 'activate') {
      if (input.context !== null && !validAuthorContext(input.context)) throw new Error('Invalid context')
      const key = input.context === null ? null : contextKey(input.context as AuthorContext)
      if (key !== this.active) {
        this.active = key
        this.fingerprint = null
        // Invalidate callbacks synchronously, then discard their local readers.
        const stale = [...this.pending].filter(([, p]) => contextKey(p.context) !== key)
        const stalePrepared = [...this.prepared].filter(([, p]) => contextKey(p.context) !== key)
        for (const [requestId, p] of stale) {
          this.pending.delete(requestId)
          await this.options.vault.consume(requestId, p.context.sessionId, p.context.generation,
            (authorization) => this.call('/' + requestId, 'DELETE', undefined, authorization), () => true).catch(() => undefined)
          await this.options.vault.forget(requestId)
        }
        for (const [clientId, p] of stalePrepared) {
          this.prepared.delete(clientId)
          await this.options.vault.cancelPrepared(clientId, p.context.sessionId, p.context.generation)
        }
      }
      return null
    }
    if (exact(input, ['action', 'context', 'operation']) && input.action === 'prepare') {
      const c = this.requireContext(input.context), op = validateAuthorManagement(input.operation)
      return this.prepare(c, op.kind, op.intent, op.kind === 'recovery' ? null :
        digest('WL-AUTHOR-INTENT/1', canonicalAuthorJson(op)))
    }
    if (exact(input, ['action', 'context', 'core', 'metadata', 'confirmation']) && input.action === 'publication') {
      const c = this.requireContext(input.context)
      if (typeof input.core !== 'string' || input.core.length > 128 * 1024 || typeof input.confirmation !== 'boolean' ||
        !exact(input.metadata, ['author', 'expected_revision', 'confirmation_request_id']) ||
        input.metadata.confirmation_request_id !== null) throw new Error('Invalid publication')
      const meta = input.metadata as unknown as Parameters<typeof buildAuthorSubmission>[1]
      const plain = buildAuthorSubmission(input.core, meta)
      const request = input.confirmation ? await this.prepare(c, 'publication', null,
        digest('WL-AUTHOR-HANDOFF/1', canonicalAuthorJson(JSON.parse(plain)))) : null
      if (!this.current(c)) throw new Error('Author operation changed')
      return { token: encodeDiscordShareBrotli(buildAuthorSubmission(input.core,
        { ...meta, confirmation_request_id: request?.request_id ?? null }), true), request }
    }
    if (exact(input, ['action', 'context', 'requestId']) && ['status', 'paste', 'accept', 'cancel'].includes(input.action as string)) {
      const c = this.requireContext(input.context), requestId = input.requestId
      if (!id(requestId)) throw new Error('Invalid request')
      const pending = this.pending.get(requestId)
      if (!pending || contextKey(pending.context) !== contextKey(c)) throw new Error('Unbound request')
      if (input.action === 'cancel') {
        // Closing is local first. A remote outage must not trap the form or let a
        // delayed receipt restore an explicitly dismissed confirmation.
        this.pending.delete(requestId)
        this.prepared.delete(pending.clientId)
        this.fingerprint = null
        try {
          const cancelled = await this.options.vault.consume(requestId, c.sessionId, c.generation,
            (authorization) => this.call('/' + requestId, 'DELETE', undefined, authorization), () => true)
          if (!exact(cancelled, ['request_id', 'status']) || cancelled.request_id !== requestId || cancelled.status !== 'cancelled')
            throw new Error('Invalid cancellation')
        } catch (error) {
          if (!(error instanceof AuthorExchangeError && error.terminal))
            throw new AuthorExchangeError('Closed locally. Server cancellation could not be confirmed; the old request may remain active until it expires.')
        } finally { await this.options.vault.forget(requestId) }
        return null
      }
      // Clipboard access happens only on this explicit action, after context validation.
      const consuming = input.action === 'paste' || input.action === 'accept'
      const token = input.action === 'paste' ? (await this.options.readClipboard()).trim()
        : input.action === 'accept' ? pending.completionToken ?? '' : null
      // The OS clipboard read can outlive a session change, dismissal or expiry.
      // Recheck before any capability consumption or network request.
      this.requireContext(c)
      if (this.pending.get(requestId) !== pending) throw new Error('Author operation changed')
      if (token !== null && (!/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, 'base64url').toString('base64url') !== token))
        throw new AuthorExchangeError(messages.invalid_confirmation)
      const r = await this.options.vault.consume(requestId, c.sessionId, c.generation,
        (authorization, consumptionId) => this.call('/' + requestId +
          (input.action === 'status' ? '/status' : consuming ? '/consume' : ''),
          input.action === 'status' ? 'GET' : consuming ? 'POST' : 'DELETE',
          consuming ? { completion_token: token, consumption_id: consumptionId } : undefined, authorization),
        () => this.current(c) && this.pending.get(requestId) === pending)
      if (input.action === 'status') {
        if (!exact(r, ['request_id', 'epoch', 'status', 'expires_at', 'outcome']) || r.request_id !== requestId ||
          !id(r.epoch) || !validDate(r.expires_at) || !['pending', 'confirmed', 'consumed', 'expired', 'cancelled'].includes(r.status as string))
          throw new Error('Invalid status')
        return { ...r, outcome: r.outcome === null ? null : parseAuthorOutcome(r.outcome) } as AuthorStatus
      }
      if (!exact(r, ['schema_version', 'request_id', 'client_request_id', 'epoch', 'outcome', 'registrations']) ||
        r.request_id !== requestId || r.client_request_id !== pending.clientId || !Array.isArray(r.registrations) ||
        r.registrations.some((v) => !exact(v, ['registration_id', 'name', 'status']))) throw new Error('Invalid confirmation')
      const receipt = { ...r, outcome: parseAuthorOutcome(r.outcome) } as unknown as AuthorConfirmation
      previewAuthorRecovery(emptyAuthorPreferences(), receipt)
      // Bounded by the pending-request map; main-only and never written to disk.
      // Apply rechecks the receipt without reading the clipboard a second time.
      pending.completionToken = token!
      return receipt
    }
    throw new Error('Invalid author request')
  }
}
