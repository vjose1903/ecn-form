import { CommonModule } from '@angular/common';
import { Component, Directive, Input } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RetreatClass } from '@core/entities/retreat/retreat.class';

export interface ArchivedRequestItemData {
  request: RequestClass;
  retreat: RetreatClass | null;
}

const archivedRequestSharedStyles = `
  :host {
    display: block;
  }

  .archived-request-button {
    width: 100%;
    border: 0;
    padding: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .archived-request-button:focus-visible {
    outline: 2px solid #dc2626;
    outline-offset: 4px;
  }

  .archived-request-label {
    margin: 0 0 0.2rem;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .archived-request-couple {
    margin: 0;
    color: #0f172a;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .archived-request-retreat {
    margin: 0;
    color: #334155;
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .archived-request-date {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #b91c1c;
    font-size: 0.74rem;
    font-weight: 700;
    white-space: nowrap;
  }

  .archived-request-date i {
    font-size: 0.7rem;
  }
`;

@Directive()
class ArchivedRequestItemBase {
  @Input() item!: ArchivedRequestItemData;
  @Input() showRetreatMeta = false;
  @Input() afterClose?: () => void | Promise<void>;

  async openRequest(): Promise<void> {
    if (!this.item?.request) {
      return;
    }

    await this.item.request.openView({
      retreat: this.item.retreat,
      isArchived: true,
    });

    await this.afterClose?.();
  }
}

