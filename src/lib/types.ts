export type RoomStatus = "lobby" | "playing" | "finished" | "expired";
export type RoundStatus = "voting" | "revealed";

export type Profile = {
  id: string;
  username: string;
  avatar: string | null;
};

export type RoomSettings = {
  max_players?: number;
  total_rounds?: number;
  include_uncomfortable?: boolean;
};

export type Room = {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  settings: RoomSettings;
  created_at: string;
  last_activity_at: string;
};

export type Member = {
  user_id: string;
  is_ready: boolean;
  joined_at: string;
  profiles: { username: string; avatar: string | null } | null;
};

export type Question = {
  id: string;
  content: string;
  category: string;
  is_active: boolean;
  room_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type Round = {
  id: string;
  room_id: string;
  question_id: string;
  round_number: number;
  status: RoundStatus;
  started_at: string;
  revealed_at: string | null;
  questions: { content: string; category: string } | null;
};

export type RoundPlayer = {
  round_id: string;
  user_id: string;
  has_voted: boolean;
  profiles: { username: string; avatar: string | null } | null;
};

export type Answer = {
  round_id: string;
  voter_id: string;
  selected_name: string;
};

export type Snapshot = {
  room: Room;
  members: Member[];
  questions: Question[];
  rounds: Round[];
  roundPlayers: RoundPlayer[];
  answers: Answer[];
};
