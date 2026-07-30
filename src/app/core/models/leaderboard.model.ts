/** Leaderboard row — GET /api/leaderboard (`LeaderboardEntryResponse`). */
export interface LeaderboardEntry {
  volunteerId: string;
  name: string;
  totalPoints: number;
  totalDeliveries: number;
  rank: number;
}
