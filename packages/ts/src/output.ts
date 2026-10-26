// Output builder with a byte size limit (RT-35).
import { utf8Length } from './escape.js';

// Collects rendered text while enforcing the UTF-8 output byte limit (RT-35).
export class Output {
  private readonly chunks: string[] = [];
  private bytes = 0;

  // Sets the output byte limit and the callback that aborts an over-limit render.
  constructor(private readonly limit: number, private readonly onLimit: () => never) {}

  // Appends text when its UTF-8 bytes fit; otherwise invokes the limit callback.
  write(text: string): void {
    if (text.length === 0) return;
    this.bytes += utf8Length(text);
    if (this.bytes > this.limit) this.onLimit();
    this.chunks.push(text);
  }

  // Returns the text collected in append order.
  toString(): string {
    return this.chunks.join('');
  }
}
