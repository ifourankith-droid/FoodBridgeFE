import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Role } from '@core/models/user.model';

type RoleStyle = { label: string; icon: string };

/**
 * Distinct, good-looking pill per user role. Case-insensitive on the input.
 *
 * Colour lives in CSS keyed on the role class rather than in inline styles, so
 * each pill derives both its fill and its label from one accent and can adapt
 * that pairing to dark mode. The previous version hard-coded a light fill plus
 * a dark label, which became dark-on-dark once the app grew a dark theme.
 */
const ROLE_STYLES: Record<Role, RoleStyle> = {
  donor: { label: 'Donor', icon: 'fa-solid fa-utensils' },
  volunteer: { label: 'Volunteer', icon: 'fa-solid fa-truck-fast' },
  recipient: { label: 'Recipient', icon: 'fa-solid fa-hand-holding-heart' },
  admin: { label: 'Admin', icon: 'fa-solid fa-user-shield' },
};

@Component({
  selector: 'app-role-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (style(); as s) {
      <span class="role-badge" [class]="size() + ' ' + (roleKey() ?? '')">
        @if (showIcon()) {
          <i [class]="s.icon" aria-hidden="true"></i>
        }
        <span>{{ s.label }}</span>
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .role-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      line-height: 1;
      border-radius: 999px;
      letter-spacing: 0.02em;
      white-space: nowrap;
      /* Fallback for an unrecognised role from a newer backend — still renders,
         just neutrally. Overridden by the role classes below. */
      --acc: var(--fb-muted);
      /* Self-tinting from a single accent: an alpha wash composites over
         whatever surface the pill sits on (white card, dark sidebar), and the
         label is pushed away from the accent to clear 4.5:1 against it. */
      background: color-mix(in srgb, var(--acc) 15%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--acc) 26%, transparent);
      color: color-mix(in srgb, var(--acc) 74%, #000);
    }
    /* Lighten the label on any dark backdrop. The .on-dark marker is needed in
       addition to .dark because the sidebar is dark in BOTH themes — keying only
       off the global theme left these pills dark-on-dark in light mode
       (measured 1.75:1 for the volunteer pill on a teal sidebar). */
    :host-context(.dark) .role-badge,
    :host-context(.on-dark) .role-badge {
      color: color-mix(in srgb, var(--acc) 62%, #fff);
    }

    /* Roles keep fixed identity hues — they must stay distinguishable from one
       another, so they deliberately do NOT follow the brand palette. */
    .role-badge.donor {
      --acc: #e2703a;
    }
    .role-badge.volunteer {
      --acc: #2f7de1;
    }
    .role-badge.recipient {
      --acc: #14a05a;
    }
    .role-badge.admin {
      --acc: #8b5cf6;
    }

    .role-badge.sm {
      font-size: 10.5px;
      padding: 4px 9px;
    }
    .role-badge.md {
      font-size: 12px;
      padding: 6px 12px;
    }
    .role-badge.lg {
      font-size: 13px;
      padding: 8px 14px;
    }
    .role-badge i {
      font-size: 0.92em;
    }
  `,
})
export class RoleBadge {
  /** User role — accepts any casing (e.g. 'Donor' from the backend). */
  readonly role = input.required<string | Role | null | undefined>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly showIcon = input(true);

  /** Normalised role key; doubles as the colour class. */
  protected readonly roleKey = computed<Role | null>(() => {
    const key = (this.role() ?? '').toString().toLowerCase() as Role;
    return key in ROLE_STYLES ? key : null;
  });

  protected readonly style = computed<RoleStyle | null>(() => {
    const key = this.roleKey();
    return key ? ROLE_STYLES[key] : null;
  });
}
