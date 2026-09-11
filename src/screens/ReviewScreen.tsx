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

export default function ReviewScreen({ navigation }: Props) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [dueHighlights, setDueHighlights] = useState<ReviewHighlight[]>([]);
  const [gradingInProgress, setGradingInProgress] = useState(false);

  const setReviewSessionActive = useAppStore(s => s.setReviewSessionActive);
  const setDueCount = useAppStore(s => s.setDueCount);

  const loadStats = useCallback(async () => {
    try {
      setError(null);
      const fsrsService = ServiceFactory.getInstance().getFSRSService();
      const result = await fsrsService.getReviewStats();
      setStats(result);
      setDueCount(result.dueToday);
    } catch (err) {
      setError('Failed to load review stats');
    }
  }, [setDueCount]);

  useFocusEffect(
    useCallback(() => {
      loadStats().finally(() => setLoading(false));
    }, [loadStats])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const handleStartReview = async () => {
    try {
      const highlightService = ServiceFactory.getInstance().getHighlightService();
      const bookService = ServiceFactory.getInstance().getBookService();
      const fsrsService = ServiceFactory.getInstance().getFSRSService();

      // Preload next cards into memory cache for fast grading (Req 11.4)
      await fsrsService.preloadNextCards();

      const highlights = await highlightService.getDueHighlights();

      // Enrich highlights with book title
      const enriched: ReviewHighlight[] = await Promise.all(
        highlights.map(async h => {
          const book = await bookService.getBookById(h.bookId);
          return { ...h, bookTitle: book?.title ?? 'Unknown Book' };
        })
      );

      setDueHighlights(enriched);
      setIsReviewing(true);
      setReviewSessionActive(true);
    } catch {
      setError('Failed to load highlights for review');
    }
  };

  const handleGrade = async (highlightId: string, grade: Grade) => {
    setGradingInProgress(true);
    try {
      const fsrsService = ServiceFactory.getInstance().getFSRSService();
      const result = await fsrsService.gradeCard(highlightId, grade);
      // The grade persisted; fallback scheduling is a soft warning, not an error.
      if (result.usedFallback) {
        setError('Review saved, but with simplified scheduling due to a calculation issue.');
      }
    } catch (err) {
      console.error('[ReviewScreen] gradeCard failed:', err);
      setError('Failed to save grade — your progress may not be saved.');
    } finally {
      setGradingInProgress(false);
    }
  };

  const handleSessionComplete = async () => {
    // Clear in-memory FSRS cache when session ends (Req 11.4)
    ServiceFactory.getInstance().getFSRSService().clearCache();
    setIsReviewing(false);
    setReviewSessionActive(false);
    setDueHighlights([]);
    setLoading(true);
    await loadStats();
    setLoading(false);
  };

  if (isReviewing) {
    return (
      <ReviewSession
        highlights={dueHighlights}
        onComplete={handleSessionComplete}
        onGrade={handleGrade}
        renderGradingButtons={(highlightId, onGrade) => (
          <GradingButtons onGrade={onGrade} disabled={gradingInProgress} />
        )}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.ink} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorEyebrow}>ERROR</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Button
          title="RETRY"
          variant="secondary"
          onPress={() => {
            setLoading(true);
            loadStats().finally(() => setLoading(false));
          }}
          style={styles.retryButton}
        />
      </View>
    );
  }

  const dueToday = stats?.dueToday ?? 0;
  const retentionPct =
    stats && stats.averageRetention > 0 ? `${Math.round(stats.averageRetention * 100)}%` : '—';

  return (
    <View style={styles.container}>
      <Masthead
        readout={stats ? [`${stats.totalCards} CARDS`, `${retentionPct} RECALL`] : ['—']}
        title="Review"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />
        }
      >
        {stats && (
          <>
            {/* Hero: the due count carries the marker swipe. */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>DUE TODAY</Text>
              <MarkerText
                color={dueToday > 0 ? palette.marker : palette.lineSoft}
                textStyle={styles.heroNumber}
                bleed={10}
                band={0.5}
              >
                {String(dueToday)}
              </MarkerText>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>BREAKDOWN</Text>
              <View style={styles.row}>
                <StatItem label="NEW" value={stats.newCards} />
                <View style={styles.vline} />
                <StatItem label="LEARN" value={stats.learningCards} />
                <View style={styles.vline} />
                <StatItem label="REVIEW" value={stats.reviewCards} />
              </View>
            </View>

            <View style={styles.actionArea}>
              {dueToday > 0 ? (
                <Button title={`START REVIEW · ${dueToday}`} onPress={handleStartReview} />
              ) : (
                <View style={styles.cleanState}>
                  <Text style={styles.cleanMark}>✓</Text>
                  <Text style={styles.noDueText}>Nothing due. The deck is clear.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
