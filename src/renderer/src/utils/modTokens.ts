/**
 * modTokens.ts (renderer) - compatibility re-export.
 *
 * WP12: the actual MOD_TOKENS data moved to src/shared/modTokens.ts so the main
 * process (BRICK_MOD_DEFS) and the renderer (RegexBuilder) share ONE source. This
 * file re-exports it so existing renderer imports of './modTokens' keep resolving
 * unchanged. New code may import from '../../../shared/modTokens' directly; this
 * shim can be removed once no renderer file references the old path.
 */
export { MOD_TOKENS } from '../../../shared/modTokens';
export type { ModTokenId } from '../../../shared/modTokens';
