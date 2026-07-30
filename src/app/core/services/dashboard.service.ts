import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '@core/config/api-endpoints';
import { ApiService, QueryParams } from '@core/http/api.service';
import { DonorDashboard, RecipientDashboard, VolunteerDashboard } from '@core/models/dashboard.model';

/**
 * One consolidated, chart-ready dashboard call per role — replaces stitching together
 * reports/leaderboard/listings on the client. `latitude`/`longitude` are optional on the
 * donor/volunteer calls; omit them to use the caller's own registered profile location for
 * the "nearby" sections, or pass live GPS coordinates to search from where they are now.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  donor(latitude?: number, longitude?: number): Observable<DonorDashboard> {
    return this.api.get<DonorDashboard>(API_ENDPOINTS.dashboard.donor, this.coords(latitude, longitude));
  }

  volunteer(latitude?: number, longitude?: number): Observable<VolunteerDashboard> {
    return this.api.get<VolunteerDashboard>(API_ENDPOINTS.dashboard.volunteer, this.coords(latitude, longitude));
  }

  recipient(): Observable<RecipientDashboard> {
    return this.api.get<RecipientDashboard>(API_ENDPOINTS.dashboard.recipient);
  }

  private coords(latitude?: number, longitude?: number): QueryParams | undefined {
    if (latitude == null || longitude == null) {
      return undefined;
    }
    return { latitude, longitude };
  }
}
