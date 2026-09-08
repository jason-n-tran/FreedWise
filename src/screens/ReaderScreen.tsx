// ReaderScreen - Main entry point for reading books
// Detects file type and routes to appropriate renderer
// Implements Requirements 3.1, 3.2, 3.3, 3.4, 3.10

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert, PanResponder, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackScreenProps } from '../navigation/types';
import type { Book, Highlight } from '../types/models';
import ServiceFactory from '../services/ServiceFactory';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import PDFReader from './PDFReader';
import EPUBReader from './EPUBReader';
import { TextSelectionMenu, HighlightModal } from '../components';
import type { SelectionData } from '../services/interfaces';

type Props = RootStackScreenProps<'Reader'>;
