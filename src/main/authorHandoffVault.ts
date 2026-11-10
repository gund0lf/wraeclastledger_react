import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { closedAuthorObject, parseAuthorOutcome, type AuthorStatus, type PublicationOperation } from '../shared/authorHandoff'
import { shareDraft, shareView, validDurableShare, type DurableShareRecord } from './durableShareRecord'
import { parseDurableShareResult, type DurableShareView } from '../shared/durableShare'
import type { AuthorSubmissionMetadata } from '../shared/authorSubmission'
import { canonicalAuthorJson } from '../shared/authorSubmission'

export interface OperationBinding {
  sessionIdentity: string
  payloadSha256: string
  operation: PublicationOperation
  targetGeneration: string | null
}
export interface NameShareBinding { shareId: string; draftRevision: number }
interface ResumableName extends NameShareBinding { expiresAt: string | null }
interface ResumableOperation extends OperationBinding {
  expiresAt: string | null
  receipt: AuthorStatus | null
}

interface Protection {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}
interface PendingAuthorRequest {
  clientRequestId: string
  sessionId: string
  operationGeneration: string
  readerSecret: string
  createdAt: number
  requestId: string | null
  consumptionId: string
  operation?: ResumableOperation
  nameShare?: ResumableName
}
interface VaultRecord {
  version: 1
  installationId: string
  pending: PendingAuthorRequest[]
  shares?: DurableShareRecord[]
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function validNameShare(value: unknown): value is ResumableName {
  return closedAuthorObject(value, ['shareId', 'draftRevision', 'expiresAt']) &&
    typeof value.shareId === 'string' && uuid.test(value.shareId) &&
    Number.isSafeInteger(value.draftRevision) && (value.draftRevision as number) > 0 &&
    (value.expiresAt === null || typeof value.expiresAt === 'string' && value.expiresAt.length <= 40 && Number.isFinite(Date.parse(value.expiresAt)))
}
function validOperation(value: unknown): value is ResumableOperation {
  if (!closedAuthorObject(value, ['sessionIdentity', 'payloadSha256', 'operation', 'targetGeneration', 'expiresAt', 'receipt']) ||
    typeof value.sessionIdentity !== 'string' || !value.sessionIdentity || value.sessionIdentity.length > 128 ||
    typeof value.payloadSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.payloadSha256) ||
    (value.targetGeneration !== null && (typeof value.targetGeneration !== 'string' || !uuid.test(value.targetGeneration))) ||
    (value.expiresAt !== null && (typeof value.expiresAt !== 'string' || value.expiresAt.length > 40 || !Number.isFinite(Date.parse(value.expiresAt)))) ||
    !closedAuthorObject(value.operation, ['kind', 'strategy_id', 'revision'])) return false
  const operation = value.operation
  if (operation.kind === 'publication') {
    if (operation.strategy_id !== null || operation.revision !== null || value.targetGeneration !== null) return false
  } else if (!['replace', 'evidence'].includes(operation.kind as string) || typeof operation.strategy_id !== 'string' ||
    !uuid.test(operation.strategy_id) || !Number.isInteger(operation.revision) || (operation.revision as number) < 1 ||
    (operation.revision as number) > 2147483647 || value.targetGeneration === null) return false
  if (value.receipt !== null) {
    if (!closedAuthorObject(value.receipt, ['request_id', 'epoch', 'status', 'expires_at', 'outcome']) ||
      typeof value.receipt.request_id !== 'string' || !uuid.test(value.receipt.request_id) ||
      typeof value.receipt.epoch !== 'string' || !uuid.test(value.receipt.epoch) || value.receipt.status !== 'consumed' ||
      typeof value.receipt.expires_at !== 'string' || !Number.isFinite(Date.parse(value.receipt.expires_at))) return false
    try { if (parseAuthorOutcome(value.receipt.outcome).status !== 'published') return false } catch { return false }
  }
  return true
}
const domainHash = (name: string, value: Buffer) =>
  createHash('sha256')
    .update(name + '\0')
    .update(value)
    .digest('hex')

