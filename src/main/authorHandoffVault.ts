import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

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
}
interface VaultRecord {
  version: 1
  installationId: string
  pending: PendingAuthorRequest[]
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const domainHash = (name: string, value: Buffer) =>
  createHash('sha256')
    .update(name + '\0')
    .update(value)
    .digest('hex')

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
      throw new Error(
        'Protected storage is unavailable. Local author confirmation cannot be prepared.'
      )
    let bytes: Buffer
    try {
      bytes = await readFile(join(this.directory, 'author-handoffs.enc'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, installationId: randomUUID(), pending: [] }
      throw error
    }
    if (bytes.length > 16384) throw new Error('Author confirmation storage is too large.')
    const data = JSON.parse(this.protection.decryptString(bytes)) as VaultRecord
    if (
      data.version !== 1 ||
      !uuid.test(data.installationId) ||
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
          (p.requestId !== null && !uuid.test(p.requestId))
      )
    )
      throw new Error('Author confirmation storage is invalid.')
    data.pending = data.pending.filter(
      (p) => p.createdAt <= this.now() && this.now() - p.createdAt < 15 * 60_000
    )
    return data
  }
  private async save(data: VaultRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temp = join(this.directory, 'author-handoffs.' + randomUUID() + '.pending')
    await writeFile(temp, this.protection.encryptString(JSON.stringify(data)), {
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
  prepare(sessionId: string, operationGeneration: string) {
    return this.run(async () => {
      if (
        !sessionId ||
        sessionId.length > 128 ||
        !operationGeneration ||
        operationGeneration.length > 128
      )
        throw new Error('Invalid author request context')
      const data = await this.load()
      let pending = data.pending.find(
        (p) => p.sessionId === sessionId && p.operationGeneration === operationGeneration
      )
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
          consumptionId: randomUUID()
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
  /** A new main service cannot reuse renderer operation generations from a prior
   * process. Retire those readers before accepting new work; keep installation ID. */
  discardInterrupted(cancel: (requestId: string, authorization: string) => Promise<unknown>): Promise<void> {
    return this.run(async () => {
      const data = await this.load()
      for (const p of data.pending) {
        if (p.requestId) await cancel(p.requestId, 'Handoff ' + p.readerSecret).catch(() => undefined)
      }
      data.pending = []
      await this.save(data)
    })
  }
  bind(clientRequestId: string, requestId: string): Promise<void> {
    return this.run(async () => {
      if (!uuid.test(requestId)) throw new Error('Invalid confirmation request')
      const data = await this.load(),
        pending = data.pending.find((p) => p.clientRequestId === clientRequestId)
      if (!pending || (pending.requestId !== null && pending.requestId !== requestId))
        throw new Error('Confirmation request changed')
      pending.requestId = requestId
      await this.save(data)
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
