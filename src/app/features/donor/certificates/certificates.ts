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
      [title]="'Certificates'"
      description="CSR-ready proof for every confirmed donation."
    >
      @if (loading()) {
        <!-- Traces the real card: award mark, number, meta line, download button.
             Same grid and gap as the loaded state, so nothing shifts position when
             the data lands — the point of a skeleton over a spinner. -->
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          @for (s of skeletons; track $index) {
            <div class="sk-card flex flex-col items-center">
              <div class="sk h-9 w-9 !rounded-full mb-3"></div>
              <div class="sk h-4 w-2/3 mb-2"></div>
              <div class="sk h-3 w-1/2 mb-4"></div>
              <div class="sk h-9 w-full"></div>
            </div>
          }
        </div>
        <p class="sr-only" role="status">Loading certificates…</p>
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
            <div class="card-fb md:col-span-2 lg:col-span-3">
              <app-empty-state
                icon="fa-solid fa-award"
                [title]="'No certificates yet'"
                text="Complete a donation and your CSR-ready certificate lands here."
              />
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
  /** Placeholder cards while loading — six fills the grid at every breakpoint. */
  protected readonly skeletons = Array.from({ length: 6 });
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
