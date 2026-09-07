// HighlightModal - Modal for creating/editing highlights
// Implements Requirements 3.3, 3.11, 3.12

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { type as typo, space, border, markerInks } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';

interface HighlightModalProps {
  visible: boolean;
  selectedText: string;
  initialNote?: string;
  initialTags?: string[];
  initialColor?: string;
  onSave: (data: { note: string; tags: string[]; color: string }) => void;
  onCancel: () => void;
}

// Available highlight colors — the marker ink palette.
const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: markerInks.yellow },
  { name: 'Green', value: markerInks.green },
  { name: 'Blue', value: markerInks.blue },
  { name: 'Pink', value: markerInks.pink },
  { name: 'Orange', value: markerInks.orange },
];

/**
 * HighlightModal component
 * Displays selected text preview, note input, tag input, and color picker
 */
export default function HighlightModal({
  visible,
  selectedText,
  initialNote = '',
  initialTags = [],
  initialColor = markerInks.yellow,
  onSave,
  onCancel,
}: HighlightModalProps) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [note, setNote] = useState(initialNote);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialTags);
  const [selectedColor, setSelectedColor] = useState(initialColor);

  // Reset state on the closed->open transition only. We intentionally key off
  // `visible` alone: initialTags/initialNote/initialColor are often fresh
  // references each render (e.g. `[]` default, or `.map()` from a parent), so
  // depending on them would re-run this effect every render and loop forever.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setNote(initialNote);
      setTags(initialTags);
      setSelectedColor(initialColor);
      setTagInput('');
    }
    wasVisible.current = visible;
  }, [visible, initialNote, initialTags, initialColor]);

  // Add tag from input
  const handleAddTag = useCallback(() => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  }, [tagInput, tags]);

  // Remove tag
  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      setTags(tags.filter(tag => tag !== tagToRemove));
    },
    [tags]
  );

  // Handle save
  const handleSave = useCallback(() => {
    onSave({
      note: note.trim(),
      tags,
      color: selectedColor,
    });
  }, [note, tags, selectedColor, onSave]);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel} />

        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>NEW HIGHLIGHT</Text>
            <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            {/* Selected Text Preview */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PASSAGE</Text>
              <View style={styles.textPreview}>
                <View
                  style={[styles.textPreviewEdge, { backgroundColor: selectedColor }]}
                  pointerEvents="none"
                />
                <Text style={styles.textPreviewText} numberOfLines={6}>
                  {selectedText}
                </Text>
              </View>
            </View>

            {/* Note Input */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>NOTE</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Your thoughts, questions, or connections…"
                placeholderTextColor={palette.inkFaint}
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={5000}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{note.length} / 5000</Text>
            </View>

            {/* Tag Input */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>TAGS</Text>
              <View style={styles.tagInputContainer}>
                <TextInput
                  style={styles.tagInput}
                  placeholder="Add tag…"
                  placeholderTextColor={palette.inkFaint}
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={handleAddTag}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.addTagButton}
                  onPress={handleAddTag}
                  disabled={!tagInput.trim()}
                >
                  <Text style={styles.addTagButtonText}>ADD</Text>
                </TouchableOpacity>
              </View>

              {/* Tag List */}
              {tags.length > 0 && (
                <View style={styles.tagList}>
                  {tags.map(tag => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveTag(tag)}
                        style={styles.tagRemove}
                      >
                        <Text style={styles.tagRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Color Picker */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MARKER INK</Text>
              <View style={styles.colorPicker}>
                {HIGHLIGHT_COLORS.map(color => (
                  <TouchableOpacity
                    key={color.value}
                    testID={`color-option-${color.value}`}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.value },
                      selectedColor === color.value && styles.colorOptionSelected,
                    ]}
                    onPress={() => setSelectedColor(color.value)}
                    activeOpacity={0.7}
                  >
                    {selectedColor === color.value && <Text style={styles.colorCheckmark}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>SAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(palette => ({
  actions: {
    borderTopColor: palette.line,
    borderTopWidth: border.bold,
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  addTagButton: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
    borderWidth: border.rule,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  addTagButtonText: {
    ...typo.data,
    color: palette.paper,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(23,24,28,0.55)',
  },
  button: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderWidth: border.bold,
    flex: 1,
    paddingVertical: space.lg,
  },
  cancelButton: {
    backgroundColor: palette.paper,
  },
  cancelButtonText: {
    ...typo.data,
    color: palette.ink,
  },
  charCount: {
    ...typo.label,
    color: palette.inkFaint,
    marginTop: space.xs,
    textAlign: 'right',
  },
  closeButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeButtonText: {
    color: palette.ink,
    fontSize: 22,
  },
  colorCheckmark: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: 'bold',
  },
  colorOption: {
    alignItems: 'center',
    borderColor: palette.ink,
    borderWidth: border.hair,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  colorOptionSelected: {
    borderWidth: border.bold,
  },
  colorPicker: {
    flexDirection: 'row',
    gap: space.md,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: palette.line,
    borderBottomWidth: border.bold,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  headerTitle: {
    ...typo.eyebrow,
    color: palette.ink,
    fontSize: 13,
  },
  modal: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderTopWidth: border.bold,
    maxHeight: '90%',
  },
  noteInput: {
    ...typo.note,
    borderColor: palette.line,
    borderWidth: border.rule,
    color: palette.ink,
    maxHeight: 200,
    minHeight: 100,
    padding: space.md,
  },
  saveButton: {
    backgroundColor: palette.pop,
  },
  saveButtonText: {
    ...typo.data,
    color: palette.popText,
  },
  section: {
    marginBottom: space.xl,
  },
  sectionLabel: {
    ...typo.eyebrow,
    color: palette.inkSoft,
    marginBottom: space.sm,
  },
  tag: {
    alignItems: 'center',
    borderColor: palette.line,
    borderWidth: border.hair,
    flexDirection: 'row',
    gap: space.xs,
    paddingLeft: space.md,
    paddingRight: space.sm,
    paddingVertical: space.xs,
  },
  tagInput: {
    ...typo.body,
    borderColor: palette.line,
    borderWidth: border.rule,
    color: palette.ink,
    flex: 1,
    padding: space.md,
  },
  tagInputContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  tagRemove: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  tagRemoveText: {
    color: palette.inkSoft,
    fontSize: 14,
  },
  tagText: {
    ...typo.label,
    color: palette.ink,
  },
  textPreview: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: border.rule,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  textPreviewEdge: {
    width: 8,
  },
  textPreviewText: {
    ...typo.quote,
    color: palette.ink,
    flex: 1,
    padding: space.md,
  },
}));
