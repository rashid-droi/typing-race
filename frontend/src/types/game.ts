export interface LeaderboardPlayer {
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
  /** Present on `game.me` when merged with store host flag. */
  is_host?: boolean;
}

export interface TeamRow {
  id: number;
  name: string;
  score: number;
  member_count: number;
  teamwork_score: number;
  consistency_score: number;
  communication_efficiency_score: number;
  rank?: number;
}

export interface RelayState {
  enabled: boolean;
  active_player_by_team: Record<string, string | null>;
}

export interface JoinPeer {
  id: string;
  name: string;
  team_id: number;
}

export interface JoinOkPayload {
  player_id: string;
  room_id: string;
  logical_room_id?: string;
  shard_index?: number;
  text: string;
  /** Server-normalized line count for this room (host can change before / between races). */
  text_line_count?: number;
  team_id: number;
  relay_mode: boolean;
  is_host?: boolean;
  started?: boolean;
  paused?: boolean;
  finished?: boolean;
  peers?: JoinPeer[];
}