@Component({
  selector: 'app-archived-request-list-item',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" class="archived-request-button" (click)="openRequest()">
      <article class="archived-request-list">
        <div class="archived-request-list__rail"></div>
        <div class="archived-request-list__body">
          <div class="archived-request-list__header">
            <span class="archived-request-date">
              <i class="pi pi-calendar"></i>
              {{ item.request.displayArchivedAt }}
            </span>
          </div>

          <div class="archived-request-list__content">
            <div class="archived-request-list__section archived-request-list__section--couple">
              <p class="archived-request-label">Pareja</p>
              <h3 class="archived-request-couple archived-request-list__title">{{ item.request.displayCoupleNames }}</h3>
            </div>

            @if (showRetreatMeta && item.retreat) {
              <div class="archived-request-list__section archived-request-list__section--retreat">
                <p class="archived-request-label">Retiro</p>
                <p class="archived-request-retreat">#{{ item.retreat.displayNumber }} {{ item.retreat.displayCommunityName }}</p>
              </div>
            }
          </div>
        </div>
      </article>
    </button>
  `,
  styles: [
    archivedRequestSharedStyles,
    `
      .archived-request-list {
        display: grid;
        grid-template-columns: 0.42rem minmax(0, 1fr);
        min-height: 10.2rem;
        border-radius: 1.38rem;
        overflow: hidden;
        background: linear-gradient(135deg, #fff7f7 0%, #ffffff 55%, #f8fafc 100%);
        border: 1px solid rgba(226, 232, 240, 0.95);
        box-shadow: 0 18px 38px rgba(15, 23, 42, 0.08);
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease;
      }

      .archived-request-button:hover .archived-request-list {
        transform: translateY(-2px);
        border-color: rgba(248, 113, 113, 0.28);
        box-shadow: 0 24px 50px rgba(15, 23, 42, 0.12);
      }

      .archived-request-list__rail {
        background: linear-gradient(180deg, #dc2626 0%, #fb7185 100%);
      }

      .archived-request-list__body {
        display: grid;
        gap: 0.9rem;
        padding: 1.02rem 1.12rem 1.08rem;
      }

      .archived-request-list__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.85rem;
        flex-wrap: wrap;
      }

      .archived-request-list__content {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(14rem, 1fr);
        gap: 0.78rem;
        align-items: end;
      }

      .archived-request-list__section {
        min-width: 0;
      }

      .archived-request-list__title {
        font-size: clamp(1rem, 1.5vw, 1.38rem);
        line-height: 1.12;
        max-width: 30rem;
      }

      .archived-request-list__section--retreat {
        justify-self: end;
        width: 100%;
        max-width: 18rem;
        padding: 0.72rem 0.78rem;
        border-radius: 0.98rem;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(226, 232, 240, 0.9);
      }

      @media (max-width: 900px) {
        .archived-request-list__content {
          grid-template-columns: 1fr;
        }

        .archived-request-list__section--retreat {
          justify-self: start;
          max-width: none;
        }
      }

      @media (max-width: 640px) {
        .archived-request-list {
          min-height: auto;
          grid-template-columns: 0.32rem minmax(0, 1fr);
          border-radius: 1.16rem;
        }

        .archived-request-list__body {
          gap: 0.72rem;
          padding: 0.82rem 0.88rem 0.88rem;
        }

        .archived-request-date {
          font-size: 0.71rem;
        }

        .archived-request-list__title {
          font-size: 1.02rem;
        }

        .archived-request-list__section--retreat {
          padding: 0.72rem 0.78rem;
          border-radius: 0.82rem;
        }
      }
    `,
  ],
})
export class ArchivedRequestListItem extends ArchivedRequestItemBase {}

@Component({
  selector: 'app-archived-request-grid-item',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button" class="archived-request-button" (click)="openRequest()">
      <article class="archived-request-grid">
        <div class="archived-request-grid__hero">
          <div class="archived-request-grid__glow"></div>
          <div class="archived-request-grid__top">
            <span class="archived-request-date">
              <i class="pi pi-calendar"></i>
              {{ item.request.displayArchivedAt }}
            </span>
          </div>

          <div class="archived-request-grid__content">
            <div class="archived-request-grid__headline">
              <p class="archived-request-label">Pareja</p>
              <h3 class="archived-request-couple archived-request-grid__title">{{ item.request.displayCoupleNames }}</h3>
            </div>
          </div>
        </div>

        <div class="archived-request-grid__body">
          @if (showRetreatMeta && item.retreat) {
            <div class="archived-request-grid__retreat">
              <span class="archived-request-grid__retreat-icon pi pi-map-marker"></span>
              <div>
                <p class="archived-request-label">Retiro</p>
                <p class="archived-request-retreat">#{{ item.retreat.displayNumber }} {{ item.retreat.displayCommunityName }}</p>
              </div>
            </div>
          }
        </div>

        <div class="archived-request-grid__footer">
          <span class="archived-request-grid__footer-text">Abrir solicitud</span>
          <i class="pi pi-arrow-up-right archived-request-grid__footer-icon"></i>
        </div>
      </article>
    </button>
  `,
  styles: [
    archivedRequestSharedStyles,
    `
      .archived-request-grid {
        position: relative;
        display: grid;
        min-height: 16.6rem;
        border-radius: 1.34rem;
        overflow: hidden;
        background: linear-gradient(180deg, #ffffff 0%, #fff8f8 62%, #f8fafc 100%);
        border: 1px solid rgba(226, 232, 240, 0.95);
        box-shadow: 0 18px 38px rgba(15, 23, 42, 0.09);
        transition:
          transform 180ms ease,
          box-shadow 180ms ease,
          border-color 180ms ease;
      }

      .archived-request-button:hover .archived-request-grid {
        transform: translateY(-3px);
        border-color: rgba(248, 113, 113, 0.3);
        box-shadow: 0 28px 60px rgba(15, 23, 42, 0.14);
      }

      .archived-request-grid__hero {
        position: absolute;
        inset: 0 0 auto 0;
        display: grid;
        align-content: space-between;
        gap: 0.92rem;
        min-height: 10.8rem;
        padding: 1.02rem 1.02rem 1.06rem;
        background: radial-gradient(circle at top left, rgba(254, 202, 202, 0.95), transparent 34%), linear-gradient(140deg, #fff1f2 0%, #ffe4e6 42%, #fecaca 100%);
        border-bottom: 1px solid rgba(248, 113, 113, 0.12);
      }

      .archived-request-grid__glow {
        position: absolute;
        inset: auto -2rem -3rem auto;
        width: 8.5rem;
        height: 8.5rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.24);
        filter: blur(2px);
      }

      .archived-request-grid__hero,
      .archived-request-grid__top,
      .archived-request-grid__content,
      .archived-request-grid__body,
      .archived-request-grid__footer {
        position: relative;
        z-index: 1;
      }

      .archived-request-grid__top {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .archived-request-grid__content {
        display: grid;
        gap: 0.82rem;
        align-content: end;
        min-height: 0;
      }

      .archived-request-grid__headline {
        display: grid;
        gap: 0.35rem;
        justify-items: start;
        text-align: left;
        padding: 0.22rem 0 0;
      }

      .archived-request-grid__title {
        font-size: clamp(1.04rem, 1.5vw, 1.32rem);
        line-height: 1.1;
        max-width: 13ch;
      }

      .archived-request-grid .archived-request-label {
        font-size: 0.6rem;
      }

      .archived-request-grid .archived-request-date {
        font-size: 0.68rem;
      }

      .archived-request-grid .archived-request-date i {
        font-size: 0.64rem;
      }

      .archived-request-grid .archived-request-retreat {
        font-size: 0.74rem;
      }

      .archived-request-grid__body {
        display: grid;
        gap: 0.82rem;
        padding: 0.92rem 1.02rem 1.02rem;
      }

      .archived-request-grid__retreat {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.64rem;
        align-items: start;
        padding: 0.8rem 0.84rem;
        border-radius: 1.02rem;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(226, 232, 240, 0.92);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
      }

      .archived-request-grid__retreat-icon {
        margin-top: 0.18rem;
        color: #dc2626;
        font-size: 0.88rem;
      }

      .archived-request-grid__footer {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.62rem;
        padding: 0.12rem 1.02rem 1.02rem;
      }

      .archived-request-grid__footer-text {
        min-width: 0;
        color: #334155;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .archived-request-grid__footer-icon {
        display: inline-grid;
        place-items: center;
        flex-shrink: 0;
        justify-self: end;
        width: 1.84rem;
        height: 1.84rem;
        border-radius: 999px;
        background: #0f172a;
        color: #fff;
        font-size: 0.66rem;
        box-shadow: 0 8px 16px rgba(15, 23, 42, 0.16);
      }

      @media (max-width: 640px) {
        .archived-request-grid {
          min-height: 14.2rem;
          border-radius: 1.16rem;
        }

        .archived-request-grid__hero {
          gap: 0.72rem;
          min-height: 9.3rem;
          padding: 0.82rem 0.88rem 0.88rem;
        }

        .archived-request-grid__glow {
          width: 6rem;
          height: 6rem;
        }

        .archived-request-date {
          font-size: 0.71rem;
        }

        .archived-request-grid__title {
          font-size: 1.08rem;
          max-width: 12ch;
        }

        .archived-request-grid__body {
          gap: 0.62rem;
          padding: 0.78rem 0.88rem 0.88rem;
        }

        .archived-request-grid__retreat {
          padding: 0.72rem 0.78rem;
          border-radius: 0.82rem;
        }

        .archived-request-grid__footer {
          gap: 0.5rem;
          padding: 0 0.88rem 0.88rem;
        }

        .archived-request-grid__footer-text {
          font-size: 0.7rem;
        }

        .archived-request-grid__footer-icon {
          width: 1.68rem;
          height: 1.68rem;
          font-size: 0.64rem;
        }
      }
    `,
  ],
})
export class ArchivedRequestGridItem extends ArchivedRequestItemBase {}
