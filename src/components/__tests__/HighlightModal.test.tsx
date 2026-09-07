// HighlightModal component tests

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HighlightModal from '../HighlightModal';

describe('HighlightModal', () => {
  const mockOnSave = jest.fn();
  const mockOnCancel = jest.fn();
  const selectedText = 'This is selected text from the book';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render selected text preview', () => {
    const { getByText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(getByText(selectedText)).toBeTruthy();
  });

  it('should render note input field', () => {
    const { getByPlaceholderText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(getByPlaceholderText('Your thoughts, questions, or connections…')).toBeTruthy();
  });

  it('should render tag input field', () => {
    const { getByPlaceholderText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    expect(getByPlaceholderText('Add tag…')).toBeTruthy();
  });

  it('should add tag when Add button is pressed', () => {
    const { getByPlaceholderText, getByText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const tagInput = getByPlaceholderText('Add tag…');
    fireEvent.changeText(tagInput, 'important');
    fireEvent.press(getByText('ADD'));

    expect(getByText('important')).toBeTruthy();
  });

  it('should remove tag when remove button is pressed', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Add a tag
    const tagInput = getByPlaceholderText('Add tag…');
    fireEvent.changeText(tagInput, 'test-tag');
    fireEvent.press(getByText('ADD'));

    expect(getByText('test-tag')).toBeTruthy();

    // Remove the tag
    const removeButtons = getByText('test-tag').parent?.parent?.findAllByType('Text');
    const removeButton = removeButtons?.find((node: any) => node.props.children === '✕');
    if (removeButton?.parent) {
      fireEvent.press(removeButton.parent);
    }

    expect(queryByText('test-tag')).toBeNull();
  });

  it('should call onSave with correct data when Save button is pressed', () => {
    const { getByPlaceholderText, getByText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Add note
    const noteInput = getByPlaceholderText('Your thoughts, questions, or connections…');
    fireEvent.changeText(noteInput, 'This is my note');

    // Add tag
    const tagInput = getByPlaceholderText('Add tag…');
    fireEvent.changeText(tagInput, 'important');
    fireEvent.press(getByText('ADD'));

    // Save
    fireEvent.press(getByText('SAVE'));

    expect(mockOnSave).toHaveBeenCalledWith({
      note: 'This is my note',
      tags: ['important'],
      color: '#FFE34D', // Default marker ink (yellow)
    });
  });

  it('should call onCancel when Cancel button is pressed', () => {
    const { getByText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.press(getByText('CANCEL'));
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should set maxLength on the note input', () => {
    // Truncation itself is enforced natively by RN's TextInput maxLength, which
    // jsdom/react-test-renderer does not simulate. We assert the prop is wired.
    const { getByPlaceholderText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    const noteInput = getByPlaceholderText('Your thoughts, questions, or connections…');

    expect(noteInput.props.maxLength).toBe(5000);
  });

  it('should allow color selection', () => {
    const { getByTestId, getByText } = render(
      <HighlightModal
        visible={true}
        selectedText={selectedText}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
      />
    );

    // Select the green swatch
    fireEvent.press(getByTestId('color-option-#A8E0B0'));

    // Save and check color
    fireEvent.press(getByText('SAVE'));

    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({
        color: '#A8E0B0',
      })
    );
  });
});
