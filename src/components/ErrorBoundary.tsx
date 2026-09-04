import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, DevSettings, ScrollView } from 'react-native';
// ErrorBoundary is a class (no hooks) and renders when the app is broken, so it
// intentionally uses the static light palette rather than the runtime theme.
import { palette } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}
