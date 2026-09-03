export interface InputSource<T> {
  value: T;
  scope: string;
}

/** A local edit is not a session mutation until explicitly committed. */
export class InputDraft<T extends string | number> {
  raw: string;
  private dirty = false;

  constructor(private source: InputSource<T>, private format: (value: T) => string) {
    this.raw = format(source.value);
  }

  sync(source: InputSource<T>): void {
    // A session switch or external edit (preset/reset/import) owns the field.
    // Never write an old draft over it, even if the old blur arrives late.
    if (source.scope !== this.source.scope || !Object.is(source.value, this.source.value)) {
      this.source = source;
      this.raw = this.format(source.value);
      this.dirty = false;
    }
  }

  edit(raw: string): void {
    this.raw = raw;
    this.dirty = true;
  }

  commit(source: InputSource<T>, parse: (raw: string) => T): T | undefined {
    this.sync(source);
    if (!this.dirty) return undefined;
    // Clear synchronously: Enter followed by blur must not commit twice.
    this.dirty = false;
    const next = parse(this.raw);
    this.raw = this.format(next);
    return Object.is(next, source.value) ? undefined : next;
  }
}
