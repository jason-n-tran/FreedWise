// LibraryScreen unit tests

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import LibraryScreen from '../LibraryScreen';
import ServiceFactory from '../../services/ServiceFactory';
import type { IBookService } from '../../services/interfaces';
import type { Book } from '../../types/models';
import * as DocumentPicker from 'expo-document-picker';

// Mock expo-document-picker
jest.mock('expo-document-picker');

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as any;

describe('LibraryScreen', () => {
  let mockBookService: jest.Mocked<IBookService>;
  let mockBooks: Book[];

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock books
    mockBooks = [
      {
        id: '1',
        title: 'Test Book 1',
        author: 'Author 1',
        filePath: '/path/1.pdf',
        fileType: 'pdf',
        totalPages: 100,
        currentPage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        title: 'Test Book 2',
        author: 'Author 2',
        filePath: '/path/2.epub',
        fileType: 'epub',
        coverImagePath: '/path/cover.jpg',
        totalPages: 200,
        currentPage: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Create mock book service
    mockBookService = {
      importBook: jest.fn(),
      getBooks: jest.fn().mockResolvedValue(mockBooks),
      getBookById: jest.fn(),
      deleteBook: jest.fn().mockResolvedValue(undefined),
      updateBook: jest.fn().mockResolvedValue(undefined),
      checkBookFileExists: jest.fn().mockResolvedValue(true),
      updateReadingProgress: jest.fn(),
      getReadingProgress: jest.fn(),
    } as jest.Mocked<IBookService>;

    // Register mock service
    ServiceFactory.getInstance().register('BookService', mockBookService);
  });

  afterEach(() => {
    ServiceFactory.getInstance().clear();
  });

  describe('Rendering', () => {
    it('should render loading state initially', () => {
      const { getByTestId } = render(
        <LibraryScreen navigation={mockNavigation} route={{} as any} />
      );

      // Note: ActivityIndicator doesn't have testID by default
      // We're just checking it doesn't crash
      expect(mockBookService.getBooks).toHaveBeenCalled();
    });

    it('should render book grid after loading', async () => {
      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('Test Book 1')).toBeTruthy();
        expect(getByText('Test Book 2')).toBeTruthy();
        expect(getByText('Author 1')).toBeTruthy();
        expect(getByText('Author 2')).toBeTruthy();
      });
    });

    it('should render empty state when no books', async () => {
      mockBookService.getBooks.mockResolvedValue([]);

      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('Empty shelf')).toBeTruthy();
        expect(
          getByText(
            'Import a PDF or EPUB to start a library. Highlights you make become review cards.'
          )
        ).toBeTruthy();
      });
    });

    it('should render import button', async () => {
      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('+ IMPORT')).toBeTruthy();
      });
    });
  });

  describe('Book Import', () => {
    it('should import book when file is selected', async () => {
      const mockBook: Book = {
        id: '3',
        title: 'New Book',
        author: 'New Author',
        filePath: '/path/3.pdf',
        fileType: 'pdf',
        totalPages: 150,
        currentPage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///storage/newbook.pdf' }],
      });

      mockBookService.importBook.mockResolvedValue(mockBook);

      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('+ IMPORT')).toBeTruthy();
      });

      const importButton = getByText('+ IMPORT');
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
          type: ['application/pdf', 'application/epub+zip'],
          copyToCacheDirectory: true,
        });
        expect(mockBookService.importBook).toHaveBeenCalledWith('file:///storage/newbook.pdf');
        expect(mockNavigate).toHaveBeenCalledWith('Reader', { bookId: '3' });
      });
    });

    it('should not import when user cancels picker', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: true,
      });

      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('+ IMPORT')).toBeTruthy();
      });

      const importButton = getByText('+ IMPORT');
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled();
        expect(mockBookService.importBook).not.toHaveBeenCalled();
      });
    });

    it('should handle import errors', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///storage/invalid.txt' }],
      });

      mockBookService.importBook.mockRejectedValue(new Error('Unsupported file type'));

      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('+ IMPORT')).toBeTruthy();
      });

      const importButton = getByText('+ IMPORT');
      fireEvent.press(importButton);

      await waitFor(() => {
        expect(mockBookService.importBook).toHaveBeenCalled();
        // Alert would be shown but we can't easily test it
      });
    });
  });

  describe('Book Deletion', () => {
    it('should delete book after confirmation', async () => {
      // Mock Alert.alert to auto-confirm
      jest.spyOn(require('react-native').Alert, 'alert').mockImplementation((...args: any[]) => {
        const buttons = args[2];
        // Simulate pressing the delete button
        if (buttons && buttons.length > 1) {
          buttons[1].onPress?.();
        }
      });

      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('Test Book 1')).toBeTruthy();
      });

      // Long press to trigger delete
      const bookCard = getByText('Test Book 1').parent?.parent;
      if (bookCard) {
        fireEvent(bookCard, 'longPress');
      }

      await waitFor(() => {
        expect(mockBookService.deleteBook).toHaveBeenCalledWith('1');
      });
    });
  });

  describe('Book Navigation', () => {
    it('should navigate to reader when book is pressed', async () => {
      const { getByText } = render(<LibraryScreen navigation={mockNavigation} route={{} as any} />);

      await waitFor(() => {
        expect(getByText('Test Book 1')).toBeTruthy();
      });

      const bookCard = getByText('Test Book 1').parent?.parent;
      if (bookCard) {
        fireEvent.press(bookCard);
      }

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('Reader', { bookId: '1' });
      });
    });
  });

  describe('Pull to Refresh', () => {
    it('should refresh books when pulled', async () => {
      const { getByTestId, UNSAFE_getByType } = render(
        <LibraryScreen navigation={mockNavigation} route={{} as any} />
      );

      await waitFor(() => {
        expect(mockBookService.getBooks).toHaveBeenCalledTimes(1);
      });

      // Find FlatList and trigger refresh
      const flatList = UNSAFE_getByType(require('react-native').FlatList);
      const refreshControl = flatList.props.refreshControl;

      // Trigger refresh
      refreshControl.props.onRefresh();

      await waitFor(() => {
        expect(mockBookService.getBooks).toHaveBeenCalledTimes(2);
      });
    });
  });
});
