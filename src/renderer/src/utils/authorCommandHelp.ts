export const AUTHOR_COMMAND_ACTION_LABELS = {
  preview: 'Review public name change',
  recover: 'Recover names',
  confirmation: 'Get private publication confirmation'
} as const

export type AuthorCommandAction = keyof typeof AUTHOR_COMMAND_ACTION_LABELS

export function authorCommandHelp(action: AuthorCommandAction): string {
  return `In the sharing channel, type /wledger-author, pick “${AUTHOR_COMMAND_ACTION_LABELS[action]}” as the action, then paste the request ID. The reply is private.`
}
