// FSRSService implementation using ts-fsrs library

import { fsrs, createEmptyCard, Rating, State } from 'ts-fsrs';
import type { Card as TSFSRSCard, Grade as TSFSRSGrade } from 'ts-fsrs';
import type { IFSRSService, SchedulingResult, ReviewStats } from './interfaces';
import type { Grade, FSRSCard, CardState } from '../types/models';
import type { IDatabaseManager } from '../types/database';
import type { HighlightRow } from '../database/rowMapping';

// Map our Grade type to ts-fsrs Rating enum
const gradeToRating: Record<Grade, TSFSRSGrade> = {
  again: Rating.Again as TSFSRSGrade,
  hard: Rating.Hard as TSFSRSGrade,
  good: Rating.Good as TSFSRSGrade,
  easy: Rating.Easy as TSFSRSGrade,
};

// Map ts-fsrs State enum to our CardState type
const stateToCardState: Record<number, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

// Map our CardState to ts-fsrs State enum
const cardStateToState: Record<CardState, number> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
