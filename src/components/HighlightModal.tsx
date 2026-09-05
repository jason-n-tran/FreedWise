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
