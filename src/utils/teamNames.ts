import type { Room, TeamId, TeamNames } from '../types';

export const DEFAULT_TEAM_NAMES: TeamNames = {
  A: 'Team A',
  B: 'Team B',
};

export function getTeamName(source: Pick<Room, 'teamNames'> | TeamNames, team: TeamId): string {
  const teamNames = 'teamNames' in source ? source.teamNames : source;
  return teamNames?.[team] || DEFAULT_TEAM_NAMES[team];
}

export function sanitizeTeamName(name: string, team: TeamId): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 24);
  return cleaned || DEFAULT_TEAM_NAMES[team];
}
