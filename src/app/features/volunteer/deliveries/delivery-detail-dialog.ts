import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ApiListing, ApiTimelineEvent } from '@core/models/listing-api.model';
import { DialogService } from '@core/services/dialog.service';
import { ListingService } from '@core/services/listing.service';
import { DIALOG_DATA } from '@shared/ui/dialog/dialog.model';
import { openImageDialog } from '@shared/ui/image-viewer/image-viewer-dialog';
import { Pill } from '@shared/ui/pill/pill';
import { TimelineHorizontal } from '@shared/ui/timeline-horizontal/timeline-horizontal';

/**
 * Read-only detail for one of the volunteer's deliveries: the food photo, its
 * attributes, and the horizontal lifecycle timeline (each step's time, actor and
 * proof photo). The timeline is fetched on open from the shared
 * `GET /listings/{id}/timeline` endpoint.
 */
@Component({
  selector: 'app-delivery-detail-dialog',
  imports: [Pill, TimelineHorizontal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <button type="button" class="dd-hero" (click)="viewImage(url)">
        <img [src]="url" alt="{{ data.title }}" />
      </button>
    }

    <div class="flex flex-wrap gap-2 mb-4">
      <app-pill type="quantity" [value]="data.quantityMeals" />
      <app-pill type="diet" [value]="data.dietType" />
      <app-pill type="meal" [value]="data.mealType" />
      <app-pill type="freshness" [value]="data.freshnessTag" />
    </div>

    <div class="section-title mb-1">Timeline</div>
    @if (loading()) {
      <p class="text-muted text-sm m-0"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading timeline…</p>
    } @else if (entries().length) {
      <app-timeline-horizontal [entries]="entries()" />
    } @else {
      <p class="text-muted text-sm m-0">No steps recorded yet.</p>
    }
  `,
  styles: `
    .dd-hero {
      display: block;
      width: 100%;
      margin-bottom: 14px;
      padding: 0;
      border: 0;
      border-radius: 14px;
      overflow: hidden;
      cursor: pointer;
      line-height: 0;
      background: var(--fb-bg);
    }
    .dd-hero img {
      width: 100%;
      max-height: 220px;
      object-fit: cover;
    }
  `,
})
export class DeliveryDetailDialog {
  protected readonly data = inject<ApiListing>(DIALOG_DATA);

  private readonly dialog = inject(DialogService);
  private readonly listingService = inject(ListingService);

  protected readonly entries = signal<ApiTimelineEvent[]>([]);
  protected readonly loading = signal(true);

  protected readonly imageUrl = computed(() => this.data.images?.[0]?.imageUrl ?? null);

  constructor() {
    this.listingService.timeline(this.data.id).subscribe({
      next: (events) => {
        this.entries.set(events);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected viewImage(url: string): void {
    openImageDialog(this.dialog, { title: this.data.title, imageUrl: url });
  }
}
