import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, computed, input, output, signal, viewChild } from '@angular/core';
import type { EChartsOption } from 'echarts';
import { DashboardChartComponent } from './dashboard-chart.component';
import type { DashboardChart } from './dashboard.model';

@Component({
  selector: 'app-dashboard-fullscreen-card',
  imports: [CommonModule, DashboardChartComponent],
  template: `
    <div #backdrop class="dashboard-fullscreen-card__backdrop" (click)="close()"></div>

    <section
      #panel
      class="dashboard-fullscreen-card__panel"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="chart().title">
      <header class="dashboard-fullscreen-card__header">
        <div>
          <h2>{{ chart().title }}</h2>
          <p>{{ chart().subtitle }}</p>
        </div>

        <button type="button" class="dashboard-fullscreen-card__close" aria-label="Cerrar" (click)="close()">
          <i class="pi pi-times"></i>
        </button>
      </header>

      <div class="dashboard-fullscreen-card__body">
        @if (chart().empty) {
          <div class="dashboard-empty-chart dashboard-empty-chart--fullscreen">
            <i class="pi pi-chart-bar"></i>
            <span>No hay datos para este rango</span>
          </div>
        } @else {
          <app-dashboard-chart [option]="fullscreenOption()" />
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 2200;
      }

      .dashboard-fullscreen-card__backdrop {
        position: fixed;
        inset: 0;
        z-index: 2200;
        background: rgba(15, 23, 42, 0.54);
        backdrop-filter: blur(8px);
        opacity: 0;
      }

      .dashboard-fullscreen-card__panel {
        position: fixed;
        inset: clamp(1rem, 4vh, 2.6rem) clamp(0.75rem, 5vw, 5rem);
        z-index: 2201;
        display: grid;
        grid-template-rows: min-content minmax(0, 1fr);
        max-width: 90rem;
        margin: 0 auto;
        overflow: hidden;
        border-radius: 18px;
        background:
          linear-gradient(145deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.96)),
          linear-gradient(135deg, rgba(168, 48, 68, 0.08), rgba(8, 145, 178, 0.08));
        box-shadow: 0 34px 88px rgba(15, 23, 42, 0.28);
        opacity: 0;
        transform-origin: top left;
        will-change: transform, opacity;
      }

      .dashboard-fullscreen-card__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 1.1rem 1.15rem 0.7rem;
      }

      .dashboard-fullscreen-card__header h2 {
        margin: 0;
        color: var(--dashboard-ink, #111827);
        font-size: clamp(1.12rem, 1.7vw, 1.55rem);
        font-weight: 900;
        line-height: 1.12;
        letter-spacing: 0;
      }

      .dashboard-fullscreen-card__header p {
        margin: 0.35rem 0 0;
        color: var(--dashboard-muted, #64748b);
        font-size: 0.9rem;
        font-weight: 650;
        line-height: 1.35;
      }

      .dashboard-fullscreen-card__close {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 2.35rem;
        height: 2.35rem;
        border: 0;
        border-radius: 999px;
        color: #334155;
        background: rgba(255, 255, 255, 0.9);
        box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.3);
        cursor: pointer;
        transition:
          transform 140ms ease,
          background-color 140ms ease,
          color 140ms ease;
      }

      @media (hover: hover) and (pointer: fine) {
        .dashboard-fullscreen-card__close:hover {
          color: var(--dashboard-brand, #a83044);
          background: #ffffff;
          transform: scale(1.04);
        }
      }

      .dashboard-fullscreen-card__close:focus-visible {
        outline: 3px solid rgba(168, 48, 68, 0.3);
        outline-offset: 2px;
      }

      .dashboard-fullscreen-card__body {
        min-height: 0;
        padding: 0 1rem 1rem;
      }

      :host ::ng-deep .dashboard-fullscreen-card__body app-dashboard-chart,
      :host ::ng-deep .dashboard-fullscreen-card__body .dashboard-chart {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
      }

      .dashboard-empty-chart {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        height: 100%;
        min-height: 24rem;
        color: #94a3b8;
        font-weight: 750;
      }

      .dashboard-empty-chart i {
        font-size: 2rem;
      }

      @media (prefers-reduced-motion: reduce) {
        .dashboard-fullscreen-card__close {
          transition-duration: 1ms;
        }
      }
    `,
  ],
})
export class DashboardFullscreenCardComponent implements AfterViewInit, OnDestroy {
  chart = input.required<DashboardChart>();
  originRect = input<DOMRect | null>(null);
  closed = output<void>();

  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private backdrop = viewChild.required<ElementRef<HTMLElement>>('backdrop');
  private closing = signal(false);
  private readonly motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private previousBodyOverflow = '';

  fullscreenOption = computed<EChartsOption>(() => ({
    ...this.chart().option,
    animation: false,
  }));

  ngAfterViewInit(): void {
    this.previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('dashboard-fullscreen-open');

    requestAnimationFrame(() => {
      this.animateIn();
    });
  }

  ngOnDestroy(): void {
    this.restoreBodyOverflow();
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.closing()) {
      return;
    }

    this.closing.set(true);
    this.animateOut();
  }

  private animateIn(): void {
    const panel = this.panel().nativeElement;
    const backdrop = this.backdrop().nativeElement;

    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: this.motionQuery.matches ? 140 : 180,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'both',
    });

    const origin = this.originRect();
    if (!origin || this.motionQuery.matches) {
      panel.animate([{ opacity: 0.01 }, { opacity: 1 }], {
        duration: 180,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        fill: 'both',
      });
      return;
    }

    const target = panel.getBoundingClientRect();
    panel.animate([this.buildTransformFrame(origin, target, 0.98), { transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1 }], {
      duration: 300,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'both',
    });
  }

  private animateOut(): void {
    const panel = this.panel().nativeElement;
    const backdrop = this.backdrop().nativeElement;
    const origin = this.originRect();
    const target = panel.getBoundingClientRect();

    const backdropAnimation = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: this.motionQuery.matches ? 120 : 180,
      delay: this.motionQuery.matches ? 0 : 70,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'both',
    });

    const panelAnimation =
      !origin || this.motionQuery.matches
        ? panel.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 160,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
            fill: 'both',
          })
        : panel.animate([{ transform: 'translate3d(0, 0, 0) scale(1, 1)', opacity: 1, offset: 0 }, { ...this.buildTransformFrame(origin, target, 1), offset: 0.96 }, { ...this.buildTransformFrame(origin, target, 0), offset: 1 }], {
            duration: 230,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
            fill: 'both',
          });

    Promise.allSettled([panelAnimation.finished, backdropAnimation.finished]).finally(() => {
      this.restoreBodyOverflow();
      this.closed.emit();
    });
  }

  private restoreBodyOverflow(): void {
    document.body.style.overflow = this.previousBodyOverflow;
    document.body.classList.remove('dashboard-fullscreen-open');
  }

  private buildTransformFrame(origin: DOMRect, target: DOMRect, opacity: number): Keyframe {
    const scaleX = origin.width / target.width;
    const scaleY = origin.height / target.height;
    const translateX = origin.left - target.left;
    const translateY = origin.top - target.top;

    return {
      transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`,
      opacity,
    };
  }
}
