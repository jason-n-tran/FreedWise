// ReviewSession component — displays highlights one-by-one for spaced repetition review
// Requirements: 5.2, 5.3, 5.12, 5.14

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Grade } from '../types/models';
import type { Highlight } from '../types/models';
import { type as typo, space, border } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { makeStyles } from '../theme/makeStyles';
import Button from './common/Button';

export interface ReviewHighlight extends Highlight {
  bookTitle: string;
}

interface ReviewSessionProps {
  highlights: ReviewHighlight[];
  onComplete: () => void;
  onGrade: (highlightId: string, grade: Grade) => Promise<void>;
  renderGradingButtons?: (highlightId: string, onGrade: (grade: Grade) => void) => React.ReactNode;
}

export default function ReviewSession({
  highlights,
  onComplete,
  onGrade,
  renderGradingButtons,
}: ReviewSessionProps) {
  const styles = useStyles();
  const { palette } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setAnswerRevealed(false);
  }, [currentIndex]);

  const total = highlights.length;

  // Session complete screen
  if (currentIndex >= total) {
    return (
      <View style={styles.centered}>
        <Text style={styles.completeMark}>✓</Text>
        <Text style={styles.completeTitle}>Session complete</Text>
        <Text style={styles.completeSubtitle}>
          {total} {total === 1 ? 'card' : 'cards'} reviewed
        </Text>
        <Button title="DONE" onPress={onComplete} style={styles.doneButton} />
      </View>
    );
  }

  const highlight = highlights[currentIndex];
  const chapterTitle = highlight.position?.chapterTitle;
  const pageNumber = highlight.position?.pageNumber;

  const handleGrade = async (grade: Grade) => {
    await onGrade(highlight.id, grade);
    setCurrentIndex(i => i + 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Progress indicator — segmented ticks, mono counter */}
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          {String(currentIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(currentIndex / total) * 100}%` }]} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Book / chapter context */}
        <View style={styles.contextRow}>
          <Text style={styles.bookTitle} numberOfLines={1}>
            {highlight.bookTitle.toUpperCase()}
          </Text>
          {(chapterTitle || pageNumber != null) && (
            <Text style={styles.chapterTitle} numberOfLines={1}>
              {chapterTitle ?? `PAGE ${pageNumber}`}
            </Text>
          )}
        </View>

        {/* The book's voice: quoted passage in serif, framed by the marker ink. */}
        <View style={styles.quoteCard}>
          <View
            style={[styles.markerEdge, { backgroundColor: highlight.color || palette.marker }]}
          />
          <View style={styles.quoteBody}>
            {highlight.isFlashcard && !answerRevealed ? (
              <Text style={styles.flashcardQuestion}>
                {highlight.flashcardQuestion ?? 'What do you recall about this?'}
              </Text>
            ) : (
              <>
                <Text style={styles.quoteText}>{highlight.text}</Text>
                {highlight.note ? <Text style={styles.noteText}>{highlight.note}</Text> : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Grading area */}
      <View style={[styles.gradingArea, { paddingBottom: Math.max(insets.bottom, space.lg) }]}>
        {
          highlight.isFlashcard && !answerRevealed ? (
            <Button title="SHOW ANSWER" onPress={() => setAnswerRevealed(true)} />
          ) : renderGradingButtons ? (
            renderGradingButtons(highlight.id, handleGrade)
          ) : null /* grading buttons go here */
        }
      </View>
    </View>
  );
}
