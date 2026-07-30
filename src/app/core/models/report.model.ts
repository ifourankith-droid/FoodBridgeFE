/** Chart series point shared by every report — `{ period: "yyyy-MM", value }`. */
export interface ChartPoint {
  period: string;
  value: number;
}

/** GET /api/reports/donor */
export interface DonorReport {
  totalListings: number;
  totalMealsDonated: number;
  totalCertificates: number;
  mealsDonatedByMonth: ChartPoint[];
}

/** GET /api/reports/volunteer */
export interface VolunteerReport {
  totalDeliveries: number;
  totalPoints: number;
  deliveriesByMonth: ChartPoint[];
}

/** GET /api/reports/recipient */
export interface RecipientReport {
  totalMealsReceived: number;
  totalDeliveriesReceived: number;
  mealsReceivedByMonth: ChartPoint[];
}

/** GET /api/reports/platform (admin) — `PlatformReportResponse`. */
export interface PlatformReport {
  totalMealsDonated: number;
  totalDeliveries: number;
  totalCertificates: number;
  totalUsers: number;
  mealsDonatedByMonth: ChartPoint[];
}
