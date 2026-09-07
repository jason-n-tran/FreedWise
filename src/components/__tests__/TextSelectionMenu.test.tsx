// TextSelectionMenu component tests

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TextSelectionMenu from '../TextSelectionMenu';

describe('TextSelectionMenu', () => {
  const mockOnHighlight = jest.fn();
  const mockOnDismiss = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not render when visible is false', () => {
    const { queryByText } = render(
      <TextSelectionMenu visible={false} onHighlight={mockOnHighlight} onDismiss={mockOnDismiss} />
    );

    expect(queryByText('HIGHLIGHT')).toBeNull();
  });

  it('should render when visible is true', () => {
    const { getByText } = render(
      <TextSelectionMenu visible={true} onHighlight={mockOnHighlight} onDismiss={mockOnDismiss} />
    );

    expect(getByText('HIGHLIGHT')).toBeTruthy();
  });

  it('should call onHighlight when highlight button is pressed', () => {
    const { getByText } = render(
      <TextSelectionMenu visible={true} onHighlight={mockOnHighlight} onDismiss={mockOnDismiss} />
    );

    fireEvent.press(getByText('HIGHLIGHT'));
    expect(mockOnHighlight).toHaveBeenCalledTimes(1);
  });

  it('should call onDismiss when backdrop is pressed', () => {
    const { getByTestId } = render(
      <TextSelectionMenu visible={true} onHighlight={mockOnHighlight} onDismiss={mockOnDismiss} />
    );

    fireEvent.press(getByTestId('selection-menu-backdrop'));

    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });
});
