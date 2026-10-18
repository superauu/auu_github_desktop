import { parseDiffOutput, type ParsedDiffLine } from './PorcelainParser';

/** Cache parsing only, never Git reads: equal status codes do not imply equal contents. */
export class DiffCache {
  private entries = new Map<string, { raw: string; lines: ParsedDiffLine[] }>();
  private size = 0;
  constructor(private readonly budget = 2 * 1024 * 1024, private readonly limit = 8) {}
  parse(key: string, raw: string): ParsedDiffLine[] {
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.size -= previous.raw.length * 2;
      if (previous.raw === raw) {
        this.entries.set(key, previous); this.size += raw.length * 2;
        return previous.lines;
      }
    }
    const lines = parseDiffOutput(raw);
    if (raw.length * 2 > this.budget) return lines;
    this.entries.set(key, { raw, lines }); this.size += raw.length * 2;
    while (this.size > this.budget || this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value!;
      this.size -= this.entries.get(oldest)!.raw.length * 2;
      this.entries.delete(oldest);
    }
    return lines;
  }
}
