import { normalizeQuads, denormalizeQuads, hashText, buildLocator } from '../pdfLocator';

describe('normalizeQuads / denormalizeQuads', () => {
  const viewport = { width: 800, height: 1000 };

  it('normalizes pixel rects to 0..1', () => {
    const quads = normalizeQuads([{ x: 400, y: 500, width: 80, height: 50 }], viewport);
    expect(quads[0]).toEqual({ x: 0.5, y: 0.5, width: 0.1, height: 0.05 });
  });

  it('round-trips through denormalize at the same viewport', () => {
    const rects = [{ x: 123, y: 456, width: 78, height: 9 }];
    const quads = normalizeQuads(rects, viewport);
    const back = denormalizeQuads(quads, viewport);
    expect(back[0].x).toBeCloseTo(123, 5);
    expect(back[0].y).toBeCloseTo(456, 5);
    expect(back[0].width).toBeCloseTo(78, 5);
    expect(back[0].height).toBeCloseTo(9, 5);
  });

  it('rescales to a different viewport (zoom)', () => {
    const rects = [{ x: 400, y: 500, width: 80, height: 50 }];
    const quads = normalizeQuads(rects, viewport);
    const zoomed = denormalizeQuads(quads, { width: 1600, height: 2000 });
    expect(zoomed[0]).toEqual({ x: 800, y: 1000, width: 160, height: 100 });
  });

  it('clamps out-of-range values to [0,1]', () => {
    const quads = normalizeQuads([{ x: -50, y: 1200, width: 2000, height: 50 }], viewport);
    expect(quads[0].x).toBe(0);
    expect(quads[0].y).toBe(1);
    expect(quads[0].width).toBe(1);
  });

  it('guards against a zero-sized viewport', () => {
    const quads = normalizeQuads([{ x: 10, y: 10, width: 10, height: 10 }], {
      width: 0,
      height: 0,
    });
    // no NaN/Infinity leaks; clamped
    quads[0] && Object.values(quads[0]).forEach(v => expect(Number.isFinite(v)).toBe(true));
  });
});

describe('hashText', () => {
  it('is deterministic', () => {
    expect(hashText('the quick brown fox')).toBe(hashText('the quick brown fox'));
  });

  it('collapses whitespace so reflow does not change the hash', () => {
    expect(hashText('hello   world')).toBe(hashText('hello world'));
    expect(hashText('  hello world  ')).toBe(hashText('hello world'));
    expect(hashText('hello\n\tworld')).toBe(hashText('hello world'));
  });

  it('differs for different text', () => {
    expect(hashText('alpha')).not.toBe(hashText('beta'));
  });

  it('returns an 8-char hex string', () => {
    expect(hashText('anything')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('buildLocator', () => {
  it('assembles a complete locator', () => {
    const locator = buildLocator({
      pageNumber: 3,
      rects: [{ x: 80, y: 100, width: 40, height: 20 }],
      viewport: { width: 800, height: 1000 },
      text: 'selected words',
      startCharOffset: 5,
      endCharOffset: 19,
    });

    expect(locator.pageNumber).toBe(3);
    expect(locator.quads).toEqual([{ x: 0.1, y: 0.1, width: 0.05, height: 0.02 }]);
    expect(locator.textHash).toBe(hashText('selected words'));
    expect(locator.startCharOffset).toBe(5);
    expect(locator.endCharOffset).toBe(19);
  });
});
