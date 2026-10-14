// Output builder with a byte size limit (RT-35).
import { utf8Length } from './escape.js';

export class Output {
  private readonly chunks: string[] = [];
  private bytes = 0;

  constructor(private readonly limit: number, private readonly onLimit: () => never) {}

  write(text: string): void {
    if (text.length === 0) return;
    this.bytes += utf8Length(text);
    if (this.bytes > this.limit) this.onLimit();
    this.chunks.push(text);
  }

  toString(): string {
    return this.chunks.join('');
  }
}
