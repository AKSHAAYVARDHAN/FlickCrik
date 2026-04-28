import { BallOutcome, BallResult, SelectionValue } from '../types';

export const SELECTION_OPTIONS: SelectionValue[] = [0, 1, 2, 3, 4, 5, 6];
export const MIN_SELECTION = SELECTION_OPTIONS[0];
export const MAX_SELECTION = SELECTION_OPTIONS[SELECTION_OPTIONS.length - 1];

export function isSelectionValue(value: number): value is SelectionValue {
  return Number.isInteger(value) && SELECTION_OPTIONS.includes(value as SelectionValue);
}

export function resolveBallOutcome(
  batterSelection: SelectionValue,
  bowlerSelection: SelectionValue
): BallOutcome {
  if (batterSelection === 0 && bowlerSelection === 0) {
    return 'wicket_dot';
  }

  if (batterSelection !== 0 && batterSelection === bowlerSelection) {
    return 'wicket_match';
  }

  if (batterSelection === 0) {
    return 'dot';
  }

  return 'runs';
}

export function isWicketOutcome(outcome: BallOutcome): boolean {
  return outcome === 'wicket_match' || outcome === 'wicket_dot';
}

export function runsForBall(
  batterSelection: SelectionValue,
  outcome: BallOutcome
): number {
  return outcome === 'runs' ? batterSelection : 0;
}

export function normalizeBallResult<T extends Pick<BallResult, 'batter' | 'bowler'> & Partial<BallResult>>(
  result: T
): T & Pick<BallResult, 'outcome' | 'isOut' | 'runs'> {
  const outcome = resolveBallOutcome(result.batter, result.bowler);
  const isOut = isWicketOutcome(outcome);
  const runs = runsForBall(result.batter, outcome);

  return {
    ...result,
    outcome,
    isOut,
    runs,
  };
}

export function formatSelectionValue(value: SelectionValue): string {
  return value === 0 ? 'DOT' : String(value);
}

export function getBallOutcomeLabel(result: Pick<BallResult, 'outcome' | 'runs'>): string {
  switch (result.outcome) {
    case 'dot':
      return 'Dot Ball';
    case 'wicket_dot':
      return 'OUT! (Both chose Dot)';
    case 'wicket_match':
      return 'Wicket!';
    default:
      return `+${result.runs} ${result.runs === 1 ? 'Run' : 'Runs'}`;
  }
}

export function getBallOutcomeDetail(result: Pick<BallResult, 'outcome' | 'runs'>): string {
  switch (result.outcome) {
    case 'dot':
      return 'No runs added';
    case 'wicket_dot':
      return 'Dot vs Dot triggers the special wicket rule';
    case 'wicket_match':
      return 'Matching non-zero numbers causes a wicket';
    default:
      return `${result.runs} ${result.runs === 1 ? 'run' : 'runs'} scored`;
  }
}
