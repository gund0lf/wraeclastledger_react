import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { closedAuthorObject, type PublicationOperation } from '../shared/authorHandoff'
import { shareDraft, shareView, validDurableShare, completedShare, completedView, validCompletedShare,
  type DurableShareRecord, type CompletedShareRecord } from './durableShareRecord'
import { parseDurableShareResult, type DurableShareView, type ActiveDurableShareView,
  type CompletedShareView, type ShareDisplaySnapshot } from '../shared/durableShare'
import type { AuthorSubmissionMetadata } from '../shared/authorSubmission'
import { canonicalAuthorJson } from '../shared/authorSubmission'

export interface NameShareBinding { shareId: string; draftRevision: number }
interface ResumableName extends NameShareBinding { expiresAt: string | null }

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
  nameShare?: ResumableName
}
interface VaultRecord {
  version: 1
  installationId: string
  pending: PendingAuthorRequest[]
  shares?: DurableShareRecord[]
  completed?: CompletedShareRecord[]
}
const fullRecordBudget = 8 * 1024 * 1024
function compactCompleted(data: VaultRecord): DurableShareRecord[] {
  const eligible = data.shares?.filter(s => s.result?.state === 'complete' && s.noticed && !s.proposed &&
    !data.pending.some(p => p.nameShare?.shareId === s.id)) ?? []
  if (!eligible.length) return []
  data.completed = [...data.completed ?? [], ...eligible.map(completedShare)]
  const ids = new Set(eligible.map(s => s.id))
  data.shares = data.shares!.filter(s => !ids.has(s.id))
  return eligible
}
function fullRecordsFit(data: VaultRecord): boolean {
  // Completed replay markers contain only closed, bounded identity/result
  // fields. They do not consume the quota for unresolved payloads/capabilities.
  const { completed: _completed, ...full } = data
  return (data.shares?.length ?? 0) <= 512 && Buffer.byteLength(JSON.stringify(full)) <= fullRecordBudget
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function validNameShare(value: unknown): value is ResumableName {
  return closedAuthorObject(value, ['shareId', 'draftRevision', 'expiresAt']) &&
    typeof value.shareId === 'string' && uuid.test(value.shareId) &&
    Number.isSafeInteger(value.draftRevision) && (value.draftRevision as number) > 0 &&
    (value.expiresAt === null || typeof value.expiresAt === 'string' && value.expiresAt.length <= 40 && Number.isFinite(Date.parse(value.expiresAt)))
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
  // Display-only LRU: eviction never changes stored outcomes, identities or
  // unfinished work. Closing a window keeps exact values while the app runs.
  private completedDisplays = new Map<string, { binding: string; snapshot: ShareDisplaySnapshot; bytes: number }>()
  private completedDisplayBytes = 0
  constructor(
    private directory: string,
    private protection: Protection,
    private now = Date.now
  ) {}
  private rememberCompleted(records: DurableShareRecord[]): void {
    for (const record of records) {
      const snapshot = { core: record.draft!.core, author: { ...record.draft!.metadata.author } }
      const binding = canonicalAuthorJson(completedShare(record))
      const bytes = Buffer.byteLength(binding) + Buffer.byteLength(JSON.stringify(snapshot))
      const previous = this.completedDisplays.get(record.id)
      if (previous) this.completedDisplayBytes -= previous.bytes
      this.completedDisplays.delete(record.id)
      this.completedDisplays.set(record.id, { binding, snapshot, bytes })
      this.completedDisplayBytes += bytes
      while (this.completedDisplays.size > 512 || this.completedDisplayBytes > fullRecordBudget) {
        const oldest = this.completedDisplays.keys().next().value!
        this.completedDisplayBytes -= this.completedDisplays.get(oldest)!.bytes
        this.completedDisplays.delete(oldest)
      }
    }
  }
  private completedDisplayView(record: CompletedShareRecord): CompletedShareView {
    const view = completedView(record), display = this.completedDisplays.get(record.id)
    if (!display || display.binding !== canonicalAuthorJson(record)) return view
    this.completedDisplays.delete(record.id)
    this.completedDisplays.set(record.id, display)
    return { ...view, displaySnapshot: { core: display.snapshot.core, author: { ...display.snapshot.author } } }
  }
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
    const data = JSON.parse(this.protection.decryptString(bytes)) as VaultRecord
    if (
      data.version !== 1 ||
      !uuid.test(data.installationId) ||
      (data.shares !== undefined && (!Array.isArray(data.shares) ||
        data.shares.some(s => !validDurableShare(s)) || new Set(data.shares.map(s => s.id)).size !== data.shares.length)) ||
      (data.completed !== undefined && (!Array.isArray(data.completed) || data.completed.some(s => !validCompletedShare(s)))) ||
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
          (p.nameShare !== undefined && (!validNameShare(p.nameShare) || Object.hasOwn(p, 'operation')))
      )
    )
      throw new Error('Author confirmation storage is invalid.')
    const records = [...data.shares ?? [], ...data.completed ?? []]
    if (new Set(records.map(s => s.id)).size !== records.length ||
      new Set(records.map(s => JSON.stringify([s.sessionIdentity, s.targetGeneration]))).size !== records.length)
      throw new Error('Protected share identities conflict.')
    // Development-only operation acknowledgements never establish a durable
    // share result or a name. Discard their readers without consuming or
    // cancelling anything remotely; current name readers remain unchanged.
    data.pending = data.pending.filter((p) => !Object.hasOwn(p, 'operation') &&
      p.createdAt <= this.now() && this.now() - p.createdAt < 15 * 60_000)
    const compacted = compactCompleted(data)
    if (!fullRecordsFit(data)) throw new Error('Protected unfinished sharing storage is too large.')
    if (compacted.length) { await this.save(data); this.rememberCompleted(compacted) }
    return data
  }
  durableShares(): Promise<DurableShareView[]> {
    return this.run(async () => (await this.load()).shares?.map(s => shareView(s)) ?? [])
  }
  durableForSession(sessionIdentity: string, targetGeneration: string | null): Promise<DurableShareView | null> {
    return this.run(async () => {
      const data = await this.load()
      const s = data.shares?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === targetGeneration)
      const done = data.completed?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === targetGeneration)
      return s ? shareView(s) : done ? this.completedDisplayView(done) : null
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
        const data = await this.load()
        const s = data.shares?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === null)
        const done = data.completed?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === null)
        return s ? shareView(s) : done ? this.completedDisplayView(done) : null
      } catch { throw new ProtectedShareStorageError() }
    })
  }
  prepareDurable(input: { sessionIdentity: string; sessionId: string; targetGeneration: string | null;
    operation: PublicationOperation; epoch: string; core: string; metadata: AuthorSubmissionMetadata },
    exchange: (body: unknown, authorization: string) => Promise<unknown>): Promise<{ view: ActiveDurableShareView; metadata: AuthorSubmissionMetadata }> {
    return this.run(async () => {
      const data = await this.load()
      if (data.completed?.some(s => s.sessionIdentity === input.sessionIdentity && s.targetGeneration === input.targetGeneration))
        throw new Error('This share is already processing or shared. Open it in the Strategy Browser and choose Continue to change it.')
      data.shares ??= []
      let s = data.shares.find(s => s.sessionIdentity === input.sessionIdentity && s.targetGeneration === input.targetGeneration)
      if (!s) {
        if (data.shares.length >= 512) throw new Error('Protected unfinished share storage is full. Keep this profile for review.')
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
      if (!s) {
        const done = data.completed?.find(s => s.id === id)
        return done ? this.completedDisplayView(done) : null
      }
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
      if (!s || !s.draft) {
        const done = data.completed?.find(s => s.id === id)
        return done ? this.completedDisplayView(done) : null
      }
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
  private async save(data: VaultRecord): Promise<void> {
    if (data.shares?.some(s => !validDurableShare(s)) || data.completed?.some(s => !validCompletedShare(s)))
      throw new Error('Protected share history could not be saved safely.')
    const compacted = compactCompleted(data)
    if (!fullRecordsFit(data)) throw new Error('Protected unfinished share storage could not be saved safely.')
    const bytes = this.protection.encryptString(JSON.stringify(data))
    await mkdir(this.directory, { recursive: true })
    const temp = join(this.directory, 'author-handoffs.' + randomUUID() + '.pending')
    await writeFile(temp, bytes, {
      flag: 'wx',
      mode: 0o600
    })
    await rename(temp, join(this.directory, 'author-handoffs.enc'))
    this.rememberCompleted(compacted)
  }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const work = this.serial.then(fn)
    this.serial = work.catch(() => undefined)
    return work
  }
  prepare(sessionId: string, operationGeneration: string, nameShare?: NameShareBinding) {
    return this.run(async () => {
      if (
        !sessionId ||
        sessionId.length > 128 ||
        !operationGeneration ||
        operationGeneration.length > 128
      )
        throw new Error('Invalid author request context')
      const data = await this.load()
      if (nameShare && !validNameShare({ ...nameShare, expiresAt: null }))
        throw new Error('Invalid name verification binding')
      let pending = data.pending.find((p) => nameShare
        ? p.nameShare?.shareId === nameShare.shareId && p.nameShare.draftRevision === nameShare.draftRevision
        : !p.nameShare && p.sessionId === sessionId && p.operationGeneration === operationGeneration)
      if (pending && nameShare) { pending.sessionId = sessionId; pending.operationGeneration = operationGeneration }
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
  /** Management readers remain generation-bound. Bound name verification
   * survives restart and reattaches through the durable share identity. */
  discardInterrupted(cancel: (requestId: string, authorization: string) => Promise<unknown>): Promise<void> {
    return this.run(async () => {
      const data = await this.load()
      const interrupted = data.pending.filter(p => !p.nameShare)
      // Startup observation must not create a private directory before a fresh
      // session repository has completed its guarded migration.
      if (!interrupted.length) return
      for (const p of interrupted) {
        if (p.requestId) await cancel(p.requestId, 'Handoff ' + p.readerSecret).catch(() => undefined)
      }
      data.pending = data.pending.filter(p => p.nameShare)
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
  /** Callback executes in main. Its return must be reduced to a closed receipt
   * before any IPC reply; secrets and clipboard contents never leave main. */
  consume<T>(
    requestId: string,
    sessionId: string,
    operationGeneration: string,
    exchange: (authorization: string, consumptionId: string) => Promise<T>,
    stillCurrent: () => boolean
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
