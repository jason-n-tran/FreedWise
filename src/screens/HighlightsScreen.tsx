// HighlightsScreen - View all highlights grouped by book
// Implements Requirements 4.7, 3.10, 3.4

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  SectionList,
} from 'react-native';
import type { MainTabScreenProps } from '../navigation/types';
import type { Book, Highlight } from '../types/models';
import ServiceFactory from '../services/ServiceFactory';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import { Masthead } from '../components';
import HighlightModal from '../components/HighlightModal';

type Props = MainTabScreenProps<'Highlights'>;
