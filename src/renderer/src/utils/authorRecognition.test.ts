import { describe, expect, it } from 'vitest'
import {
  applyAuthorRecovery,
  applyReviewedNameVerification,
  acceptExactNameVerification,
  authorConfirmationNeedsReview,
  canPrepareAuthorAction,
  emptyAuthorPreferences,
  forgetAuthor,
  invalidateAuthorEpoch,
  previewAuthorRecovery,
  type AuthorReceipt
} from '../../../shared/authorRecognition'
import { normalizePublicAuthorName } from '../../../shared/authorNames'
const id = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const epoch = '33333333-3333-4333-8333-333333333333'
const receipt: AuthorReceipt = {
  schema_version: 1,
  request_id: id,
  client_request_id: second,
  epoch,
  registrations: [{ registration_id: id, name: 'Example', status: 'active' }]
}
describe('public author recognition', () => {
  it('explicit first-name review preserves the current default without inheriting confirmation or choosing a new one', () => {
    const current = { ...emptyAuthorPreferences(), defaultRegistrationId: second,
      registrations: [{ registrationId: second, name: 'Second', epoch, confirmed: true }] }
    const saved = applyReviewedNameVerification(current, receipt)
    expect(saved.defaultRegistrationId).toBe(second)
    expect(saved.registrations).toEqual([
      { ...current.registrations[0], confirmed: false },
      { registrationId: id, name: 'Example', epoch, confirmed: true }
    ])
    expect(canPrepareAuthorAction(saved, second, epoch)).toBe(false)
    expect(canPrepareAuthorAction(saved, id, epoch)).toBe(true)
    expect(current.registrations[0].confirmed).toBe(true)
    expect(applyReviewedNameVerification(emptyAuthorPreferences(), receipt).defaultRegistrationId).toBeNull()
    expect(() => applyReviewedNameVerification(current, { ...receipt,
      registrations: [{ registration_id: second, name: 'Changed identity', status: 'active' }] })).toThrow('Registration identity changed')
  })
  it('saves only the exactly typed, privately revalidated name without changing the default or other names', () => {
    const current = { ...emptyAuthorPreferences(), defaultRegistrationId: second,
      registrations: [{ registrationId: second, name: 'Second', epoch, confirmed: true }] }
    const saved = acceptExactNameVerification(current, receipt, 'Example')!
    expect(saved.defaultRegistrationId).toBe(second)
    expect(saved.registrations).toEqual([...current.registrations, { registrationId: id, name: 'Example', epoch, confirmed: true }])
    expect(current.registrations).toHaveLength(1)
    expect(acceptExactNameVerification(emptyAuthorPreferences(), receipt, 'Example')?.defaultRegistrationId).toBeNull()
    expect(acceptExactNameVerification(saved, receipt, 'Example')).toEqual(saved)
  })
  it('keeps changed spelling, multiple names, a replaced registration and changed epochs in review', () => {
    expect(acceptExactNameVerification(emptyAuthorPreferences(), receipt, 'example')).toBeNull()
    expect(acceptExactNameVerification(emptyAuthorPreferences(), { ...receipt, registrations: [] }, 'Example')).toBeNull()
    const other = { registrationId: second, name: 'Example', epoch, confirmed: true }
    expect(acceptExactNameVerification({ ...emptyAuthorPreferences(), registrations: [other] }, receipt, 'Example')).toBeNull()
    expect(acceptExactNameVerification({ ...emptyAuthorPreferences(), registrations: [{ ...other, name: 'Other', epoch: second }] }, receipt, 'Example')).toBeNull()
    expect(acceptExactNameVerification(emptyAuthorPreferences(), { ...receipt, registrations: [...receipt.registrations,
      { registration_id: second, name: 'Other', status: 'active' }] }, 'Example')).toBeNull()
  })
  it('accepts the same confirmation after persisted JSON reorders registration properties', () => {
    const redelivered: AuthorReceipt = {
      ...receipt,
      registrations: [{ name: 'Example', status: 'active', registration_id: id }]
    }
    expect(JSON.stringify(redelivered.registrations)).not.toBe(JSON.stringify(receipt.registrations))
    expect(authorConfirmationNeedsReview(receipt, redelivered)).toBe(false)
    expect(authorConfirmationNeedsReview(redelivered, receipt)).toBe(false)
    expect(applyAuthorRecovery(emptyAuthorPreferences(), redelivered, {
      defaultRegistrationId: id, forgetObsoleteIds: []
    }).defaultRegistrationId).toBe(id)
  })
  it.each([
    ['epoch', { ...receipt, epoch: second }],
    ['identity', { ...receipt, registrations: [{ ...receipt.registrations[0], registration_id: second }] }],
    ['name', { ...receipt, registrations: [{ ...receipt.registrations[0], name: 'Changed' }] }],
    ['status', { ...receipt, registrations: [{ ...receipt.registrations[0], status: 'retired' }] }],
    ['removed registration', { ...receipt, registrations: [] }],
    ['added registration', { ...receipt, registrations: [...receipt.registrations, { registration_id: second, name: 'Second', status: 'active' }] }]
  ])('requires explicit review for changed %s', (_label, changed) => {
    // Main validates status before this boundary; retain that comparison too.
    expect(authorConfirmationNeedsReview(receipt, changed as AuthorReceipt)).toBe(true)
  })
  it('does not hide a changed registration order or mutate either receipt', () => {
    const original: AuthorReceipt = { ...receipt, registrations: [
      ...receipt.registrations, { registration_id: second, name: 'Second', status: 'active' }
    ] }
    const reordered = { ...original, registrations: [...original.registrations].reverse() }
    const before = JSON.stringify([original, reordered])
    expect(authorConfirmationNeedsReview(original, reordered)).toBe(true)
    expect(authorConfirmationNeedsReview(original, original)).toBe(false)
    expect(JSON.stringify([original, reordered])).toBe(before)
  })
  it('normalizes labels without inferring ownership', () => {
    expect(normalizePublicAuthorName(' Ｓａｄ  ')).toEqual({ name: 'Sad', key: 'sad' })
    expect(normalizePublicAuthorName('名前').name).toBe('名前')
    for (const name of [
      'a',
      'Admin',
      'Sad\tName',
      'Sad\u200B',
      '1\uFE0F\u20E3a',
      'Sad\u034F',
      '1\u20E3a',
      '😀Sad',
      '..'
    ])
      expect(() => normalizePublicAuthorName(name)).toThrow()
    expect(canPrepareAuthorAction(emptyAuthorPreferences(), id, epoch)).toBe(false)
  })
  it('requires explicit recovery consent and default choice even for one alias', () => {
    const current = emptyAuthorPreferences()
    expect(previewAuthorRecovery(current, receipt).confirmed[0].state).toBe('new')
    expect(current.registrations).toHaveLength(0)
    const recovered = applyAuthorRecovery(current, receipt, {
      defaultRegistrationId: null,
      forgetObsoleteIds: []
    })
    expect(recovered.defaultRegistrationId).toBeNull()
    expect(canPrepareAuthorAction(recovered, id, epoch)).toBe(true)
    expect(() =>
      applyAuthorRecovery(current, receipt, {
        defaultRegistrationId: second,
        forgetObsoleteIds: []
      })
    ).toThrow()
  })
  it('same text with a new registration never inherits recognition or a default', () => {
    const old = applyAuthorRecovery(emptyAuthorPreferences(), receipt, {
      defaultRegistrationId: id,
      forgetObsoleteIds: []
    })
    const replacement: AuthorReceipt = {
      ...receipt,
      registrations: [{ registration_id: second, name: 'Example', status: 'active' }]
    }
    const preview = previewAuthorRecovery(old, replacement)
    expect(preview.confirmed[0].state).toBe('registration_refreshed')
    expect(preview.defaultStillConfirmed).toBe(false)
    const merged = applyAuthorRecovery(old, replacement, {
      defaultRegistrationId: null,
      forgetObsoleteIds: []
    })
    expect(merged.registrations).toHaveLength(2)
    expect(canPrepareAuthorAction(merged, id, epoch)).toBe(false)
    expect(canPrepareAuthorAction(merged, second, epoch)).toBe(true)
  })
  it('Forget is local, with explicit default clearing; epoch invalidation retains saved choices for review', () => {
    const original = applyAuthorRecovery(emptyAuthorPreferences(), receipt, {
      defaultRegistrationId: id,
      forgetObsoleteIds: []
    })
    expect(() => forgetAuthor(original, id, { replacementDefault: id })).toThrow()
    expect(forgetAuthor(original, id, { replacementDefault: null })).toEqual(
      emptyAuthorPreferences()
    )
    const invalidated = invalidateAuthorEpoch(original, second)
    expect(invalidated.defaultRegistrationId).toBe(id)
    expect(invalidated.registrations).toHaveLength(1)
    expect(canPrepareAuthorAction(invalidated, id, second)).toBe(false)
    expect(original.registrations[0].confirmed).toBe(true)
  })
})
