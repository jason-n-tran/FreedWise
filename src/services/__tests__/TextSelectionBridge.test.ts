// Unit tests for TextSelectionBridge
// Validates Requirements 3.1, 3.2

import { TextSelectionBridge } from '../TextSelectionBridge';
import type { SelectionData } from '../interfaces';

describe('TextSelectionBridge', () => {
  let bridge: TextSelectionBridge;

  beforeEach(() => {
    bridge = new TextSelectionBridge();
  });

  describe('PDF Selection', () => {
    it('should capture PDF selection with page number', async () => {
      // Arrange
      const expectedText = 'Selected PDF text';
      const expectedPageNumber = 5;
      const expectedBoundingRect = { x: 10, y: 20, width: 100, height: 50 };

      // Act
      bridge.setPDFSelection(expectedText, expectedPageNumber, expectedBoundingRect);
      const result = await bridge.captureSelection('pdf');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.text).toBe(expectedText);
      expect(result?.position.pageNumber).toBe(expectedPageNumber);
      expect(result?.position.cfi).toBeUndefined();
      expect(result?.boundingRect).toEqual(expectedBoundingRect);
    });

    it('should return null when no PDF selection exists', async () => {
      // Act
      const result = await bridge.captureSelection('pdf');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('EPUB Selection', () => {
    it('should capture EPUB selection with CFI', async () => {
      // Arrange
      const expectedText = 'Selected EPUB text';
      const expectedCFI = 'epubcfi(/6/4[chap01ref]!/4/2/2[para01]/1:0)';
      const expectedBoundingRect = { x: 15, y: 25, width: 120, height: 60 };

      // Act
      bridge.setEPUBSelection(expectedText, expectedCFI, expectedBoundingRect);
      const result = await bridge.captureSelection('epub');

      // Assert
      expect(result).not.toBeNull();
      expect(result?.text).toBe(expectedText);
      expect(result?.position.cfi).toBe(expectedCFI);
      expect(result?.position.pageNumber).toBeUndefined();
      expect(result?.boundingRect).toEqual(expectedBoundingRect);
    });

    it('should return null when no EPUB selection exists', async () => {
      // Act
      const result = await bridge.captureSelection('epub');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Selection Management', () => {
    it('should clear selection', async () => {
      // Arrange
      bridge.setPDFSelection('Test text', 1, { x: 0, y: 0, width: 10, height: 10 });

      // Act
      bridge.clearSelection();
      const result = await bridge.captureSelection('pdf');

      // Assert
      expect(result).toBeNull();
    });

    it('should overwrite previous selection', async () => {
      // Arrange
      bridge.setPDFSelection('First selection', 1, { x: 0, y: 0, width: 10, height: 10 });
      bridge.setPDFSelection('Second selection', 2, { x: 5, y: 5, width: 20, height: 20 });

      // Act
      const result = await bridge.captureSelection('pdf');

      // Assert
      expect(result?.text).toBe('Second selection');
      expect(result?.position.pageNumber).toBe(2);
    });

    it('should carry an optional PDF locator on the selection', async () => {
      const locator = {
        pageNumber: 4,
        quads: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
        textHash: 'deadbeef',
      };
      bridge.setPDFSelection('Located text', 4, { x: 1, y: 2, width: 3, height: 4 }, locator);

      const result = await bridge.captureSelection('pdf');
      expect(result?.position.locator).toEqual(locator);
    });
  });

  describe('Position Data Normalization', () => {
    it('should normalize PDF position with pageNumber only', async () => {
      // Arrange
      bridge.setPDFSelection('Text', 10, { x: 0, y: 0, width: 10, height: 10 });

      // Act
      const result = await bridge.captureSelection('pdf');

      // Assert
      expect(result?.position).toHaveProperty('pageNumber');
      expect(result?.position).not.toHaveProperty('cfi');
    });

    it('should normalize EPUB position with CFI only', async () => {
      // Arrange
      bridge.setEPUBSelection('Text', 'epubcfi(/6/4)', { x: 0, y: 0, width: 10, height: 10 });

      // Act
      const result = await bridge.captureSelection('epub');

      // Assert
      expect(result?.position).toHaveProperty('cfi');
      expect(result?.position).not.toHaveProperty('pageNumber');
    });
  });
});
