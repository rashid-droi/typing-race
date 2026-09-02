export type LeaderboardPlayer = {
  id: string;
  name: string;
  team_id: number;
  team_rank: number;
  relay_active: boolean;
  wpm: number;
  accuracy: number;
  progress: number;
  typed_chars: number;
  keystrokes: number;
  errors: number;
  rank: number;
  is_host?: boolean;
};

export type TeamRow = {
  id: number;
  name: string;
  score: number;
  member_count: number;
  teamwork_score?: number;
  consistency_score?: number;
  communication_efficiency_score?: number;
  rank?: number;
};

export const TEXT_LINE_COUNT_OPTIONS = [1, 2, 5, 8] as const;
