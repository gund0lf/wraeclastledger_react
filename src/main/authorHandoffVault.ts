import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, open, rename, mkdir, stat, lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { closedAuthorObject, type PublicationOperation, type ShareStorageCode } from '../shared/authorHandoff'
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
  recoveredAt?: number
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
function fullRecordsFit(data: VaultRecord, progressMetadata = false): boolean {
  // Completed replay markers contain only closed, bounded identity/result
  // fields. They do not consume the quota for unresolved payloads/capabilities.
  const { completed: _completed, ...full } = data
  // A payload admitted just below the byte limit must still be able to save
  // its result and finish name verification. Only closed, bounded progress
  // fields get this allowance; all payload and unknown fields stay charged.
  const charged = progressMetadata ? { ...full,
    shares: full.shares?.map(({ result: _result, copiedRevision: _copied, pollingActivityAt: _activity, ...share }) =>
      ({ ...share, result: null })),
    pending: full.pending.map(p => Object.fromEntries(Object.entries(p).filter(([key, value]) =>
      !boundedReaderField(key, value)))).filter(p => Object.keys(p).length > 0)
  } : full
  return (data.shares?.length ?? 0) <= 512 && Buffer.byteLength(JSON.stringify(charged)) <= fullRecordBudget
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
function validNameShare(value: unknown): value is ResumableName {
  return closedAuthorObject(value, ['shareId', 'draftRevision', 'expiresAt']) &&
    typeof value.shareId === 'string' && uuid.test(value.shareId) &&
    Number.isSafeInteger(value.draftRevision) && (value.draftRevision as number) > 0 &&
    (value.expiresAt === null || typeof value.expiresAt === 'string' && value.expiresAt.length <= 40 && Number.isFinite(Date.parse(value.expiresAt)))
}
function boundedReaderField(key: string, value: unknown): boolean {
  switch (key) {
    case 'clientRequestId': case 'consumptionId':
      return typeof value === 'string' && uuid.test(value)
    case 'requestId': return value === null || typeof value === 'string' && uuid.test(value)
    case 'sessionId': case 'operationGeneration': return typeof value === 'string' && value.length <= 128
    case 'readerSecret': return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
    case 'createdAt': return typeof value === 'number' && Number.isFinite(value)
    case 'nameShare': return validNameShare(value)
    default: return false
  }
}
const domainHash = (name: string, value: Buffer) =>
  createHash('sha256')
    .update(name + '\0')
    .update(value)
    .digest('hex')

export type ProtectedShareStorageCode = ShareStorageCode
const storageMessages: Record<ProtectedShareStorageCode, string> = {
  encryption_unavailable: 'Sharing is unavailable because this PC cannot open secure encrypted storage. Saved drafts and results have not been changed. Restore access to your system’s secure storage before sharing.',
  damaged: 'The sharing history on this PC can\'t be read, so sharing is paused to avoid posting anything twice. Your sessions and saved names are not affected. You can start a new sharing history; the old files are kept.',
  full: 'Unfinished sharing storage is full. No saved shares were removed. Finish shares you already copied and let the app receive their results before preparing another share. Unposted copies still take space; waiting alone does not free it. If existing shares cannot be opened, ask in the WraeclastLedger Discord without deleting the sharing history.',
  io: 'Your sharing history could not be read or saved because of a disk or file-access problem. Sharing is paused. Check free disk space and access to this app profile, then try again; do not delete the sharing history.',
  recovery_required: 'A sharing save was interrupted, so sharing is paused to avoid posting anything twice. You can start a new sharing history; the old files are kept.'
}
export class ProtectedShareStorageError extends Error {
  constructor(readonly code: ProtectedShareStorageCode = 'encryption_unavailable') {
    super(storageMessages[code])
    this.name = 'ProtectedShareStorageError'
  }
}
export class ShareRecoveryConfirmationError extends Error {
  constructor() {
    super('This session is from before the recovery. If you already shared it, use Continue in the Strategy Browser. Share as new anyway?')
    this.name = 'ShareRecoveryConfirmationError'
  }
}
interface RecoveryFile {
  name: string
  digest: string
  size: number
  modified: number
  changed: number
  device: number
  inode: number
}
const pendingFile = /^author-handoffs\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pending$/
const validRecoveryTime = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
function predatesRecovery(data: VaultRecord, createdAt: number | null | undefined): boolean {
  return data.recoveredAt !== undefined && (!validRecoveryTime(createdAt) || createdAt <= data.recoveredAt)
}

/** Main-only encrypted capabilities; never portable session or renderer state.
 * The directory must be within the active file repository's private data root. */
export class AuthorHandoffVault {
  private serial: Promise<unknown> = Promise.resolve()
  // Display-only LRU: eviction never changes stored outcomes, identities or
  // unfinished work. Closing a window keeps exact values while the app runs.
  private completedDisplays = new Map<string, { binding: string; snapshot: ShareDisplaySnapshot; bytes: number }>()
  private completedDisplayBytes = 0
  // The renderer receives only an opaque approval token. File fingerprints and
  // names remain main-process state and are rechecked before recovery writes.
  private recoveryPreview: { id: string; files: RecoveryFile[] } | null = null
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
  private async requireNoInterruptedStore(): Promise<void> {
    // Inspect only this private vault directory, never select a candidate by
    // timestamp or silently turn a lost current store into a fresh identity.
    try {
      if ((await readdir(this.directory)).some(name => pendingFile.test(name)))
        throw new ProtectedShareStorageError('recovery_required')
    } catch (error) {
      if (error instanceof ProtectedShareStorageError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ProtectedShareStorageError('io')
    }
  }
  private async load(persistCompaction = true): Promise<VaultRecord> {
    try {
      if (!this.protection.isEncryptionAvailable()) throw new Error('Encryption unavailable')
    } catch { throw new ProtectedShareStorageError('encryption_unavailable') }
    let bytes: Buffer
    try {
      bytes = await readFile(join(this.directory, 'author-handoffs.enc'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.requireNoInterruptedStore()
        return { version: 1, installationId: randomUUID(), pending: [] }
      }
      throw new ProtectedShareStorageError('io')
    }
    let data: VaultRecord
    try { data = JSON.parse(this.protection.decryptString(bytes)) as VaultRecord }
    catch { throw new ProtectedShareStorageError('damaged') }
    if (
      !data || typeof data !== 'object' || Array.isArray(data) || data.version !== 1 ||
      !uuid.test(data.installationId) ||
      (data.recoveredAt !== undefined && !validRecoveryTime(data.recoveredAt)) ||
      (data.shares !== undefined && (!Array.isArray(data.shares) ||
        data.shares.some(s => !validDurableShare(s)) || new Set(data.shares.map(s => s.id)).size !== data.shares.length)) ||
      (data.completed !== undefined && (!Array.isArray(data.completed) || data.completed.some(s => !validCompletedShare(s)))) ||
      !Array.isArray(data.pending) ||
      data.pending.length > 2 ||
      data.pending.some(
        (p) =>
          !p || typeof p !== 'object' || !uuid.test(p.clientRequestId) ||
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
      throw new ProtectedShareStorageError('damaged')
    const records = [...data.shares ?? [], ...data.completed ?? []]
    if (new Set(records.map(s => s.id)).size !== records.length ||
      new Set(records.map(s => JSON.stringify([s.sessionIdentity, s.targetGeneration]))).size !== records.length)
      throw new ProtectedShareStorageError('damaged')
    // Development-only operation acknowledgements never establish a durable
    // share result or a name. Discard their readers without consuming or
    // cancelling anything remotely; current name readers remain unchanged.
    data.pending = data.pending.filter((p) => !Object.hasOwn(p, 'operation') &&
      p.createdAt <= this.now() && this.now() - p.createdAt < 15 * 60_000)
    const compacted = compactCompleted(data)
    if (!fullRecordsFit(data, true)) throw new ProtectedShareStorageError('full')
    if (compacted.length && persistCompaction) { await this.save(data); this.rememberCompleted(compacted) }
    return data
  }
  private async recoveryInventory(): Promise<RecoveryFile[]> {
    try {
      const root = await lstat(this.directory)
      if (!root.isDirectory() || root.isSymbolicLink()) throw new ProtectedShareStorageError('io')
      const names = (await readdir(this.directory)).filter(name => name === 'author-handoffs.enc' || pendingFile.test(name)).sort()
      const files: RecoveryFile[] = []
      for (const name of names) {
        const file = join(this.directory, name), before = await lstat(file)
        if (!before.isFile() || before.isSymbolicLink()) throw new ProtectedShareStorageError('io')
        const bytes = await readFile(file), after = await lstat(file)
        if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino ||
          before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
          throw new ProtectedShareStorageError('io')
        files.push({ name, digest: createHash('sha256').update(bytes).digest('hex'), size: after.size,
          modified: after.mtimeMs, changed: after.ctimeMs, device: after.dev, inode: after.ino })
      }
      return files
    } catch (error) {
      if (error instanceof ProtectedShareStorageError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ProtectedShareStorageError('recovery_required')
      throw new ProtectedShareStorageError('io')
    }
  }
  private async requireRecoverable(): Promise<void> {
    try { await this.load(false) }
    catch (error) {
      if (error instanceof ProtectedShareStorageError && (error.code === 'damaged' || error.code === 'recovery_required')) return
      throw error
    }
    throw new Error('Sharing history is readable. Recovery is not needed.')
  }
  previewRecovery(): Promise<{ recoveryId: string }> {
    return this.run(async () => {
      this.recoveryPreview = null
      const files = await this.recoveryInventory()
      await this.requireRecoverable()
      if (!files.length) throw new Error('There are no sharing files to recover.')
      const id = randomUUID()
      this.recoveryPreview = { id, files }
      return { recoveryId: id }
    })
  }
  confirmRecovery(recoveryId: string, stillCurrent: () => boolean): Promise<{ recoveredAt: number }> {
    return this.run(async () => {
      const preview = this.recoveryPreview
      this.recoveryPreview = null
      const requireCurrent = () => {
        if (!stillCurrent()) throw new Error('The recovery context changed. Review recovery again.')
      }
      requireCurrent()
      if (!preview || preview.id !== recoveryId) throw new Error('Review sharing recovery before confirming it.')
      const files = await this.recoveryInventory()
      if (canonicalAuthorJson(files) !== canonicalAuthorJson(preview.files))
        throw new Error('The sharing files changed. Review recovery again.')
      await this.requireRecoverable()
      requireCurrent()
      const recoveredAt = this.now()
      if (!validRecoveryTime(recoveredAt)) throw new ProtectedShareStorageError('io')
      const fresh: VaultRecord = { version: 1, installationId: randomUUID(), recoveredAt, pending: [] }
      let bytes: Buffer
      try {
        if (!this.protection.isEncryptionAvailable()) throw new Error('Encryption unavailable')
        bytes = this.protection.encryptString(JSON.stringify(fresh))
      } catch { throw new ProtectedShareStorageError('encryption_unavailable') }
      // A candidate exists before any old file is moved. If interrupted, normal
      // loading stays held; even a readable candidate is never adopted on its own.
      const candidate = join(this.directory, 'author-handoffs.' + randomUUID() + '.pending')
      const preserved = join(this.directory, 'author-handoffs-preserved.' + randomUUID())
      try {
        const handle = await open(candidate, 'wx', 0o600)
        try { await handle.writeFile(bytes); await handle.sync() }
        finally { await handle.close() }
        requireCurrent()
        const unchanged = (await this.recoveryInventory()).filter(file => join(this.directory, file.name) !== candidate)
        if (canonicalAuthorJson(unchanged) !== canonicalAuthorJson(files))
          throw new Error('The sharing files changed. Review recovery again.')
        await mkdir(preserved, { mode: 0o700 })
        for (const file of files) {
          requireCurrent()
          await rename(join(this.directory, file.name), join(preserved, file.name))
        }
        requireCurrent()
        await rename(candidate, join(this.directory, 'author-handoffs.enc'))
      } catch { throw new ProtectedShareStorageError('io') }
      this.completedDisplays.clear()
      this.completedDisplayBytes = 0
      return { recoveredAt }
    })
  }
  recoveryRequiredForSession(sessionCreatedAt: number | null): Promise<boolean> {
    return this.run(async () => predatesRecovery(await this.load(), sessionCreatedAt))
  }
  durableShares(): Promise<DurableShareView[]> {
    return this.durableTrackingShares().then(records => records.map(record => record.view))
  }
  durableTrackingShares(): Promise<{ view: DurableShareView; pollingActivityAt: number | null }[]> {
    return this.run(async () => (await this.load()).shares?.map(s => ({ view: shareView(s),
      pollingActivityAt: s.pollingActivityAt ?? null })) ?? [])
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
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await this.requireNoInterruptedStore()
          return null
        }
        throw new ProtectedShareStorageError('io')
      }
      try {
        const data = await this.load()
        const s = data.shares?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === null)
        const done = data.completed?.find(s => s.sessionIdentity === sessionIdentity && s.targetGeneration === null)
        return s ? shareView(s) : done ? this.completedDisplayView(done) : null
      } catch (error) {
        if (error instanceof ProtectedShareStorageError) throw error
        throw new ProtectedShareStorageError('damaged')
      }
    })
  }
  prepareDurable(input: { sessionIdentity: string; sessionId: string; targetGeneration: string | null;
    operation: PublicationOperation; epoch: string; core: string; metadata: AuthorSubmissionMetadata;
    sessionCreatedAt?: number | null; recoveryConfirmed?: boolean },
    exchange: (body: unknown, authorization: string) => Promise<unknown>): Promise<{ view: ActiveDurableShareView; metadata: AuthorSubmissionMetadata }> {
    return this.run(async () => {
      const data = await this.load()
      if (data.completed?.some(s => s.sessionIdentity === input.sessionIdentity && s.targetGeneration === input.targetGeneration))
        throw new Error('This share is already processing or shared. Open it in the Strategy Browser and choose Continue to change it.')
      data.shares ??= []
      let s = data.shares.find(s => s.sessionIdentity === input.sessionIdentity && s.targetGeneration === input.targetGeneration)
      if (!s) {
        if (input.operation.kind === 'publication' && predatesRecovery(data, input.sessionCreatedAt) && input.recoveryConfirmed !== true)
          throw new ShareRecoveryConfirmationError()
        if (data.shares.length >= 512) throw new ProtectedShareStorageError('full')
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
        s.pollingActivityAt = this.now()
        // Only a new/changed proposal spends payload capacity. A retry of an
        // admitted proposal or unchanged Copy never reapplies this admission.
        if (!fullRecordsFit(data)) throw new ProtectedShareStorageError('full')
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
      s.pollingActivityAt = this.now()
      await this.save(data)
      return shareView(s)
    })
  }
  private async save(data: VaultRecord): Promise<void> {
    if (data.shares?.some(s => !validDurableShare(s)) || data.completed?.some(s => !validCompletedShare(s)))
      throw new ProtectedShareStorageError('damaged')
    const compacted = compactCompleted(data)
    if (!fullRecordsFit(data, true)) throw new ProtectedShareStorageError('full')
    let bytes: Buffer
    try {
      if (!this.protection.isEncryptionAvailable()) throw new Error('Encryption unavailable')
      bytes = this.protection.encryptString(JSON.stringify(data))
    } catch { throw new ProtectedShareStorageError('encryption_unavailable') }
    try {
      await mkdir(this.directory, { recursive: true })
      const temp = join(this.directory, 'author-handoffs.' + randomUUID() + '.pending')
      const handle = await open(temp, 'wx', 0o600)
      try {
        await handle.writeFile(bytes)
        // Flush before replacing the last acknowledged store. The disk/OS may
        // still have hardware-specific durability limits; this is not rollback.
        await handle.sync()
      } finally { await handle.close() }
      await rename(temp, join(this.directory, 'author-handoffs.enc'))
    } catch { throw new ProtectedShareStorageError('io') }
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
