import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { DonorAddressBody } from '@core/models/donor-address.model';
import { AuthService } from './auth.service';
import { DonorAddressService } from './donor-address.service';
import { StorageService } from './storage.service';
import { UserService } from './user.service';

export interface PickupAddress {
  id: string;
  /** Short name for the location, e.g. "Main Branch". */
  label: string;
  /** Full postal address text used as the listing's pickup address. */
  address: string;
  /** Postal parts, all optional — display-only; distance always comes from the coordinates. */
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude: number;
  longitude: number;
  isDefault?: boolean;
}

/**
 * Everything needed to save an address, as one object rather than a positional list — the postal
 * parts are all optional and a run of same-typed arguments is exactly how `city` and `pincode` got
 * silently dropped here before.
 */
export interface PickupAddressDraft {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

const KEY = 'foodbridge.pickupAddresses';
const SEL_KEY = 'foodbridge.pickupAddressId';

/**
 * A donor's saved pickup addresses — shown in the topbar dropdown, managed on the
 * Profile page, used by Create Listing. Backed by the `/api/donor-addresses` CRUD
 * endpoints when available; if those 404 / error, it transparently falls back to a
 * localStorage store (seeded from the profile address) so the flow keeps working.
 */
@Injectable({ providedIn: 'root' })
export class PickupAddressService {
  private readonly storage = inject(StorageService);
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly donorApi = inject(DonorAddressService);

  readonly addresses = signal<PickupAddress[]>([]);
  readonly loading = signal(false);
  /** True while the server CRUD endpoints respond; false → localStorage fallback. */
  readonly serverBacked = signal(true);
  private readonly localSelectedId = signal<string | null>(this.storage.getItem<string>(SEL_KEY));
  private loaded = false;

  readonly selected = computed<PickupAddress | null>(() => {
    const list = this.addresses();
    return (
      list.find((a) => a.isDefault) ??
      list.find((a) => a.id === this.localSelectedId()) ??
      list[0] ??
      null
    );
  });

  constructor() {
    // Persist the fallback list + selection to localStorage.
    effect(() => {
      if (!this.serverBacked()) {
        this.storage.setItem(KEY, this.addresses());
      }
    });
    effect(() => this.storage.setItem(SEL_KEY, this.localSelectedId()));
    // Load once a donor is signed in.
    effect(() => {
      if (this.auth.currentUser()?.role === 'donor' && !this.loaded) {
        this.loaded = true;
        this.load();
      }
    });
  }

  load(): void {
    this.loading.set(true);
    this.donorApi.list().subscribe({
      next: (rows) => {
        this.serverBacked.set(true);
        this.addresses.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.serverBacked.set(false);
        this.loadLocal();
        this.loading.set(false);
      },
    });
  }

  /**
   * Make an address the default (selected) pickup address. Cold Observable — the
   * caller must subscribe for the change to take effect.
   */
  select(id: string): Observable<void> {
    const a = this.addresses().find((x) => x.id === id);
    if (!a) {
      return of(undefined);
    }
    if (this.serverBacked()) {
      return this.donorApi.update(id, this.toBody(a, true)).pipe(
        tap(() => this.load()),
        map(() => undefined),
      );
    }
    this.localSelectedId.set(id);
    this.addresses.update((list) => list.map((x) => ({ ...x, isDefault: x.id === id })));
    return of(undefined);
  }

  create(draft: PickupAddressDraft, makeDefault = false): Observable<PickupAddress> {
    // The very first address becomes the default: a donor with addresses but no selection can't
    // post a donation at all.
    const isDefault = makeDefault || !this.addresses().length;
    const clean = this.clean(draft);
    if (this.serverBacked()) {
      return this.donorApi.create({ ...clean, isDefault }).pipe(
        tap(() => this.load()),
        catchError(() => {
          this.serverBacked.set(false);
          this.loadLocal();
          return of(this.localAdd(clean, true));
        }),
      );
    }
    return of(this.localAdd(clean, isDefault));
  }

  update(id: string, draft: PickupAddressDraft, isDefault: boolean): Observable<PickupAddress> {
    const clean = this.clean(draft);
    if (this.serverBacked()) {
      return this.donorApi.update(id, { ...clean, isDefault }).pipe(tap(() => this.load()));
    }
    const addr: PickupAddress = { id, ...clean, isDefault };
    this.addresses.update((list) =>
      list.map((x) => (x.id === id ? addr : isDefault ? { ...x, isDefault: false } : x)),
    );
    return of(addr);
  }

  /** Trim every text part and collapse blanks to null, matching what the backend stores. */
  private clean(draft: PickupAddressDraft): PickupAddressDraft {
    return {
      label: draft.label.trim(),
      address: draft.address.trim(),
      latitude: draft.latitude,
      longitude: draft.longitude,
      city: draft.city?.trim() || null,
      state: draft.state?.trim() || null,
      pincode: draft.pincode?.trim() || null,
    };
  }

  remove(id: string): Observable<void> {
    if (this.serverBacked()) {
      return this.donorApi.remove(id).pipe(tap(() => this.load()));
    }
    this.addresses.update((list) => list.filter((a) => a.id !== id));
    if (this.localSelectedId() === id) {
      this.localSelectedId.set(this.addresses()[0]?.id ?? null);
    }
    return of(undefined);
  }

  // ---- localStorage fallback ----

  private loadLocal(): void {
    const saved = this.storage.getItem<PickupAddress[]>(KEY) ?? [];
    if (saved.length) {
      this.addresses.set(saved);
      return;
    }
    const id = this.auth.currentUser()?.id;
    if (!id) {
      return;
    }
    this.users.getProfile(id).subscribe({
      next: (p) => {
        if (p.address && p.latitude != null && p.longitude != null) {
          this.localAdd(
            {
              label: 'Primary',
              address: p.address,
              latitude: p.latitude,
              longitude: p.longitude,
              city: p.city,
              state: p.state,
              pincode: p.pincode,
            },
            true,
            'profile',
          );
        }
      },
      error: () => undefined,
    });
  }

  private localAdd(
    draft: PickupAddressDraft,
    makeDefault: boolean,
    id = `addr-${Date.now()}`,
  ): PickupAddress {
    const addr: PickupAddress = { id, ...draft, isDefault: makeDefault };
    this.addresses.update((list) => {
      const next = makeDefault ? list.map((x) => ({ ...x, isDefault: false })) : list;
      return [...next, addr];
    });
    if (makeDefault) {
      this.localSelectedId.set(id);
    }
    return addr;
  }

  /**
   * Re-send an existing address unchanged apart from `isDefault` — the PUT is a full replace, so
   * every field has to be carried across or setting the default would wipe the postal parts.
   */
  private toBody(a: PickupAddress, isDefault: boolean): DonorAddressBody {
    return {
      label: a.label,
      address: a.address,
      latitude: a.latitude,
      longitude: a.longitude,
      city: a.city ?? null,
      state: a.state ?? null,
      pincode: a.pincode ?? null,
      isDefault,
    };
  }
}
