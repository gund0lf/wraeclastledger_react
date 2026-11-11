import { createHash } from 'node:crypto'
import { AuthorHandoffVault, ProtectedShareStorageError, ShareRecoveryConfirmationError, type NameShareBinding } from './authorHandoffVault'
import { DurableShareTracker } from './durableShareTracker'
import { encodeDiscordShareBrotli } from './discordShareCompression'
import { buildAuthorSubmission, canonicalAuthorJson } from '../shared/authorSubmission'
import { ShareIntentError } from '../shared/shareIntent'
import { emptyAuthorPreferences, previewAuthorRecovery } from '../shared/authorRecognition'
import {
  AUTHOR_UUID, closedAuthorObject as exact, parseAuthorOutcome, validAuthorContext,
  validateAuthorManagement, type AuthorContext, type AuthorConfirmation, type AuthorStatus,
  type PreparedAuthorRequest, type AuthorServiceState, type PublicationOperation, type AuthorResults, type ShareStorageCode,
} from '../shared/authorHandoff'

const digest = (domain: string, text: string) => createHash('sha256').update(domain + '\0').update(text).digest('hex')
const contextKey = (c: AuthorContext) => JSON.stringify(c)
const validDate = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))
const id = (v: unknown): v is string => typeof v === 'string' && AUTHOR_UUID.test(v)

