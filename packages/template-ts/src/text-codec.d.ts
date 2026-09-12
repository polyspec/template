// Minimal declarations of the UTF-8 codec globals that both Node.js and browsers provide.
declare class TextDecoder {
  constructor(label?: string);
  decode(input: Uint8Array): string;
}
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
