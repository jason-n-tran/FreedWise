import { ExtractionService } from '../ExtractionService';
import type { ExtractionResult } from '../interfaces';

describe('ExtractionService', () => {
  it('is not ready until an extractor is registered', () => {
    const service = new ExtractionService();
    expect(service.isReady()).toBe(false);
    service.setExtractor(async () => ({}));
    expect(service.isReady()).toBe(true);
  });

  it('delegates to the registered extractor', async () => {
    const service = new ExtractionService();
    const result: ExtractionResult = {
      title: 'Real Title',
      author: 'Real Author',
      pageCount: 42,
      coverPngBase64: 'AAAA',
    };
    const extractor = jest.fn().mockResolvedValue(result);
    service.setExtractor(extractor);

    const out = await service.extract('file:///book.pdf', 'pdf');

    expect(extractor).toHaveBeenCalledWith('file:///book.pdf', 'pdf');
    expect(out).toEqual(result);
  });

  it('returns {} (not throwing) when the extractor fails', async () => {
    const service = new ExtractionService();
    service.setExtractor(async () => {
      throw new Error('boom');
    });
    const out = await service.extract('file:///book.epub', 'epub');
    expect(out).toEqual({});
  });

  it('returns {} when no extractor registers within the timeout', async () => {
    jest.useFakeTimers();
    const service = new ExtractionService();
    const promise = service.extract('file:///book.pdf', 'pdf');
    // advance past the ready timeout
    await jest.advanceTimersByTimeAsync(9000);
    const out = await promise;
    expect(out).toEqual({});
    jest.useRealTimers();
  });

  it('resolves once an extractor registers shortly after the request', async () => {
    jest.useFakeTimers();
    const service = new ExtractionService();
    const promise = service.extract('file:///book.pdf', 'pdf');

    // Register an extractor after a short delay (before the 8s timeout).
    setTimeout(() => {
      service.setExtractor(async () => ({ title: 'Late' }));
    }, 300);

    await jest.advanceTimersByTimeAsync(500);
    const out = await promise;
    expect(out).toEqual({ title: 'Late' });
    jest.useRealTimers();
  });
});