export class AuthorExchangeError extends Error {
  constructor(message: string, readonly terminal = false, readonly status?: number, readonly code?: string,
    readonly retryAfterSeconds?: number) { super(message) }
}
const messages: Record<string, string> = {
  share_already_accepted: 'This share is already being processed or shared. Check its result in the Strategy Browser, then use Replace to change it.',
  share_draft_changed: 'A newer prepared copy exists. Reopen Share to use it.',
  share_restore_review: 'The service no longer has this share record. Check the Strategy Browser before sharing again.',
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
  503: messages.online_strategies_temporarily_unavailable,
}
/** Accept only the known error envelopes. Their explanatory text is never shown. */
function errorCode(value: unknown): string | undefined {
  if (!(exact(value, ['error']) || exact(value, ['error', 'message']) || exact(value, ['error', 'field', 'reason'])) ||
    !Object.values(value).every(v => typeof v === 'string' && v.length <= 1024) ||
    typeof value.error !== 'string' || !/^[a-z_]{1,80}$/.test(value.error)) return undefined
  return value.error
}
function retrySeconds(value: string | null): number | undefined {
  if (!value || !/^[0-9]{1,5}$/.test(value)) return undefined
  const seconds = Number(value)
  return seconds >= 1 && seconds <= 86400 ? seconds : undefined
}
function rateLimitMessage(seconds: number | undefined, subject: string): string {
  if (seconds === undefined) return `Too many ${subject} requests. The server did not provide a retry time; try again later.`
  const minutes = Math.ceil(seconds / 60)
  return `Too many ${subject} requests. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
}
function exchangeError(status: number, parsed?: unknown, retryAfter?: string | null): AuthorExchangeError {
  const code = errorCode(parsed)
  const seconds = retrySeconds(retryAfter ?? null)
  return new AuthorExchangeError(status === 429
    ? code === 'author_pending_limit' && seconds !== undefined
      ? `Two name requests are still open. Finish one, or try again in ${Math.ceil(seconds / 60)} ${seconds <= 60 ? 'minute' : 'minutes'}.`
      : rateLimitMessage(seconds, 'sharing')
    : code && Object.hasOwn(messages, code) ? messages[code]
    : status === 503 ? messages.author_service_unavailable
    : 'The author request could not be completed. Check its status or retry later.',
  code === 'handoff_expired' || code === 'handoff_unavailable', status, code, seconds)
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
    if (!response.ok) throw exchangeError(response.status, undefined, response.headers.get('Retry-After'))
    throw error
  }
  if (!response.ok) throw exchangeError(response.status, parsed, response.headers.get('Retry-After'))
  return parsed
}

export class AuthorHandoffService {
  private durable: DurableShareTracker
  private active: string | null = null
  private fingerprint: string | null = null
  private pending = new Map<string, { context: AuthorContext; clientId: string; completionToken?: string; nameShare?: NameShareBinding }>()
  private prepared = new Map<string, { context: AuthorContext; clientId: string; resumable: boolean }>()
  private initialization: Promise<void> | null = null
  private trackingRequested = false
  private recovering = false
  private recoveryPreview: { id: string; context: string } | null = null
  constructor(private options: {
    origin: string | null; vault: AuthorHandoffVault; readClipboard: () => string | Promise<string>
    exchange?: (url: string, init: RequestInit) => Promise<unknown>
    readShareCore?: (sessionId: string, sessionIdentity: string) => Promise<AuthorResults['share-draft']>
    readSessionCreatedAt?: (sessionId: string, sessionIdentity: string) => Promise<number | null>
  }) { this.durable = new DurableShareTracker(options.vault, (id, authorization) => this.call('/shares/' + id, 'GET', undefined, authorization)) }
  /** Enabled by the app lifecycle, not by opening Share. Existing encrypted
   * requests are the only authority to check; this never prepares a new share. */
  async startOperationTracking(): Promise<void> {
    if (!this.options.origin) return
    this.trackingRequested = true
    await this.initialize()
    await this.durable.start()
  }
  stopOperationTracking(): void {
    this.trackingRequested = false
    this.durable.stop()
  }
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
  private async initialize(): Promise<void> {
    // Name verification and durable share results need protected
    // capabilities. Context activation itself does not open the key store.
    if (!this.initialization) {
      this.initialization = this.options.vault.discardInterrupted((requestId, authorization) =>
        this.call('/' + requestId, 'DELETE', undefined, authorization))
        .catch((error) => { this.initialization = null; throw error })
    }
    try { await this.initialization }
    catch (error) {
      if (error instanceof ProtectedShareStorageError) throw error
      throw new AuthorExchangeError('Protected sharing storage is unavailable. Restore access before preparing or resuming this share. Your local sessions are unchanged.', false, undefined, 'local_confirmation_unavailable')
    }
  }
  private async selectedSession(c: AuthorContext, identity: unknown): Promise<string> {
    if (typeof identity !== 'string' || !identity || identity.length > 128 || !this.options.readShareCore)
      throw new AuthorExchangeError('The selected session cannot be checked. Close and reopen Share.')
    await this.options.readShareCore(c.sessionId, identity)
    this.requireContext(c)
    return identity
  }
  private async prepare(c: AuthorContext, kind: string, intent: unknown, payload: string | null,
    nameShare?: NameShareBinding): Promise<PreparedAuthorRequest> {
    await this.initialize()
    // Startup cleanup can outlive an edit, dismissal or session switch.
    this.requireContext(c)
    const fingerprint = canonicalAuthorJson({ kind, intent, payload })
    if (this.fingerprint !== null && this.fingerprint !== fingerprint) throw new Error('Author operation changed')
    this.fingerprint = fingerprint
    let local: Awaited<ReturnType<AuthorHandoffVault['prepare']>>
    try { local = await this.options.vault.prepare(c.sessionId, c.generation, nameShare) }
    catch (error) {
      if (error instanceof ProtectedShareStorageError) throw error
      throw new AuthorExchangeError('A name request could not be prepared. Reopen Share to finish any pending name verification, or retry when protected storage is available.')
    }
    this.prepared.set(local.client_request_id, { context: c, clientId: local.client_request_id, resumable: !!nameShare })
    try {
      if (!this.current(c)) throw new Error('Author operation changed')
      const result = await this.call('', 'POST', { schema_version: 1, ...local, kind, payload_sha256: payload, intent })
      if (!exact(result, ['request_id', 'expires_at']) || !id(result.request_id) || !validDate(result.expires_at))
        throw new Error('Invalid author request response')
      await this.options.vault.bind(local.client_request_id, result.request_id, result.expires_at)
      if (!this.current(c)) {
        if (!nameShare) await this.options.vault.consume(result.request_id, c.sessionId, c.generation,
          (authorization) => this.call('/' + result.request_id, 'DELETE', undefined, authorization), () => true).catch(() => undefined)
        throw new Error('Author operation changed')
      }
      if (!this.pending.has(result.request_id)) {
        this.pending.set(result.request_id, { context: c, clientId: local.client_request_id, ...(nameShare ? { nameShare } : {}) })
        // Name completion tokens remain volatile and bounded.
        setTimeout(() => this.pending.delete(result.request_id as string), 15 * 60_000).unref()
      }
      this.prepared.delete(local.client_request_id)
      return { request_id: result.request_id, expires_at: result.expires_at, client_request_id: local.client_request_id }
    } catch (e) {
      // Keep the same capability on an ambiguous network result for an idempotent retry.
      if (!this.current(c) && !nameShare) {
        await this.options.vault.cancelPrepared(local.client_request_id, c.sessionId, c.generation)
        this.prepared.delete(local.client_request_id)
      }
      throw e
    }
  }
  private status(r: unknown, requestId: string): AuthorStatus {
    if (!exact(r, ['request_id', 'epoch', 'status', 'expires_at', 'outcome']) || r.request_id !== requestId ||
      !id(r.epoch) || !validDate(r.expires_at) || !['pending', 'confirmed', 'consumed', 'expired', 'cancelled'].includes(r.status as string))
      throw new Error('Invalid status')
    const outcome = r.outcome === null ? null : parseAuthorOutcome(r.outcome)
    return { ...r, outcome } as AuthorStatus
  }
  async handle(input: unknown): Promise<{ ok: true; value: unknown } | { ok: false; error: string; terminal?: boolean;
    storageCode?: ShareStorageCode; recoveryConfirmationRequired?: true }> {
    try { return { ok: true, value: await this.dispatch(input) } }
    catch (e) { return { ok: false, error: e instanceof AuthorExchangeError || e instanceof ShareIntentError || e instanceof ProtectedShareStorageError || e instanceof ShareRecoveryConfirmationError ? e.message :
      'Author confirmation could not be completed. Check the selected operation and try again.',
      ...(e instanceof ProtectedShareStorageError ? { storageCode: e.code } : {}),
      ...(e instanceof ShareRecoveryConfirmationError ? { recoveryConfirmationRequired: true as const } : {}),
      ...(e instanceof AuthorExchangeError && e.terminal ? { terminal: true } : {}) } }
  }
  private async dispatch(input: unknown): Promise<unknown> {
    if (exact(input, ['action']) && input.action === 'available') return this.options.origin !== null
    if (!this.options.origin) throw new Error('Disabled')
    // Closing/switching Share must still invalidate the confirmation context.
    if (this.recovering && !(exact(input, ['action', 'context']) && input.action === 'activate'))
      throw new AuthorExchangeError('Sharing recovery is in progress. Wait for it to finish.')
    if (exact(input, ['action', 'context']) && input.action === 'storage-recovery-preview') {
      const c = this.requireContext(input.context)
      this.recoveryPreview = null
      const preview = await this.options.vault.previewRecovery()
      this.requireContext(c)
      this.recoveryPreview = { id: preview.recoveryId, context: contextKey(c) }
      return preview
    }
    if (exact(input, ['action', 'context', 'recoveryId', 'confirmed']) && input.action === 'storage-recovery-confirm') {
      const c = this.requireContext(input.context)
      if (input.confirmed !== true || !id(input.recoveryId) || this.recoveryPreview?.id !== input.recoveryId ||
        this.recoveryPreview.context !== contextKey(c)) throw new Error('Sharing recovery must be reviewed again')
      this.recoveryPreview = null
      this.recovering = true
      let recovered = false
      try {
        await this.durable.pauseForRecovery()
        this.requireContext(c)
        const result = await this.options.vault.confirmRecovery(input.recoveryId, () => this.current(c))
        this.pending.clear(); this.prepared.clear(); this.fingerprint = null
        this.initialization = null
        this.durable.resetAfterRecovery()
        recovered = true
        if (this.trackingRequested) await this.durable.start()
        return result
      } catch (error) {
        // An abandoned or refused recovery must not cancel background checks.
        // The app lifecycle can still stop them while recovery is draining.
        if (!recovered && this.trackingRequested) {
          try { await this.durable.start() }
          catch { /* The observer keeps its storage fault; report the original recovery error. */ }
        }
        throw error
      } finally { this.recovering = false }
    }
    if (exact(input, ['action']) && input.action === 'share-results') {
      return this.durable.views()
    }
    if (exact(input, ['action']) && input.action === 'share-refresh') { await this.durable.wake(); return null }
    if (exact(input, ['action', 'shareId']) && input.action === 'share-refresh') {
      if (!id(input.shareId)) throw new Error('Invalid share refresh')
      await this.durable.wake(input.shareId)
      return null
    }
    if (exact(input, ['action','context','sessionIdentity','shareId','draftRevision']) && input.action === 'share-copied') {
      const c = this.requireContext(input.context)
      const sessionIdentity = await this.selectedSession(c, input.sessionIdentity)
      if (!id(input.shareId) || !Number.isInteger(input.draftRevision) || (input.draftRevision as number) < 1)
        throw new Error('Invalid copied share')
      const view = await this.options.vault.copiedDurable({ sessionIdentity, shareId: input.shareId,
        draftRevision: input.draftRevision as number }, () => this.current(c))
      await this.durable.wake(view.id)
      this.requireContext(c)
      return this.durable.view(view.id) ?? view
    }
    if (exact(input, ['action','shareId']) && input.action === 'share-noticed') {
      if (!id(input.shareId)) throw new Error('Invalid share notice')
      await this.options.vault.noticeDurable(input.shareId)
      await this.durable.wake(input.shareId)
      return null
    }
    if (exact(input, ['action','context','sessionIdentity','targetGeneration']) && input.action === 'share-result') {
      const c = this.requireContext(input.context)
      const sessionIdentity = await this.selectedSession(c, input.sessionIdentity)
      if (input.targetGeneration !== null && !id(input.targetGeneration)) throw new Error('Invalid target generation')
      const saved = await this.options.vault.durableForSession(sessionIdentity, input.targetGeneration as string | null)
      if (!saved) return null
      // A saved completion is authoritative even if the background tracker
      // still holds an earlier state or the former full payload. A compact
      // marker's optional display snapshot never makes it an active record.
      if (saved.status === 'complete') {
        await this.durable.wake(saved.id)
        await this.selectedSession(c, sessionIdentity)
        this.requireContext(c)
        return saved
      }
      if (!this.durable.view(saved.id)) await this.durable.wake(saved.id)
      await this.selectedSession(c, sessionIdentity)
      this.requireContext(c)
      return this.durable.view(saved.id) ?? saved
    }
    if (exact(input, ['action','context','sessionIdentity']) && input.action === 'resume-name') {
      const c = this.requireContext(input.context)
      const sessionIdentity = await this.selectedSession(c, input.sessionIdentity)
      await this.initialize()
      const share = await this.options.vault.durableForSession(sessionIdentity, null)
      if (!share) return null
      const binding = { shareId: share.id, draftRevision: share.draftRevision }
      const request = await this.options.vault.resumeName(binding, c.sessionId, c.generation, () => this.current(c))
      this.requireContext(c)
      if (request) this.pending.set(request.request_id, { context: c, clientId: request.client_request_id, nameShare: binding })
      return request
    }
    if (exact(input, ['action', 'sessionId', 'sessionIdentity']) && input.action === 'share-draft') {
      if (typeof input.sessionId !== 'string' || !input.sessionId || input.sessionId.length > 128 ||
        typeof input.sessionIdentity !== 'string' || !input.sessionIdentity || input.sessionIdentity.length > 128)
        throw new ShareIntentError('The selected session changed. Close and reopen Share.')
      if (!this.options.readShareCore) throw new ShareIntentError('Saved sharing details are unavailable. Close and reopen Share to retry.')
      // Local read only: no provider request, clipboard, capability or intent rotation.
      const previous = await this.options.readShareCore(input.sessionId, input.sessionIdentity)
      const durable = await this.options.vault.readableDurableDraft(input.sessionIdentity)
      // Repository selection can change while the protected store is being read,
      // before the renderer has sent its next activation.
      await this.options.readShareCore(input.sessionId, input.sessionIdentity)
      return durable && !durable.archived ? { core: durable.core, author: durable.author } : previous
    }
    if (exact(input, ['action', 'path']) && input.action === 'read') {
      if (typeof input.path !== 'string' || input.path.length > 4096 || /[\\#\r\n]/.test(input.path)) throw new Error('Invalid public read')
      const url = new URL(input.path, this.options.origin)
      const uuidPart = '[0-9a-f-]{36}'
      if (url.origin !== this.options.origin || !new RegExp(`^/web/v2/(?:strategies(?:/${uuidPart}(?:/evidence)?)?|retrospectives(?:/${uuidPart}/strategies(?:/${uuidPart})?)?)$`).test(url.pathname))
        throw new Error('Invalid public read')
      try { return await (this.options.exchange ?? ((u, init) => authorJsonFetch(u, init, fetch, 2 * 1024 * 1024)))(url.href, { method: 'GET' }) }
      catch (error) {
        throw new AuthorExchangeError(error instanceof AuthorExchangeError && error.status !== undefined
          ? error.status === 429 ? rateLimitMessage(error.retryAfterSeconds, 'strategy')
            : publicReadMessages[error.status] ?? 'Could not load the public strategy data. Refresh and retry.'
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
        this.recoveryPreview = null
        this.fingerprint = null
        // Invalidate callbacks synchronously, then discard their local readers.
        const stale = [...this.pending].filter(([, p]) => contextKey(p.context) !== key)
        const stalePrepared = [...this.prepared].filter(([, p]) => contextKey(p.context) !== key && !p.resumable)
        for (const [requestId, p] of stale) {
          this.pending.delete(requestId)
          if (p.nameShare) continue // Closing detaches the UI; the encrypted request survives.
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
    const publicationKeys = ['action', 'context', 'core', 'metadata', 'confirmation', 'newIntent', 'sessionIdentity']
    if ((exact(input, publicationKeys) || exact(input, [...publicationKeys, 'targetGeneration']) ||
      exact(input, [...publicationKeys, 'recoveryConfirmed']) || exact(input, [...publicationKeys, 'targetGeneration', 'recoveryConfirmed'])) && input.action === 'publication') {
      const c = this.requireContext(input.context)
      if (typeof input.core !== 'string' || input.core.length > 128 * 1024 || typeof input.confirmation !== 'boolean' ||
        !exact(input.metadata, ['author', 'expected_revision', 'confirmation_request_id']) ||
        input.metadata.confirmation_request_id !== null ||
        Object.hasOwn(input, 'recoveryConfirmed') && input.recoveryConfirmed !== true) throw new Error('Invalid publication')
      let core = input.core
      let meta = input.metadata as unknown as Parameters<typeof buildAuthorSubmission>[1]
      buildAuthorSubmission(core, meta)
      const sessionIdentity = await this.selectedSession(c, input.sessionIdentity)
      if (input.newIntent !== false) throw new AuthorExchangeError('Choose Continue in the Strategy Browser to change a published strategy.')
      const action = JSON.parse(core)[1], targetGeneration = input.targetGeneration ?? null
      const operation: PublicationOperation = action === 0
        ? { kind: 'publication', strategy_id: null, revision: null }
        : { kind: action[0] === 1 ? 'replace' : 'evidence', strategy_id: action[1], revision: meta.expected_revision }
      if (action !== 0 && (!Array.isArray(action) || ![1,2].includes(action[0]) || !id(action[1]) || !id(targetGeneration)) ||
        action === 0 && targetGeneration !== null) throw new Error('Invalid share target')
      const sessionCreatedAt = this.options.readSessionCreatedAt
        ? await this.options.readSessionCreatedAt(c.sessionId, sessionIdentity) : null
      this.requireContext(c)
      // Ask before any request leaves the app. The vault repeats this check
      // inside its serialized preparation, so retries cannot rotate identities.
      if (operation.kind === 'publication' && input.recoveryConfirmed !== true &&
        await this.options.vault.recoveryRequiredForSession(sessionCreatedAt) &&
        !await this.options.vault.durableForSession(sessionIdentity, null))
        throw new ShareRecoveryConfirmationError()
      const state = await this.dispatch({ action: 'state' }) as AuthorServiceState
      await this.selectedSession(c, sessionIdentity)
      this.requireContext(c)
      let prepared: Awaited<ReturnType<AuthorHandoffVault['prepareDurable']>>
      try {
        prepared = await this.options.vault.prepareDurable({ sessionIdentity, sessionId: c.sessionId,
          targetGeneration: targetGeneration as string | null, operation, epoch: state.epoch, core, metadata: meta,
          sessionCreatedAt, recoveryConfirmed: input.recoveryConfirmed === true },
        (body, auth) => this.call('/shares', 'PUT', body, auth))
      } catch (error) {
        await this.durable.wake()
        if (error instanceof AuthorExchangeError || error instanceof ProtectedShareStorageError || error instanceof ShareRecoveryConfirmationError) throw error
        throw new AuthorExchangeError(error instanceof Error && /already processing|recovery review/.test(error.message)
          ? error.message : 'Could not prepare this share yet. Your saved draft is kept; try preparing it again when the service is available.')
      }
      await this.durable.wake(prepared.view.id)
      await this.selectedSession(c, sessionIdentity)
      this.requireContext(c)
      meta = prepared.metadata
      core = prepared.view.core
      let request: PreparedAuthorRequest | null = null
      if (input.confirmation && prepared.view.status !== 'complete') {
        const plain = buildAuthorSubmission(core, meta)
        request = await this.prepare(c, 'publication', null, digest('WL-AUTHOR-HANDOFF/1', canonicalAuthorJson(JSON.parse(plain))),
          { shareId: prepared.view.id, draftRevision: prepared.view.draftRevision })
      }
      await this.selectedSession(c, sessionIdentity)
      this.requireContext(c)
      return { token: encodeDiscordShareBrotli(buildAuthorSubmission(core, { ...meta, confirmation_request_id: request?.request_id ?? null }), true),
        request, acknowledgement: request ? 'name' : 'operation', share: prepared.view }
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
        throw new AuthorExchangeError(input.action === 'paste'
          ? "Your clipboard doesn't hold a code. Copy it from Discord first."
          : messages.invalid_confirmation)
      const r = await this.options.vault.consume(requestId, c.sessionId, c.generation,
        (authorization, consumptionId) => this.call('/' + requestId +
          (input.action === 'status' ? '/status' : consuming ? '/consume' : ''),
          input.action === 'status' ? 'GET' : consuming ? 'POST' : 'DELETE',
          consuming ? { completion_token: token, consumption_id: consumptionId } : undefined, authorization),
        () => this.current(c) && this.pending.get(requestId) === pending)
      if (input.action === 'status') {
        return this.status(r, requestId)
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
