import { describe, expect, it } from 'vitest'
import {
  applyAuthorRecovery,
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
