import type { EffortLevel } from '../schemas/enums';

export const MOMENTUM_POINTS: Record<EffortLevel, number> = {
  baseline: 1,
  normal: 3,
  stretch: 5,
} as const;

export const MOMENTUM_TIERS = [
  { threshold: 0, label: 'Getting Started' },
  { threshold: 20, label: 'Warming Up' },
  { threshold: 40, label: 'In Motion' },
  { threshold: 60, label: 'Momentum' },
  { threshold: 80, label: 'Locked In' },
  { threshold: 100, label: 'Unstoppable' },
] as const;

export const STREAK_MILESTONES = [
  { days: 7, label: 'You Showed Up', line: 'Consistency is building.' },
  {
    days: 14,
    label: "You're Consistent",
    line: 'Keep showing up - it compounds.',
  },
  {
    days: 30,
    label: 'This Is Who You Are',
    line: 'Identity forms from repetition.',
  },
  { days: 60, label: "You're Locked In", line: 'Stability you can trust.' },
  {
    days: 100,
    label: 'Unstoppable',
    line: 'Mastery is rare - you earned this.',
  },
] as const;
