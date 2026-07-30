import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Certificate } from '@core/models/certificate.model';
import { CertificateService } from '@core/services/certificate.service';
import { ToastService } from '@core/services/toast.service';
import { EmptyState } from '@shared/ui/empty-state/empty-state';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

@Component({
  selector: 'app-certificates',
  imports: [EmptyState, DatePipe, PageWrapper],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Certificates"
      description="CSR-ready proof for every confirmed donation."
    >
      @if (loading()) {
        <div class="card-fb p-6 text-muted"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading certificates…</div>
      } @else {
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          @for (c of certificates(); track c.id) {
            <div class="card-fb p-4 text-center">
              <i class="fa-solid fa-award text-3xl text-primary mb-2"></i>
              <div class="font-semibold text-sm">{{ c.certificateNumber }}</div>
              <div class="text-muted text-xs mb-1">{{ c.mealsCount }} meals · {{ c.issuedAtUtc | date: 'MMM d, y' }}</div>
              <button class="btn-fb-outline w-full !py-2 !text-sm mt-2" [disabled]="downloadingId() === c.id" (click)="download(c)">
                <i class="fa-solid mr-1" [class]="downloadingId() === c.id ? 'fa-spinner fa-spin' : 'fa-download'"></i>
                {{ downloadingId() === c.id ? 'Preparing…' : 'View & Download' }}
              </button>
            </div>
          } @empty {
            <div class="md:col-span-2 lg:col-span-3">
              <app-empty-state icon="fa-solid fa-award" text="No certificates yet — complete a delivery to earn one" />
            </div>
          }
        </div>
      }
    </app-page-wrapper>
  `,
})
export class Certificates {
  private readonly certificateService = inject(CertificateService);
  private readonly toast = inject(ToastService);

  protected readonly certificates = signal<Certificate[]>([]);
  protected readonly loading = signal(true);
  protected readonly downloadingId = signal<string | null>(null);

  constructor() {
    this.certificateService.list().subscribe({
      next: (rows) => {
        this.certificates.set(rows);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not load certificates');
      },
    });
  }

  protected download(c: Certificate): void {
    this.downloadingId.set(c.id);
    this.certificateService.downloadPdf(c.id).subscribe({
      next: (blob) => {
        this.downloadingId.set(null);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `FoodBridge-Certificate-${c.certificateNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: Error) => {
        this.downloadingId.set(null);
        this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Could not download the certificate');
      },
    });
  }
}
