export class HtmlCache {
  private entries = new Map<string, string>();

  constructor(private maxEntries: number) {}

  get(key: string) {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;

    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: string) {
    if (this.maxEntries <= 0) return;

    this.entries.delete(key);
    this.entries.set(key, value);

    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
