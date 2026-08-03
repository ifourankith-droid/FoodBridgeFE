import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { catchError, EMPTY, tap } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { DialogService } from '@core/services/dialog.service';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import {
  DOCUMENT_META,
  UserDocument,
  UserDocumentType,
  UserVerification,
} from '@core/models/verification.model';
import { FbButton } from '@shared/ui/button/button';
import { IMAGE_ACCEPT, IMAGE_OR_PDF_ACCEPT } from '@shared/ui/image-picker/image-picker';
import { openPhotoDialog } from '@shared/ui/image-picker/photo-dialog';
import { ListingLayout } from '@shared/ui/listing-layout/listing-layout';
import { SummaryHeader } from '@shared/ui/summary-header/summary-header';

/** One row of the checklist: what's needed, and what (if anything) has been submitted. */
interface DocumentRow {
  type: UserDocumentType;
  label: string;
  hint: string;
  icon: string;
  submitted: UserDocument | null;
}

/** One stage in the "how approval works" aside card, with which one we're on. */
interface VerificationStep {
  label: string;
  icon: string;
  done: boolean;
  active: boolean;
}

/**
 * The volunteer's own verification screen: what we need from them, what they've sent, and whose
 * turn it is.
 *
 * A volunteer registers as `Pending` and cannot claim or collect a listing until an admin has
 * checked their ID against their selfie — so this page has to make the remaining step obvious
 * rather than leaving them wondering why the Claim button doesn't work.
 */
