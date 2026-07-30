import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

export interface BarChartPoint {
  label: string;
  value: number;
}

interface BarGeom {
  index: number;
  path: string;
  hitX: number;
  hitW: number;
  cx: number;
  labelY: number;
  topY: number;
  label: string;
  value: number;
}

interface GridLine {
  y: number;
  value: number;
}

// Fixed height; width tracks the container so the SVG renders at 1:1 (viewBox width ==
// pixel width) — that keeps text at its real px size instead of scaling with the chart.
const H = 240;
const PAD = { l: 40, r: 14, t: 22, b: 30 };
const PLOT_H = H - PAD.t - PAD.b;
const BASE_Y = PAD.t + PLOT_H;

/**
 * Single-series bar chart for magnitude-over-time (e.g. meals/deliveries by month).
 * One brand hue, recessive gridlines, rounded bar tops, and a per-bar hover tooltip.
 * Width-aware (1:1 coordinate space) so label text matches the page's text size, and
 * theme-aware via CSS variables — no external charting dependency.
 */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + H" [style.height.px]="H" class="chart" role="img" [attr.aria-label]="ariaLabel()">
      <!-- gridlines + y-axis ticks -->
      @for (g of gridlines(); track g.value) {
        <line [attr.x1]="padL" [attr.x2]="width() - padR" [attr.y1]="g.y" [attr.y2]="g.y" class="grid" />
        <text [attr.x]="padL - 8" [attr.y]="g.y + 4" class="tick" text-anchor="end">{{ g.value }}</text>
      }
      <!-- baseline -->
      <line [attr.x1]="padL" [attr.x2]="width() - padR" [attr.y1]="baseY" [attr.y2]="baseY" class="axis" />

      @for (b of bars(); track b.index) {
        <g
          (mouseenter)="hovered.set(b.index)"
          (mouseleave)="hovered.set(null)"
          class="bar-group"
          [class.dim]="hovered() !== null && hovered() !== b.index"
        >
          <path [attr.d]="b.path" class="bar" />
          <!-- full-height hit target for easy hover -->
          <rect [attr.x]="b.hitX" [attr.y]="padT" [attr.width]="b.hitW" [attr.height]="plotH" fill="transparent" />
          <text [attr.x]="b.cx" [attr.y]="b.labelY" class="x-label" text-anchor="middle">{{ b.label }}</text>
          @if (hovered() === b.index) {
            <text [attr.x]="b.cx" [attr.y]="b.topY - 8" class="value" text-anchor="middle">{{ b.value }}{{ unit() }}</text>
          }
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .chart {
      width: 100%;
      display: block;
    }
    .grid {
      stroke: var(--fb-line);
      stroke-width: 1;
      opacity: 0.6;
    }
    .axis {
      stroke: var(--fb-line);
      stroke-width: 1.5;
    }
    .tick,
    .x-label {
      fill: var(--fb-muted);
      font-size: 12px;
    }
    .value {
      fill: var(--fb-text);
      font-size: 13px;
      font-weight: 700;
    }
    .bar {
      fill: var(--fb-primary);
      transition:
        opacity 0.15s ease,
        fill 0.15s ease;
    }
    .bar-group {
      cursor: default;
    }
    .bar-group.dim .bar {
      opacity: 0.35;
    }
    .bar-group:hover .bar {
      fill: var(--fb-primary-deep, var(--fb-primary));
    }
  `,
})
export class BarChart {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly data = input.required<BarChartPoint[]>();
  /** Optional suffix on the hover value, e.g. "%". */
  readonly unit = input('');

  protected readonly hovered = signal<number | null>(null);
  /** Measured container width in px — the SVG renders at this width 1:1. */
  protected readonly width = signal(640);

  protected readonly H = H;
  protected readonly padL = PAD.l;
  protected readonly padR = PAD.r;
  protected readonly padT = PAD.t;
  protected readonly baseY = BASE_Y;
  protected readonly plotH = PLOT_H;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.host.nativeElement;
      const observer = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? el.clientWidth;
        if (w > 0) {
          this.width.set(w);
        }
      });
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private readonly niceMax = computed(() => this.niceCeil(Math.max(...this.data().map((p) => p.value), 0)));

  protected readonly ariaLabel = computed(() =>
    this.data()
      .map((p) => `${p.label}: ${p.value}`)
      .join(', '),
  );

  protected readonly gridlines = computed<GridLine[]>(() => {
    const max = this.niceMax();
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: BASE_Y - f * PLOT_H,
      value: Math.round(max * f),
    }));
  });

  protected readonly bars = computed<BarGeom[]>(() => {
    const points = this.data();
    const max = this.niceMax();
    const n = points.length;
    const plotW = this.width() - PAD.l - PAD.r;
    if (!n || plotW <= 0) {
      return [];
    }
    const slot = plotW / n;
    const barW = Math.min(slot * 0.55, 64);
    return points.map((p, i) => {
      const slotX = PAD.l + slot * i;
      const x = slotX + (slot - barW) / 2;
      const h = max > 0 ? (p.value / max) * PLOT_H : 0;
      const topY = BASE_Y - h;
      return {
        index: i,
        path: this.barPath(x, topY, barW, h, 4),
        hitX: slotX,
        hitW: slot,
        cx: slotX + slot / 2,
        labelY: BASE_Y + 18,
        topY,
        label: p.label,
        value: p.value,
      };
    });
  });

  /** Rounded-top-only rectangle path anchored to the baseline. */
  private barPath(x: number, y: number, w: number, h: number, r: number): string {
    if (h <= 0) {
      return `M${x},${BASE_Y - 2} L${x + w},${BASE_Y - 2} L${x + w},${BASE_Y} L${x},${BASE_Y} Z`;
    }
    const rr = Math.min(r, w / 2, h);
    return (
      `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} ` +
      `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
    );
  }

  /** Round a max up to a clean axis bound (1, 2, 2.5, 5, 10 × 10ⁿ). */
  private niceCeil(max: number): number {
    if (max <= 0) {
      return 1;
    }
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    for (const step of [1, 2, 2.5, 5, 10]) {
      const candidate = step * magnitude;
      if (candidate >= max) {
        return candidate;
      }
    }
    return 10 * magnitude;
  }
}
