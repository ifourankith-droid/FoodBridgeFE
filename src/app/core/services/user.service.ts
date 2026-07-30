import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_ENDPOINTS } from '../config/api-endpoints';
import { ApiService } from '../http/api.service';
import { UpdateProfileBody, UserProfile } from '../models/user.model';

/** Result of POST /users/{id}/avatar. */
export interface AvatarUploadResult {
  avatarUrl: string;
}

/**
 * User / Profile endpoints (Phase 3): GET/PUT profile, availability toggle,
 * avatar upload. All require an authenticated JWT (attached by the interceptor).
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly api = inject(ApiService);

  getProfile(id: string): Observable<UserProfile> {
    return this.api.get<UserProfile>(API_ENDPOINTS.users.byId(id));
  }

  updateProfile(id: string, body: UpdateProfileBody): Observable<UserProfile> {
    return this.api.put<UserProfile>(API_ENDPOINTS.users.byId(id), body);
  }

  /** Toggle availability — volunteers & recipients only. */
  setAvailability(id: string, isAvailable: boolean): Observable<UserProfile> {
    return this.api.patch<UserProfile>(API_ENDPOINTS.users.availability(id), { isAvailable });
  }

  /** Upload a profile photo (multipart, JPG/PNG, max 2MB). */
  uploadAvatar(id: string, file: File): Observable<AvatarUploadResult> {
    const form = new FormData();
    form.append('file', file);
    return this.api.post<AvatarUploadResult>(API_ENDPOINTS.users.avatar(id), form);
  }
}
