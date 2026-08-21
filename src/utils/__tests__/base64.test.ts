import { bytesToBase64, base64ToBytes, chunkBytesToBase64, assembleBase64Chunks } from '../base64';

function bytesOf(...nums: number[]): Uint8Array {
  return new Uint8Array(nums);
}

describe('base64 round-trip', () => {
  it('encodes known vectors correctly', () => {
    // "Man" -> "TWFu", "Ma" -> "TWE=", "M" -> "TQ=="
    expect(bytesToBase64(bytesOf(0x4d, 0x61, 0x6e))).toBe('TWFu');
    expect(bytesToBase64(bytesOf(0x4d, 0x61))).toBe('TWE=');
    expect(bytesToBase64(bytesOf(0x4d))).toBe('TQ==');
  });

  it('handles empty input', () => {
    expect(bytesToBase64(bytesOf())).toBe('');
    expect(base64ToBytes('')).toEqual(bytesOf());
  });

  it('round-trips arbitrary byte sequences of varying length mod 3', () => {
    for (let len = 0; len < 50; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 13) & 0xff;
      const decoded = base64ToBytes(bytesToBase64(bytes));
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it('round-trips bytes including 0x00 and 0xff', () => {
    const bytes = bytesOf(0, 255, 0, 255, 128, 1, 254);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});

describe('chunking', () => {
  it('splits and reassembles exactly, regardless of chunk order', () => {
    const bytes = new Uint8Array(1000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;

    const chunks = chunkBytesToBase64(bytes, 99); // forced to multiple of 3 (99)
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(c => c.total === chunks.length)).toBe(true);

    // shuffle
    const shuffled = [...chunks].reverse();
    const reassembled = assembleBase64Chunks(shuffled);
    expect(Array.from(reassembled)).toEqual(Array.from(bytes));
  });

  it('produces a single chunk for small inputs', () => {
    const bytes = bytesOf(1, 2, 3);
    const chunks = chunkBytesToBase64(bytes, 192 * 1024);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].seq).toBe(0);
    expect(chunks[0].total).toBe(1);
  });

  it('handles empty input as a single empty chunk', () => {
    const chunks = chunkBytesToBase64(bytesOf());
    expect(chunks).toHaveLength(1);
    expect(assembleBase64Chunks(chunks)).toEqual(bytesOf());
  });

  it('aligns chunk size to a multiple of 3', () => {
    const bytes = new Uint8Array(300);
    // request 100 (not a multiple of 3) -> internal size becomes 99
    const chunks = chunkBytesToBase64(bytes, 100);
    // 300 / 99 -> 4 chunks (99,99,99,3)
    expect(chunks).toHaveLength(4);
    expect(Array.from(assembleBase64Chunks(chunks))).toEqual(Array.from(bytes));
  });
});
