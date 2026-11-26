import { normalizePublicAuthorName } from './authorNames'
import { canonicalAuthorJson } from './authorSubmission'

export interface RecognizedAuthor {
  registrationId: string
  name: string
  epoch: string
  confirmed: boolean
}
export interface AuthorPreferences {
  schemaVersion: 1
  registrations: RecognizedAuthor[]
  defaultRegistrationId: string | null
}
export function initialAssignmentRegistration(preferences: AuthorPreferences, choice: string | null): RecognizedAuthor | undefined {
  const id = choice ?? preferences.defaultRegistrationId
  return preferences.registrations.find(registration => registration.confirmed && registration.registrationId === id)
}

export interface AuthorReceipt {
  schema_version: 1
  request_id: string
  client_request_id: string
  epoch: string
  registrations: { registration_id: string; name: string; status: 'active' }[]
}

/** Compare validated confirmation data, not JSON object property order. The
 * server may redeliver the same registrations from persisted JSON. Epoch,
 * values, membership and array order still require a fresh explicit review. */
export function authorConfirmationNeedsReview(previous: AuthorReceipt, refreshed: AuthorReceipt): boolean {
  return previous.epoch !== refreshed.epoch ||
    canonicalAuthorJson(previous.registrations) !== canonicalAuthorJson(refreshed.registrations)
}

/** Only the explicitly entered name may be saved without another review.
 * This runs after main revalidates the private code, never from public status.
 * Other names and the existing default are preserved; identity/epoch changes
 * still require the ordinary recovery review. */
export function acceptExactNameVerification(current: AuthorPreferences, receipt: AuthorReceipt,
  expectedName: string): AuthorPreferences | null {
  const preview = previewAuthorRecovery(current, receipt)
  if (preview.confirmed.length !== 1) return null
  const value = preview.confirmed[0]
  if (value.name !== expectedName || value.obsoleteRegistrationIds.length ||
    current.registrations.some(r => r.confirmed && r.epoch !== receipt.epoch)) return null
  const { registrationId, name, epoch, confirmed } = value
  const registrations = current.registrations.filter(r => r.registrationId !== registrationId)
  registrations.push({ registrationId, name, epoch, confirmed })
  if (registrations.length > 500) throw new Error('Forget unused local names before verifying more.')
  return { ...current, registrations }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const emptyAuthorPreferences = (): AuthorPreferences => ({
  schemaVersion: 1,
  registrations: [],
  defaultRegistrationId: null
})

/** Preferences contain presentation state only. Reject extra fields so private
 * exchange material can never be persisted through this preferences slot. */
export function parseAuthorPreferences(value: unknown): AuthorPreferences {
  if (value === undefined) return emptyAuthorPreferences()
  const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key))
  if (!exact(value, ['schemaVersion', 'registrations', 'defaultRegistrationId']) ||
    value.schemaVersion !== 1 || !Array.isArray(value.registrations) || value.registrations.length > 500)
    throw new Error('Invalid saved public names')
  const registrations = value.registrations.map((r): RecognizedAuthor => {
    if (!exact(r, ['registrationId', 'name', 'epoch', 'confirmed']) ||
      typeof r.registrationId !== 'string' || !uuid.test(r.registrationId) ||
      typeof r.epoch !== 'string' || !uuid.test(r.epoch) || typeof r.confirmed !== 'boolean' ||
      typeof r.name !== 'string' || normalizePublicAuthorName(r.name).name !== r.name)
      throw new Error('Invalid saved public name')
    return { registrationId: r.registrationId, name: r.name, epoch: r.epoch, confirmed: r.confirmed }
  })
  if (new Set(registrations.map((r) => r.registrationId)).size !== registrations.length ||
    (value.defaultRegistrationId !== null && !registrations.some((r) => r.registrationId === value.defaultRegistrationId)))
    throw new Error('Invalid saved public name selection')
  return { schemaVersion: 1, registrations, defaultRegistrationId: value.defaultRegistrationId as string | null }
}

/** A receipt reaches this boundary only through main's private-token exchange.
 * Recovery always presents a preview; the caller supplies an explicit choice. */
