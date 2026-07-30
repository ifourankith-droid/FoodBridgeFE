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
import { openPhotoDialog } from '@shared/ui/image-picker/photo-dialog';
import { PageWrapper } from '@shared/ui/page-wrapper/page-wrapper';

/** One row of the checklist: what's needed, and what (if anything) has been submitted. */
interface DocumentRow {
  type: UserDocumentType;
  label: string;
  hint: string;
  icon: string;
  submitted: UserDocument | null;
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
  imports: [PageWrapper, FbButton, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-wrapper
      title="Account verification"
      subtitle="We check every volunteer before they can collect food from a donor."
    >
      @if (loading()) {
        <p class="fb-help"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Loading…</p>
      } @else if (state(); as v) {
        <div class="flex flex-col gap-4">
          <!-- Status banner: the one thing the volunteer actually came here to find out. -->
          <div class="status" [class]="'is-' + v.accountStatus.toLowerCase()">
            <i class="fa-solid" [class]="statusIcon()"></i>
            <div class="min-w-0">
              <div class="font-bold">{{ statusTitle() }}</div>
              <div class="text-sm">{{ statusDetail() }}</div>
            </div>
          </div>

          @if (v.requiredDocumentTypes.length === 0) {
            <p class="fb-help">Your account type doesn't need any documents.</p>
          } @else {
            <div class="flex flex-col gap-3">
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
            </div>

            <p class="fb-help">
              <i class="fa-solid fa-lock mr-1"></i>
              Your documents are only visible to FoodBridge admins reviewing your account, and are
              never shown to donors.
            </p>
          }
        </div>
      }
    </app-page-wrapper>
  `,
  styles: [
    `
      .status {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 14px 16px;
        border-radius: var(--fb-radius);
        border: 1px solid var(--fb-line);
      }
      .status > i {
        font-size: 1.2rem;
        margin-top: 2px;
      }
      .status.is-pending {
        background: var(--fb-orange-soft);
        border-color: var(--fb-orange);
        color: var(--fb-ink);
      }
      .status.is-pending > i {
        color: var(--fb-orange);
      }
      .status.is-verified {
        background: var(--fb-success-soft);
        border-color: var(--fb-success);
      }
      .status.is-verified > i {
        color: var(--fb-success-deep);
      }
      .status.is-suspended {
        background: var(--fb-primary-soft);
        border-color: var(--fb-primary);
      }
      .status.is-suspended > i {
        color: var(--fb-primary-deep);
      }
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

  protected readonly statusIcon = computed(() => {
    switch (this.state()?.accountStatus) {
      case 'Verified':
        return 'fa-circle-check';
      case 'Suspended':
        return 'fa-circle-exclamation';
      default:
        return 'fa-hourglass-half';
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
      accept: row.type === 'Selfie' ? 'image/jpeg,image/png' : 'image/jpeg,image/png,application/pdf',
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
