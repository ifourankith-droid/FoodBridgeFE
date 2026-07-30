import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

/** Address components resolved from coordinates. */
export interface GeoAddress {
  address: string;
  city: string;
  state: string;
  pincode: string;
}

interface NominatimAddress {
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  city_district?: string;
  state?: string;
  postcode?: string;
}

interface NominatimResponse {
  display_name?: string;
  address?: NominatimAddress;
}

/**
 * Reverse-geocodes coordinates → a human address. Uses OpenStreetMap Nominatim
 * (no API key needed) since the Google Maps key here is a placeholder. Swap for
 * `google.maps.Geocoder` (or the backend `/geocode` endpoint once it exists) if
 * a real key becomes available.
 *
 * The HTTP interceptors leave this alone: the absolute URL doesn't start with
 * `environment.apiUrl` (no JWT attached) and the response isn't an `ApiResponse`
 * envelope (passed through untouched).
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);

  reverseGeocode(latitude: number, longitude: number): Observable<GeoAddress> {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    return this.http.get<NominatimResponse>(url).pipe(map((res) => this.toAddress(res)));
  }

  private toAddress(res: NominatimResponse): GeoAddress {
    const a = res.address ?? {};
    const city = a.city || a.town || a.village || a.suburb || a.county || '';
    const street = [a.road || a.neighbourhood, a.suburb || a.city_district]
      .filter(Boolean)
      .join(', ');
    return {
      address: street || res.display_name || '',
      city,
      state: a.state || '',
      pincode: a.postcode || '',
    };
  }
}