export class ProtectedShareStorageError extends Error {
  constructor() { super('Sharing is unavailable because this PC cannot open secure encrypted storage. Saved drafts and results have not been changed. Restore access to your system’s secure storage before sharing.') }
}

/** Main-only encrypted capabilities; never portable session or renderer state.
 * The directory must be within the active file repository's private data root. */
export class AuthorHandoffVault {
  private serial: Promise<unknown> = Promise.resolve()
  constructor(
    private directory: string,
    private protection: Protection,
    private now = Date.now
  ) {}
  private async load(): Promise<VaultRecord> {
    if (!this.protection.isEncryptionAvailable())
      throw new ProtectedShareStorageError()
    let bytes: Buffer
    try {
      bytes = await readFile(join(this.directory, 'author-handoffs.enc'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, installationId: randomUUID(), pending: [] }
      throw error
    }
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Protected sharing storage is too large.')
    const data = JSON.parse(this.protection.decryptString(bytes)) as VaultRecord
    if (
      data.version !== 1 ||
      !uuid.test(data.installationId) ||
      (data.shares !== undefined && (!Array.isArray(data.shares) || data.shares.length > 512 ||
        data.shares.some(s => !validDurableShare(s)) || new Set(data.shares.map(s => s.id)).size !== data.shares.length)) ||
      !Array.isArray(data.pending) ||
      data.pending.length > 2 ||
      data.pending.some(
        (p) =>
          !uuid.test(p.clientRequestId) ||
          !uuid.test(p.consumptionId) ||
          typeof p.sessionId !== 'string' ||
          p.sessionId.length > 128 ||
          typeof p.operationGeneration !== 'string' ||
          p.operationGeneration.length > 128 ||
          !/^[A-Za-z0-9_-]{43}$/.test(p.readerSecret) ||
          !Number.isFinite(p.createdAt) ||
          (p.requestId !== null && !uuid.test(p.requestId)) ||
          (p.nameShare !== undefined && (!validNameShare(p.nameShare) || p.operation !== undefined)) ||
          (p.operation !== undefined && (!validOperation(p.operation) ||
            (p.operation.receipt !== null && p.operation.receipt.request_id !== p.requestId)))
      )
    )
      throw new Error('Author confirmation storage is invalid.')
    data.pending = data.pending.filter(
      (p) => p.createdAt <= this.now() && (!!p.operation?.receipt || this.now() - p.createdAt < 15 * 60_000)
    )
    return data
  }
  durableShares(): Promise<DurableShareView[]> {
    return this.run(async () => (await this.load()).shares?.map(s => shareView(s)) ?? [])
  }
  durableForSession(sessionIdentity: string, targetGeneration: string | null): Promise<DurableShareView | null> {
    return this.run(async () => {
      const s = (await this.load()).shares?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === targetGeneration)
      return s ? shareView(s) : null
    })
  }
  /** A pre-capability local draft needs no encrypted store. Once that store
   * exists, failure to open it must never masquerade as an absent draft. */
  readableDurableDraft(sessionIdentity: string): Promise<DurableShareView | null> {
    return this.run(async () => {
      try { await stat(join(this.directory, 'author-handoffs.enc')) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw new ProtectedShareStorageError()
      }
      try {
        const s = (await this.load()).shares?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === null)
        return s ? shareView(s) : null
      } catch { throw new ProtectedShareStorageError() }
    })
  }
  prepareDurable(input: { sessionIdentity: string; sessionId: string; targetGeneration: string | null;
    operation: PublicationOperation; epoch: string; core: string; metadata: AuthorSubmissionMetadata },
    exchange: (body: unknown, authorization: string) => Promise<unknown>): Promise<{ view: DurableShareView; metadata: AuthorSubmissionMetadata }> {
    return this.run(async () => {
      const data = await this.load()
      data.shares ??= []
      let s = data.shares.find(s => s.sessionIdentity === input.sessionIdentity && s.targetGeneration === input.targetGeneration)
      if (!s) {
        if (data.shares.length >= 512) throw new Error('Protected share history is full. Keep this profile for review.')
        s = { id: randomUUID(), readerSecret: randomBytes(32).toString('base64url'), sessionIdentity: input.sessionIdentity,
          sessionId: input.sessionId, epoch: input.epoch, operation: input.operation, targetGeneration: input.targetGeneration,
          draft: null, proposed: null, result: null, noticed: false }
        data.shares.push(s)
      }
      if (s.epoch !== input.epoch || canonicalAuthorJson(s.operation) !== canonicalAuthorJson(input.operation))
        throw new Error('This share needs recovery review. Check the Strategy Browser before sharing again.')
      const commitProposal = async () => {
        const p = s.proposed!
        // Persist before the call. If its answer is lost, retry these exact bytes,
        // never mint another identity or advance the draft speculatively.
        await this.save(data)
        const response = await exchange({ id: s.id, installation_id: data.installationId,
          reader_secret_hash: domainHash('WL-SHARE-READER/1', Buffer.from(s.readerSecret, 'base64url')),
          epoch: s.epoch, previous_revision: s.draft?.revision ?? 0, draft_revision: p.revision,
          payload_sha256: p.payloadSha256, kind: s.operation.kind,
          target_id: s.operation.strategy_id, target_revision: s.operation.revision }, 'Handoff ' + s.readerSecret)
        const result = parseDurableShareResult(response, s.id, p.revision, s.operation)
        if (result.epoch !== s.epoch || result.state === 'restore_review') throw new Error('Share preparation needs recovery review')
        s.draft = p; s.proposed = null; s.result = result
        await this.save(data)
      }
      if (s.proposed) await commitProposal()
      // Confirmation of a registration must not alter already-copied bytes.
      const metadata = s.draft?.metadata.author.name === input.metadata.author.name
        ? { ...input.metadata, author: s.draft.metadata.author } : input.metadata
      const same = s.draft && shareDraft(s.id, s.draft.revision, input.core, metadata).payloadSha256 === s.draft.payloadSha256
      if (!same) {
        if (s.result && s.result.state !== 'ready')
          throw new Error('This share is already processing or shared. Open it in the Strategy Browser and choose Replace to change it.')
        s.proposed = shareDraft(s.id, (s.draft?.revision ?? 0) + 1, input.core, metadata)
        await commitProposal()
      }
      return { view: shareView(s), metadata: s.draft!.metadata }
    })
  }
  observeDurable(id: string, exchange: (authorization: string) => Promise<unknown>): Promise<DurableShareView | null> {
    return this.run(async () => {
      const data = await this.load(), s = data.shares?.find(s => s.id === id)
      if (!s) return null
      if (s.result?.state === 'complete' || s.result?.state === 'restore_review') return shareView(s)
      const raw = await exchange('Handoff ' + s.readerSecret)
      const revision = (raw as { draft_revision?: unknown })?.draft_revision
      const observedDraft = s.proposed?.revision === revision ? s.proposed : s.draft
      if (!observedDraft) throw new Error('Share preparation has not been confirmed')
      const result = parseDurableShareResult(raw, s.id, observedDraft.revision, s.operation)
      if (result.epoch !== s.epoch && result.state !== 'restore_review') throw new Error('Share epoch changed')
      if (observedDraft === s.proposed) { s.draft = s.proposed; s.proposed = null }
      // A competing acceptance won before the draft edit. Preserve that outcome
      // and discard only the unaccepted local proposal, never the share identity.
      if (s.proposed && result.state !== 'ready') s.proposed = null
      s.result = result
      await this.save(data)
      return shareView(s)
    })
  }
  markDurableUnavailable(id: string): Promise<DurableShareView | null> {
    return this.run(async () => {
      const data = await this.load(), s = data.shares?.find(s => s.id === id)
      if (!s || !s.draft) return null
      if (s.result?.state !== 'complete') s.result = { id: s.id, epoch: s.epoch,
        draft_revision: s.draft.revision, kind: s.operation.kind, state: 'restore_review', outcome: null }
      await this.save(data)
      return shareView(s)
    })
  }
  noticeDurable(id: string): Promise<void> {
    return this.run(async () => {
      const data = await this.load(), s = data.shares?.find(s => s.id === id)
      if (s?.result?.state === 'complete') { s.noticed = true; await this.save(data) }
    })
  }
  copiedDurable(input: { sessionIdentity: string; shareId: string; draftRevision: number },
    current: () => boolean): Promise<DurableShareView> {
    return this.run(async () => {
      const data = await this.load(), s = data.shares?.find(s => s.id === input.shareId && s.sessionIdentity === input.sessionIdentity)
      if (!current() || !s?.draft || s.draft.revision !== input.draftRevision)
        throw new Error('The copied share changed. Close and reopen Share.')
      s.copiedRevision = input.draftRevision
      await this.save(data)
      return shareView(s)
    })
  }
  hasOperation(sessionIdentity: string): Promise<boolean> {
    return this.run(async () => (await this.load()).pending.some(p => p.operation?.sessionIdentity === sessionIdentity))
  }
  /** Main-process observation is independent of a renderer's current modal.
   * Only already-bound operation readers are returned; secrets remain in here. */
  operationReaders() {
    return this.run(async () => (await this.load()).pending.flatMap(p =>
      p.operation && p.requestId && p.operation.expiresAt ? [{
        requestId: p.requestId, expiresAt: p.operation.expiresAt,
        binding: { sessionIdentity: p.operation.sessionIdentity, payloadSha256: p.operation.payloadSha256,
          operation: p.operation.operation, targetGeneration: p.operation.targetGeneration },
        receipt: p.operation.receipt
      }] : []))
  }
  /** Serializes background reads, acknowledgement and cancellation. A response
   * cannot recreate a reader that an explicit cancellation already removed. */
  observeOperation(requestId: string, exchange: (authorization: string, consumptionId: string,
    binding: OperationBinding, expiresAt: string) => Promise<AuthorStatus>): Promise<AuthorStatus | null> {
    return this.run(async () => {
      const data = await this.load()
      const p = data.pending.find(p => p.requestId === requestId && p.operation)
      if (!p?.operation?.expiresAt) return null
      if (p.operation.receipt) return p.operation.receipt
      if (this.now() >= Date.parse(p.operation.expiresAt)) return null
      const result = await exchange('Handoff ' + p.readerSecret, p.consumptionId,
        p.operation, p.operation.expiresAt)
      if (result.status === 'consumed') {
        if (result.request_id !== requestId || !validOperation({ ...p.operation, receipt: result }))
          throw new Error('Invalid publication receipt')
        p.operation.receipt = result
        await this.save(data)
      }
      return result
    })
  }
  discardUnboundOperation(binding: OperationBinding): Promise<boolean> {
    return this.run(async () => {
      const data = await this.load()
      const p = data.pending.find(p => p.operation?.sessionIdentity === binding.sessionIdentity)
      if (!p) return true
      if (p.requestId !== null || p.operation!.payloadSha256 !== binding.payloadSha256) return false
      data.pending = data.pending.filter(item => item !== p)
      await this.save(data)
      return true
    })
  }
  private async save(data: VaultRecord): Promise<void> {
    const bytes = this.protection.encryptString(JSON.stringify(data))
    if (bytes.length > 8 * 1024 * 1024 || data.shares?.some(s => !validDurableShare(s)))
      throw new Error('Protected share history could not be saved safely.')
    await mkdir(this.directory, { recursive: true })
    const temp = join(this.directory, 'author-handoffs.' + randomUUID() + '.pending')
    await writeFile(temp, bytes, {
      flag: 'wx',
      mode: 0o600
    })
    await rename(temp, join(this.directory, 'author-handoffs.enc'))
  }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const work = this.serial.then(fn)
    this.serial = work.catch(() => undefined)
    return work
  }
  prepare(sessionId: string, operationGeneration: string, operation?: OperationBinding, nameShare?: NameShareBinding) {
    return this.run(async () => {
      if (
        !sessionId ||
        sessionId.length > 128 ||
        !operationGeneration ||
        operationGeneration.length > 128
      )
        throw new Error('Invalid author request context')
      const data = await this.load()
      if (operation && !validOperation({ ...operation, expiresAt: null, receipt: null }))
        throw new Error('Invalid publication tracking')
      if (nameShare && (operation || !validNameShare({ ...nameShare, expiresAt: null })))
        throw new Error('Invalid name verification binding')
      let pending = data.pending.find((p) => operation
        ? p.operation?.sessionIdentity === operation.sessionIdentity
        : nameShare ? p.nameShare?.shareId === nameShare.shareId && p.nameShare.draftRevision === nameShare.draftRevision
        : !p.operation && p.sessionId === sessionId && p.operationGeneration === operationGeneration)
      if (pending && nameShare) { pending.sessionId = sessionId; pending.operationGeneration = operationGeneration }
      if (pending && operation) {
        if (pending.operation!.payloadSha256 !== operation.payloadSha256 ||
          JSON.stringify(pending.operation!.operation) !== JSON.stringify(operation.operation) ||
          pending.operation!.targetGeneration !== operation.targetGeneration)
          throw new Error('Finish or cancel the pending share result before preparing changed content.')
        pending.sessionId = sessionId
        pending.operationGeneration = operationGeneration
      }
      if (!pending) {
        if (data.pending.length >= 2)
          throw new Error('Finish or cancel an existing author confirmation first.')
        pending = {
          sessionId,
          operationGeneration,
          clientRequestId: randomUUID(),
          readerSecret: randomBytes(32).toString('base64url'),
          createdAt: this.now(),
          requestId: null,
          consumptionId: randomUUID(),
          ...(operation ? { operation: { ...operation, expiresAt: null, receipt: null } } : {}),
          ...(nameShare ? { nameShare: { ...nameShare, expiresAt: null } } : {})
        }
        data.pending.push(pending)
      }
      await this.save(data)
      return {
        installation_id: data.installationId,
        client_request_id: pending.clientRequestId,
        reader_secret_hash: domainHash(
          'WL-AUTHOR-READER/1',
          Buffer.from(pending.readerSecret, 'base64url')
        )
      }
    })
  }
  /** Legacy name readers remain generation-bound. Operation readers instead
   * survive restart and are reattached through their durable session identity. */
  discardInterrupted(cancel: (requestId: string, authorization: string) => Promise<unknown>): Promise<void> {
    return this.run(async () => {
      const data = await this.load()
      const interrupted = data.pending.filter(p => !p.operation && !p.nameShare)
      // Startup observation must not create a private directory before a fresh
      // session repository has completed its guarded migration.
      if (!interrupted.length) return
      for (const p of interrupted) {
        if (p.requestId) await cancel(p.requestId, 'Handoff ' + p.readerSecret).catch(() => undefined)
      }
      data.pending = data.pending.filter(p => p.operation || p.nameShare)
      await this.save(data)
    })
  }
  bind(clientRequestId: string, requestId: string, expiresAt?: string): Promise<void> {
    return this.run(async () => {
      if (!uuid.test(requestId)) throw new Error('Invalid confirmation request')
      const data = await this.load(),
        pending = data.pending.find((p) => p.clientRequestId === clientRequestId)
      if (!pending || (pending.requestId !== null && pending.requestId !== requestId))
        throw new Error('Confirmation request changed')
      pending.requestId = requestId
      if (pending.operation) {
        if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) throw new Error('Invalid publication expiry')
        pending.operation.expiresAt = expiresAt
      }
      if (pending.nameShare) {
        if (!expiresAt || !Number.isFinite(Date.parse(expiresAt))) throw new Error('Invalid name verification expiry')
        pending.nameShare.expiresAt = expiresAt
      }
      await this.save(data)
    })
  }
  resumeName(binding: NameShareBinding, sessionId: string, generation: string, stillCurrent: () => boolean) {
    return this.run(async () => {
      const data = await this.load()
      const p = data.pending.find(p => p.nameShare?.shareId === binding.shareId && p.nameShare.draftRevision === binding.draftRevision)
      if (!p?.requestId || !p.nameShare?.expiresAt || this.now() >= Date.parse(p.nameShare.expiresAt)) return null
      if (!stillCurrent()) throw new Error('The active name verification changed.')
      p.sessionId = sessionId; p.operationGeneration = generation
      await this.save(data)
      if (!stillCurrent()) throw new Error('The active name verification changed.')
      return { request_id: p.requestId, client_request_id: p.clientRequestId, expires_at: p.nameShare.expiresAt }
    })
  }
  /** Reattach only the encrypted reader for the selected durable session. No
   * secret or old renderer generation is returned to the renderer. */
  resumeOperation(sessionIdentity: string, sessionId: string, generation: string, stillCurrent: () => boolean) {
    return this.run(async () => {
      const data = await this.load()
      const p = data.pending.find(p => p.operation?.sessionIdentity === sessionIdentity)
      if (!p || !p.requestId || !p.operation?.expiresAt) return null
      if (!stillCurrent()) throw new Error('The active operation changed while resuming.')
      p.sessionId = sessionId
      p.operationGeneration = generation
      await this.save(data)
      if (!stillCurrent()) throw new Error('The active operation changed while resuming.')
      return {
        request: { request_id: p.requestId, client_request_id: p.clientRequestId, expires_at: p.operation.expiresAt },
        binding: { sessionIdentity, payloadSha256: p.operation.payloadSha256, operation: p.operation.operation,
          targetGeneration: p.operation.targetGeneration },
        status: p.operation.receipt
      }
    })
  }
  cancelOperation(sessionIdentity: string, cancel: (requestId: string, authorization: string) => Promise<void>,
    stillCurrent: () => boolean, onStopped: () => void): Promise<void> {
    return this.run(async () => {
      const data = await this.load()
      const p = data.pending.find(p => p.operation?.sessionIdentity === sessionIdentity)
      if (!stillCurrent()) throw new Error('The selected session changed.')
      if (!p) { onStopped(); return }
      // Explicitly stop local tracking even if creation/cancellation had an
      // uncertain network result. This never undoes or repeats a publication.
      data.pending = data.pending.filter(item => item !== p)
      await this.save(data)
      onStopped()
      if (p.requestId && !p.operation!.receipt) await cancel(p.requestId, 'Handoff ' + p.readerSecret)
    })
  }
  /** Callback executes in main. Its return must be reduced to a closed receipt
   * before any IPC reply; secrets and clipboard contents never leave main. */
  consume<T>(
    requestId: string,
    sessionId: string,
    operationGeneration: string,
    exchange: (authorization: string, consumptionId: string) => Promise<T>,
    stillCurrent: () => boolean,
    operationReceipt?: (result: T) => AuthorStatus
  ): Promise<T> {
    return this.run(async () => {
      const data = await this.load(),
        p = data.pending.find((p) => p.requestId === requestId)
      if (
        !p ||
        p.sessionId !== sessionId ||
        p.operationGeneration !== operationGeneration ||
        !stillCurrent()
      )
        throw new Error('This confirmation belongs to another operation.')
      const result = await exchange('Handoff ' + p.readerSecret, p.consumptionId)
      // Save a validated private receipt before fencing a late UI response. The
      // operation may already be committed even when its dialog was closed.
      if (operationReceipt) {
        const receipt = operationReceipt(result)
        if (!p.operation || receipt.request_id !== requestId || receipt.status !== 'consumed' ||
          !validOperation({ ...p.operation, receipt })) throw new Error('Invalid publication receipt')
        p.operation.receipt = receipt
        await this.save(data)
      }
      if (!stillCurrent()) throw new Error('The active operation changed while confirming.')
      return result
    })
  }
  /** Cancel a locally prepared request even when server creation/binding failed. */
  cancelPrepared(
    clientRequestId: string,
    sessionId: string,
    operationGeneration: string
  ): Promise<void> {
    return this.run(async () => {
      if (!uuid.test(clientRequestId)) throw new Error('Invalid confirmation request')
      const data = await this.load()
      const pending = data.pending.find((p) => p.clientRequestId === clientRequestId)
      if (!pending) return
      if (pending.sessionId !== sessionId || pending.operationGeneration !== operationGeneration)
        throw new Error('This confirmation belongs to another operation.')
      data.pending = data.pending.filter((p) => p.clientRequestId !== clientRequestId)
      await this.save(data)
    })
  }
  forget(requestId: string): Promise<void> {
    return this.run(async () => {
      const data = await this.load()
      data.pending = data.pending.filter((p) => p.requestId !== requestId)
      await this.save(data)
    })
  }
}