export function previewAuthorRecovery(current: AuthorPreferences, receipt: AuthorReceipt) {
  if (
    receipt.schema_version !== 1 ||
    !uuid.test(receipt.request_id) ||
    !uuid.test(receipt.client_request_id) ||
    !uuid.test(receipt.epoch) ||
    !Array.isArray(receipt.registrations) ||
    receipt.registrations.length > 5 ||
    new Set(receipt.registrations.map((r) => r.registration_id)).size !==
      receipt.registrations.length
  ) {
    throw new Error('Invalid author confirmation')
  }
  const confirmed = receipt.registrations.map((r) => {
    if (
      !uuid.test(r.registration_id) ||
      r.status !== 'active' ||
      normalizePublicAuthorName(r.name).name !== r.name
    ) {
      throw new Error('Invalid author confirmation')
    }
    const existing = current.registrations.find((old) => old.registrationId === r.registration_id)
    if (existing && existing.name !== r.name) throw new Error('Registration identity changed')
    const obsolete = current.registrations.filter(
      (old) =>
        old.registrationId !== r.registration_id &&
        normalizePublicAuthorName(old.name).key === normalizePublicAuthorName(r.name).key
    )
    return {
      registrationId: r.registration_id,
      name: r.name,
      epoch: receipt.epoch,
      confirmed: true,
      state: existing
        ? ('already_present' as const)
        : obsolete.length
          ? ('registration_refreshed' as const)
          : ('new' as const),
      obsoleteRegistrationIds: obsolete.map((old) => old.registrationId)
    }
  })
  return {
    confirmed,
    notConfirmed: current.registrations.filter(
      (old) => !confirmed.some((r) => r.registrationId === old.registrationId)
    ),
    defaultStillConfirmed: confirmed.some((r) => r.registrationId === current.defaultRegistrationId)
  }
}
export function applyAuthorRecovery(
  current: AuthorPreferences,
  receipt: AuthorReceipt,
  choice: {
    defaultRegistrationId: string | null
    forgetObsoleteIds: string[]
  }
): AuthorPreferences {
  const preview = previewAuthorRecovery(current, receipt)
  if (
    choice.defaultRegistrationId !== null &&
    !preview.confirmed.some((r) => r.registrationId === choice.defaultRegistrationId)
  ) {
    throw new Error('Choose a confirmed default or Choose each time.')
  }
  const obsolete = new Set(preview.confirmed.flatMap((r) => r.obsoleteRegistrationIds))
  if (choice.forgetObsoleteIds.some((id) => !obsolete.has(id)))
    throw new Error('Invalid replacement choice')
  const registrations = current.registrations
    .filter((r) => !choice.forgetObsoleteIds.includes(r.registrationId))
    .map((r) => ({ ...r, confirmed: false }))
  for (const { registrationId, name, epoch } of preview.confirmed) {
    const value = { registrationId, name, epoch, confirmed: true }
    const at = registrations.findIndex((r) => r.registrationId === registrationId)
    if (at < 0) registrations.push(value)
    else registrations[at] = value
  }
  if (registrations.length > 500)
    throw new Error('Forget unused local names before recovering more.')
  return { schemaVersion: 1, registrations, defaultRegistrationId: choice.defaultRegistrationId }
}

/** A reviewed first-name receipt saves names, not a new default preference.
 * Keep recovery's identity invalidation; an existing default may therefore need
 * verification, but it is never silently replaced or cleared by this action. */
export function applyReviewedNameVerification(current: AuthorPreferences, receipt: AuthorReceipt): AuthorPreferences {
  const preview = previewAuthorRecovery(current, receipt)
  const saved = applyAuthorRecovery(current, receipt, {
    defaultRegistrationId: preview.defaultStillConfirmed ? current.defaultRegistrationId : null,
    forgetObsoleteIds: []
  })
  return { ...saved, defaultRegistrationId: current.defaultRegistrationId }
}

export function forgetAuthor(
  current: AuthorPreferences,
  id: string,
  choice: {
    replacementDefault: string | null
  }
): AuthorPreferences {
  const remaining = current.registrations.filter((r) => r.registrationId !== id)
  if (
    current.defaultRegistrationId === id &&
    choice.replacementDefault !== null &&
    !remaining.some((r) => r.registrationId === choice.replacementDefault && r.confirmed)
  ) {
    throw new Error('Choose a confirmed default or Choose each time.')
  }
  if (
    current.defaultRegistrationId !== id &&
    choice.replacementDefault !== current.defaultRegistrationId
  ) {
    throw new Error('Forgetting this name must not change another default.')
  }
  return { ...current, registrations: remaining, defaultRegistrationId: choice.replacementDefault }
}
export function invalidateAuthorEpoch(
  current: AuthorPreferences,
  epoch: string
): AuthorPreferences {
  if (!uuid.test(epoch)) throw new Error('Invalid author service state')
  // Retain entries and the selected default for a visible recovery decision.
  return {
    ...current,
    registrations: current.registrations.map((r) => ({
      ...r,
      confirmed: r.confirmed && r.epoch === epoch
    }))
  }
}
export function canPrepareAuthorAction(
  current: AuthorPreferences,
  id: string,
  epoch: string
): boolean {
  return current.registrations.some(
    (r) => r.registrationId === id && r.epoch === epoch && r.confirmed
  )
}
