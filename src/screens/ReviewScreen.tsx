// Review Screen - displays review dashboard and sessions

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { MainTabScreenProps } from '../navigation/types';
import type { ReviewStats } from '../services/interfaces';
import type { Grade } from '../types/models';
import { ServiceFactory } from '../services';
import { useAppStore } from '../store/appStore';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import Button from '../components/common/Button';
import { Masthead, MarkerText } from '../components';
import ReviewSession, { type ReviewHighlight } from '../components/ReviewSession';
import GradingButtons from '../components/GradingButtons';

type Props = MainTabScreenProps<'Review'>;
