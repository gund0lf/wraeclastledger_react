import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AUTHOR_COMMAND_ACTION_LABELS, authorCommandHelp } from './authorCommandHelp'

describe('Discord author-command help', () => {
  it.each([
    ['preview', 'Review public name change'],
    ['recover', 'Recover names'],
    ['confirmation', 'Get private publication confirmation']
  ] as const)('shows the visible choice for %s without changing its internal value', (action, label) => {
    expect(AUTHOR_COMMAND_ACTION_LABELS[action]).toBe(label)
    expect(authorCommandHelp(action)).toBe(
      `In the sharing channel, type /wledger-author, pick “${label}” as the action, then paste the request ID. The reply is private.`
    )
  })

  it('uses the same help for first-name fallback and the general confirmation panel', () => {
    const source = readFileSync(new URL('../components/AuthorConfirmationPanel.tsx', import.meta.url), 'utf8')
    expect(source).toContain("{authorCommandHelp('confirmation')}")
    expect(source).toContain('{authorCommandHelp(action)}')
    expect(source).not.toContain('choose action: confirmation')
    expect(source).not.toContain('choose action: {action}')
  })
})
