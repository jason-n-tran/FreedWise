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

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleRestart = (): void => {
    if (__DEV__) {
      // In development, a full reload is often better to recover from HMR or
      // bundle-loading issues that caused the crash.
      DevSettings.reload();
    } else {
      // In production, just try to clear the error state and re-render.
      this.setState({ hasError: false, error: null });
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Surface the first few frames of the component stack so the failing
      // component is identifiable from a screenshot. componentStack lines look
      // like "    in SomeComponent (at File.tsx:42)".
      const topFrames = (this.state.componentStack ?? '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join('\n');

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.message}>
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </Text>
            {topFrames ? <Text style={styles.stack}>{topFrames}</Text> : null}
          </ScrollView>
          <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
            <Text style={styles.buttonText}>RESTART APP</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
    borderWidth: 2,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  buttonText: {
    color: palette.marker,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  container: {
    alignItems: 'center',
    backgroundColor: palette.paper,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    color: palette.inkSoft,
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
    flexGrow: 0,
    marginBottom: 24,
    maxHeight: 260,
  },
  scrollContent: {
    paddingHorizontal: 8,
  },
  stack: {
    color: palette.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  title: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
});

export default ErrorBoundary;
