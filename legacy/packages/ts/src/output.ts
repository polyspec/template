// Output builder with a byte size limit (RT-35).
import { utf8Length } from './escape.js';

/** The writable output instance exposed by a render context (RT-35). */
export interface Output {
  /** Appends text within the context's UTF-8 byte limit. */
  write(text: string): void;
  /** Returns text in append order. */
  toString(): string;
}

// Buffer construction belongs to the context, not the public instance contract.
class BufferedOutput implements Output {
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

// Internal factory: the package entry exports only the Output instance type.
export function createOutput(limit: number, onLimit: () => never): Output {
  return new BufferedOutput(limit, onLimit);
}