@Component({
  selector: 'app-verification',
  imports: [ListingLayout, SummaryHeader, FbButton, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-listing-layout
      [title]="'Account verification'"
      description="We check every volunteer before they can collect food from a donor."
      [hasAside]="true"
      [hasFilters]="false"
      [loading]="loading()"
      [empty]="!!state() && required().length === 0"
      emptyIcon="fa-solid fa-circle-check"
      emptyTitle="Nothing to verify"
      emptyText="Your account type doesn't need any documents."
      gridClass="grid-cols-1"
    >
      <!-- Summary strip: same icon-tile + heading + subtitle shape as the listing
           pages, with the copy driven by the volunteer's verification state. The
           icon matches the sidebar/route entry for Verification (fa-id-card). -->
      <app-summary-header
        summary
        icon="fa-solid fa-id-card"
        [loading]="loading()"
        loadingText="Loading your verification status…"
      >
        <span
          heading
          [class.text-success-deep]="statusColor() === 'success-deep'"
          [class.text-primary-deep]="statusColor() === 'primary-deep'"
          [class.text-orange]="statusColor() === 'orange'"
        >{{ statusTitle() }}</span>
        <span subtitle class="text-muted">{{ statusDetail() }}</span>
      </app-summary-header>

      <!-- Document checklist (default slot / left column). -->
      @for (row of rows(); track row.type) {
        <div class="doc" [class.done]="!!row.submitted">
          <div class="doc-ic"><i [class]="row.icon"></i></div>
          <div class="min-w-0 flex-1">
            <div class="font-bold">
              {{ row.label }}
              @if (row.submitted) {
                <i class="fa-solid fa-circle-check ml-1 text-success"></i>
              }
            </div>
            @if (row.submitted) {
              <div class="text-xs text-muted truncate">
                {{ row.submitted.originalFileName || 'Uploaded' }} ·
                {{ row.submitted.uploadedAtUtc | date: 'd MMM, HH:mm' }}
              </div>
            } @else {
              <div class="text-xs text-muted">{{ row.hint }}</div>
            }
          </div>
          <app-button
            [variant]="row.submitted ? 'outline' : 'solid'"
            size="sm"
            [icon]="row.submitted ? 'fa-solid fa-rotate' : 'fa-solid fa-upload'"
            (clicked)="upload(row)"
          >
            {{ row.submitted ? 'Replace' : 'Upload' }}
          </app-button>
        </div>
      }

      @if (rows().length) {
        <p belowGrid class="fb-help mt-4">
          <i class="fa-solid fa-lock mr-1"></i>
          Your documents are only visible to FoodBridge admins reviewing your account, and are
          never shown to donors.
        </p>
      }

      <!-- Sticky aside: a progress donut over a few at-a-glance cards. -->
      <ng-container aside>
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-4">Verification progress</div>
          <div class="flex items-center gap-4">
            <div class="fb-ring" [style.background]="donutBackground()">
              <div class="fb-ring-inner">
                <span class="fb-ring-num">{{ progressPct() }}%</span>
                <span class="fb-ring-cap">done</span>
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-muted text-xs">Documents</div>
              <div
                class="font-bold text-xl"
                [class.text-success-deep]="progressPct() === 100"
                [class.text-primary-deep]="progressPct() !== 100"
              >
                {{ submittedCount() }} / {{ required().length }}
              </div>
              <div class="text-muted text-[11px] mt-1 truncate">{{ statusTitle() }}</div>
            </div>
          </div>
        </div>

        <!-- Per-document status, mirroring the "by category" rows on the listing pages. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">Documents</div>
          @if (docStats().length) {
            <div class="flex flex-col gap-1">
              @for (d of docStats(); track d.id) {
                <div class="fb-cat-row">
                  <span class="fb-cat-icon" [style.color]="d.color">
                    <i [class]="d.icon" aria-hidden="true"></i>
                  </span>
                  <span class="fb-cat-label">{{ d.label }}</span>
                  <span
                    class="fb-cat-count"
                    [class.text-success-deep]="d.done"
                  >{{ d.done ? 'Submitted' : 'Missing' }}</span>
                  <span class="fb-cat-bar" aria-hidden="true">
                    <span
                      class="fb-cat-fill"
                      [style.width.%]="d.done ? 100 : 0"
                      [style.background]="d.color"
                    ></span>
                  </span>
                </div>
              }
            </div>
          } @else {
            <p class="text-muted text-xs m-0">No documents are required for your account.</p>
          }
        </div>

        <!-- How approval works, with the current stage highlighted. -->
        <div class="card-fb p-5">
          <div class="font-bold text-sm mb-3">How it works</div>
          <div class="flex flex-col gap-2">
            @for (step of steps(); track step.label) {
              <div class="step" [class.done]="step.done" [class.active]="step.active">
                <span class="step-ic">
                  <i [class]="step.done ? 'fa-solid fa-circle-check' : step.icon"></i>
                </span>
                <span class="step-label">{{ step.label }}</span>
              </div>
            }
          </div>
        </div>
      </ng-container>
    </app-listing-layout>
  `,
  styles: [
    `
      .doc {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--fb-line);
        border-radius: 14px;
        background: var(--fb-surface);
      }
      .doc.done {
        border-color: var(--fb-success);
      }
      .doc-ic {
        flex: none;
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 12px;
        background: var(--fb-primary-soft);
        color: var(--fb-primary-deep);
      }

      /* "How it works" steps — a muted default, primary while current, green once done. */
      .step {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        color: var(--fb-muted);
      }
      .step-ic {
        flex: none;
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        font-size: 12px;
        background: var(--fb-bg);
        border: 1px solid var(--fb-line);
      }
      .step.active {
        color: var(--fb-ink);
        font-weight: 600;
      }
      .step.active .step-ic {
        background: var(--fb-primary-soft);
        border-color: var(--fb-primary);
        color: var(--fb-primary-deep);
      }
      .step.done {
        color: var(--fb-ink);
      }
      .step.done .step-ic {
        background: var(--fb-success-soft);
        border-color: var(--fb-success);
        color: var(--fb-success-deep);
      }
    `,
  ],
})
export class Verification {
  private readonly users = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);

  protected readonly state = signal<UserVerification | null>(null);
  protected readonly loading = signal(true);

  protected readonly rows = computed<DocumentRow[]>(() => {
    const v = this.state();
    if (!v) {
      return [];
    }
    return v.requiredDocumentTypes.map((type) => ({
      type,
      ...DOCUMENT_META[type],
      submitted: v.documents.find((d) => d.type === type) ?? null,
    }));
  });

  /** Text-colour token for the summary heading, so it reads the same state as the donut. */
  protected readonly statusColor = computed(() => {
    switch (this.state()?.accountStatus) {
      case 'Verified':
        return 'success-deep';
      case 'Suspended':
        return 'primary-deep';
      default:
        return 'orange';
    }
  });

  protected readonly statusTitle = computed(() => {
    const v = this.state();
    switch (v?.accountStatus) {
      case 'Verified':
        return "You're verified";
      case 'Suspended':
        return 'Your account is suspended';
      default:
        return v?.isReadyForReview ? 'Waiting for admin review' : 'Verification needed';
    }
  });

  /** Says whose turn it is — the distinction the volunteer most needs and can't infer. */
  protected readonly statusDetail = computed(() => {
    const v = this.state();
    switch (v?.accountStatus) {
      case 'Verified':
        return 'You can claim listings and collect food. Thanks for helping out!';
      case 'Suspended':
        return 'You cannot take on new deliveries. Please contact support if you think this is a mistake.';
      default:
        return v?.isReadyForReview
          ? "Everything's in. An admin will review your documents shortly — you'll be able to claim listings once approved."
          : 'Upload the documents below so an admin can approve your account. You can browse listings meanwhile, but not claim them yet.';
    }
  });

  /** What this account must submit — drives the donut and the empty state. */
  protected readonly required = computed(() => this.state()?.requiredDocumentTypes ?? []);

  /** How many of the required documents are already in. */
  protected readonly submittedCount = computed(() => this.rows().filter((r) => r.submitted).length);

  /** Share of required documents submitted, for the aside donut (100% when none needed). */
  protected readonly progressPct = computed(() => {
    const total = this.required().length;
    return total ? Math.round((this.submittedCount() / total) * 100) : 100;
  });

  /** Conic gradient for the donut: green once verified, brand primary while in progress. */
  protected readonly donutBackground = computed(() => {
    const pct = this.progressPct();
    const color = pct === 100 ? 'var(--fb-success)' : 'var(--fb-primary)';
    return `conic-gradient(${color} 0 ${pct}%, var(--fb-line) ${pct}% 100%)`;
  });

  /** Per-document status rows for the aside, reusing the listing "by category" chrome. */
  protected readonly docStats = computed(() =>
    this.rows().map((r) => ({
      id: r.type,
      label: r.label,
      icon: r.icon,
      done: !!r.submitted,
      color: r.submitted ? '#059669' : '#d97706',
    })),
  );

  /** The three-stage approval flow, with the stage the volunteer is currently on marked active. */
  protected readonly steps = computed<VerificationStep[]>(() => {
    const v = this.state();
    const uploaded = !!v && (v.isReadyForReview || v.accountStatus === 'Verified');
    const verified = v?.accountStatus === 'Verified';
    return [
      { label: 'Upload your documents', icon: 'fa-solid fa-upload', done: uploaded, active: !uploaded },
      { label: 'Admin reviews your ID', icon: 'fa-solid fa-user-shield', done: verified, active: uploaded && !verified },
      { label: "You're verified", icon: 'fa-solid fa-circle-check', done: verified, active: false },
    ];
  });

  constructor() {
    this.load();
  }

  protected upload(row: DocumentRow): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      return;
    }

    openPhotoDialog(this.dialog, {
      title: row.label,
      subtitle: row.hint,
      icon: row.icon,
      confirmLabel: 'Upload',
      // A selfie should be taken now, not picked from the gallery; an ID is usually already a
      // file or scan, so that one allows both.
      sources: row.type === 'Selfie' ? 'camera' : 'both',
      accept: row.type === 'Selfie' ? IMAGE_ACCEPT : IMAGE_OR_PDF_ACCEPT,
      maxSizeMb: 5,
      submit: (file) =>
        this.users.uploadDocument(userId, row.type, file).pipe(
          tap((v) => {
            this.state.set(v);
            this.toast.show('fa-solid fa-circle-check', `${row.label} uploaded`);
          }),
          catchError((err: Error) => {
            this.toast.show('fa-solid fa-triangle-exclamation', err.message || 'Upload failed');
            // Swallowed so the dialog stays open with the file for a retry.
            return EMPTY;
          }),
        ),
    });
  }

  private load(): void {
    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.loading.set(false);
      return;
    }
    this.users.getVerification(userId).subscribe({
      next: (v) => {
        this.state.set(v);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.toast.show(
          'fa-solid fa-triangle-exclamation',
          err.message || 'Could not load your verification status',
        );
      },
    });
  }
}
