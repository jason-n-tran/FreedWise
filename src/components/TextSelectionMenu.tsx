// TextSelectionMenu - Shows menu on text selection with "Highlight" button
// Implements Requirement 3.3

import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';

interface TextSelectionMenuProps {
  visible: boolean;
  onHighlight: () => void;
  onDismiss: () => void;
}

/**
 * TextSelectionMenu component
 *
 * Anchored at a FIXED position (bottom-center of the screen) rather than at the
 * selection coordinates. The selection rect comes from inside the WebView in its
 * own coordinate space, which doesn't map reliably to React Native screen space,
 * so placing the menu "near the selection" landed it in random spots. A stable
 * bottom-center action bar is predictable and always reachable.
 */
export default function TextSelectionMenu({
  visible,
  onHighlight,
  onDismiss,
}: TextSelectionMenuProps) {
  const styles = useStyles();
  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onDismiss}>
      {/* Backdrop to dismiss menu */}
      <TouchableOpacity
        testID="selection-menu-backdrop"
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}
      >
        {/* Fixed bottom-center action */}
        <View style={styles.menu}>
          <TouchableOpacity style={styles.menuButton} onPress={onHighlight} activeOpacity={0.85}>
            <View style={styles.swipe} pointerEvents="none" />
            <Text style={styles.menuButtonText}>HIGHLIGHT</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const useStyles = makeStyles(palette => ({
  backdrop: {
    backgroundColor: 'transparent',
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
    borderWidth: border.bold,
    marginBottom: 48,
  },
  menuButton: {
    overflow: 'hidden',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    position: 'relative',
  },
  menuButtonText: {
    ...typo.data,
    color: palette.paper,
    textAlign: 'center',
  },
  swipe: {
    backgroundColor: palette.marker,
    bottom: 6,
    height: 8,
    left: 4,
    position: 'absolute',
    right: 4,
    transform: [{ skewX: '-9deg' }],
  },
}));
