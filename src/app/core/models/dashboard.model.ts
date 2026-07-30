import { ApiListingSummary, ApiNearbyListing } from './listing-api.model';
import { ChartPoint } from './report.model';

/**
 * Consolidated, chart-ready dashboard payloads — one call per role.
 * GET /api/dashboard/{donor|volunteer|recipient}. Mirrors the backend Dashboard DTOs.
 */

/** A recipient near a donor — `NearbyRecipientResponse`. */
export interface NearbyRecipient {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  capacityMeals: number | null;
  distanceKm: number;
}

/** A volunteer achievement, computed live from stats — `BadgeResponse`. */
export interface Badge {
  code: string;
  name: string;
  earned: boolean;
}

/** A donor's share of a recipient's received meals — `DonorMealShareResponse`. */
export interface DonorMealShare {
  donorId: string;
  donorName: string;
  totalMealsReceived: number;
}

/** GET /api/dashboard/donor (optional ?latitude=&longitude=). */
export interface DonorDashboard {
  totalMealsDonated: number;
  mealsDonatedToday: number;
  totalDonations: number;
  totalCertificates: number;
  mealsDonatedByMonth: ChartPoint[];
  recentActivity: ApiListingSummary[];
  nearbyRecipients: NearbyRecipient[];
}

/** GET /api/dashboard/volunteer (optional ?latitude=&longitude=). */
export interface VolunteerDashboard {
  totalDeliveries: number;
  totalPoints: number;
  leaderboardRank: number | null;
  totalMealsHelped: number;
  deliveriesByMonth: ChartPoint[];
  badges: Badge[];
  openListingsNearby: ApiNearbyListing[];
}

/** GET /api/dashboard/recipient. */
export interface RecipientDashboard {
  totalMealsReceived: number;
  totalDeliveriesReceived: number;
  mealsReceivedToday: number;
  upcomingDeliveries: number;
  storageCapacityMeals: number | null;
  storageUsedPercentToday: number | null;
  mealsReceivedByMonth: ChartPoint[];
  donorDistribution: DonorMealShare[];
  incomingFood: ApiListingSummary[];
}
