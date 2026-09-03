const pendingInputs = new Set<() => void>();

/** Join the repository's existing flush boundary without a second save queue. */
export function registerSessionInputDraft(flush: () => void): () => void {
  pendingInputs.add(flush);
  return () => { pendingInputs.delete(flush); };
}

export function flushSessionInputDrafts(): void {
  for (const flush of [...pendingInputs]) flush();
}
