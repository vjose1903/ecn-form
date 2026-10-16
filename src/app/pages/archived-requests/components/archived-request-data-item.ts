import { CommonModule } from '@angular/common';
import { Component, Directive, Input, OnDestroy } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { RetreatClass } from '@core/entities/retreat/retreat.class';

export interface ArchivedRequestItemData {
  request: RequestClass;
  retreat: RetreatClass | null;
}

const archivedRequestSharedStyles = `
  :host { display: block; min-width: 0; height: 100%; }
  .archived-request-button {
    display: block; width: 100%; height: 100%; border: 0; padding: 0;
    background: transparent; text-align: left; cursor: pointer; font: inherit;
    container: archived-request / inline-size;
  }
  .archived-request-button:focus-visible { outline: 3px solid #a93249; outline-offset: 3px; border-radius: 1.25rem; }
  .archived-request-label {
    margin: 0 0 .3rem; color: #69778e; font-size: .6rem;
    font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  }
  .archived-request-couple { margin: 0; color: #111c30; font-weight: 800; letter-spacing: -.02em; }
  .archived-request-name { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .archived-request-retreat { margin: 0; color: #26354c; font-size: .85rem; line-height: 1.4; overflow-wrap: anywhere; }
  .archived-request-date { display: flex; align-items: center; gap: .7rem; color: #bc1020; font-size: .8rem; font-weight: 700; }
  .archived-request-selection { display: grid; place-items: center; width: 1.8rem; height: 1.8rem; flex: 0 0 1.8rem; border-radius: 50%; background: #fff; color: #64748b; }
  .archived-request-selection--selected { color: #168044; }
  .archived-request--selected { outline: 2px solid #35c875; outline-offset: -2px; }
`;

@Directive()
class ArchivedRequestItemBase implements OnDestroy {
  @Input() item!: ArchivedRequestItemData;
  @Input() showRetreatMeta = false;
  @Input() afterClose?: () => void | Promise<void>;
  @Input() selectionMode: () => boolean = () => false;
  @Input() isSelected: (requestId: string) => boolean = () => false;
  @Input() toggleSelection: (request: RequestClass) => void = () => {};
  private holdTimer?: ReturnType<typeof setTimeout>;
  private holdTriggered = false;
  private suppressClick = false;

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.item?.request || this.selectionMode()) return;
    const menuAnchor = event.currentTarget as HTMLElement;
    this.holdTriggered = false;
    this.holdTimer = setTimeout(() => {
      this.holdTriggered = true;
      this.suppressClick = true;
      void this.item.request.openView({ retreat: this.item.retreat, isArchived: true, actionsOnly: true, menuAnchor }).then(() => this.afterClose?.());
    }, 250);
  }

  onPointerUp(): void {
    this.clearHoldTimer();
    if (this.holdTriggered) setTimeout(() => (this.suppressClick = false));
  }

  onPointerCancel(): void {
    this.clearHoldTimer();
    this.holdTriggered = false;
  }

  onCardKeydown(event: KeyboardEvent): void {
    if (!this.selectionMode() || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    this.toggleSelection(this.item.request);
  }

  async onCardClick(event: MouseEvent): Promise<void> {
    if (this.selectionMode()) {
      event.preventDefault();
      this.toggleSelection(this.item.request);
      return;
    }
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    await this.openRequest();
  }

  ngOnDestroy(): void {
    this.clearHoldTimer();
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
  }

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
    <button type="button" class="archived-request-button" (pointerdown)="onPointerDown($event)" (pointerup)="onPointerUp()" (pointercancel)="onPointerCancel()" (pointerleave)="onPointerCancel()" (click)="onCardClick($event)" (keydown)="onCardKeydown($event)" [attr.role]="selectionMode() ? 'checkbox' : null" [attr.aria-checked]="selectionMode() ? isSelected(item.request.id) : null" [attr.tabindex]="selectionMode() ? 0 : null">
      <article class="archived-request-list" [class.archived-request--selected]="selectionMode() && isSelected(item.request.id)">
        <div class="archived-request-list__rail"></div>
        <div class="archived-request-list__body">
          <div class="archived-request-list__header">
            <span class="archived-request-date">
              <i class="pi pi-calendar" aria-hidden="true"></i>
              {{ item.request.displayArchivedAt }}
            </span>
            @if (selectionMode()) {
              <span class="archived-request-selection" [class.archived-request-selection--selected]="isSelected(item.request.id)"><i [class]="isSelected(item.request.id) ? 'pi pi-check-circle' : 'pi pi-circle'" aria-hidden="true"></i></span>
            }
          </div>

          <div class="archived-request-list__content">
            <div class="archived-request-list__section archived-request-list__section--couple">
              <p class="archived-request-label">Pareja</p>
              <h3 class="archived-request-couple archived-request-list__title"><span class="archived-request-name" [title]="item.request.she.full_name">- {{ item.request.she.full_name }}</span>
                <span class="archived-request-name" [title]="item.request.he.full_name">- {{ item.request.he.full_name }}</span></h3>
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
        display: grid; grid-template-columns: .5rem minmax(0, 1fr); overflow: hidden;
        border: 1px solid #e5eaf3; border-radius: 1.25rem;
        background: linear-gradient(115deg, #fff5f5, #fff 58%, #f8fbff);
        box-shadow: 0 14px 34px rgb(15 23 42 / 6%);
      }
      .archived-request-button:hover .archived-request-list { box-shadow: 0 18px 38px rgb(15 23 42 / 10%); }
      .archived-request-list__rail { background: linear-gradient(180deg, #ed0025, #fb7185); }
      .archived-request-list__body { min-width: 0; padding: 1.25rem 1.75rem; }
      .archived-request-list__header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-bottom: .85rem; }
      .archived-request-list__content { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1.75rem; align-items: center; }
      .archived-request-list__section { min-width: 0; }
      .archived-request-list__title { font-size: 1.25rem; line-height: 1.45; }
      .archived-request-list__section--retreat { border-left: 1px solid #e0e7f1; padding-left: 1.75rem; }
      @container archived-request (max-width: 650px) {
        .archived-request-list__body { padding: 1rem; }
        .archived-request-list__content { grid-template-columns: 1fr; gap: .85rem; }
        .archived-request-list__title { font-size: 1rem; }
        .archived-request-list__section--retreat { border-left: 0; border-top: 1px solid #e5eaf3; padding: .85rem 0 0; }
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
    <button type="button" class="archived-request-button" (pointerdown)="onPointerDown($event)" (pointerup)="onPointerUp()" (pointercancel)="onPointerCancel()" (pointerleave)="onPointerCancel()" (click)="onCardClick($event)" (keydown)="onCardKeydown($event)" [attr.role]="selectionMode() ? 'checkbox' : null" [attr.aria-checked]="selectionMode() ? isSelected(item.request.id) : null" [attr.tabindex]="selectionMode() ? 0 : null">
      <article class="archived-request-grid" [class.archived-request--selected]="selectionMode() && isSelected(item.request.id)">
        <div class="archived-request-grid__hero">
          <div class="archived-request-grid__glow"></div>
          <div class="archived-request-grid__top">
            <span class="archived-request-date">
              <i class="pi pi-calendar" aria-hidden="true"></i>
              {{ item.request.displayArchivedAt }}
            </span>
            @if (selectionMode()) {
              <span class="archived-request-selection" [class.archived-request-selection--selected]="isSelected(item.request.id)"><i [class]="isSelected(item.request.id) ? 'pi pi-check-circle' : 'pi pi-circle'" aria-hidden="true"></i></span>
            }
          </div>

          <div class="archived-request-grid__content">
            <div class="archived-request-grid__headline">
              <p class="archived-request-label">Pareja</p>
              <h3 class="archived-request-couple archived-request-grid__title"><span class="archived-request-name" [title]="item.request.she.full_name">- {{ item.request.she.full_name }}</span>
                <span class="archived-request-name" [title]="item.request.he.full_name">- {{ item.request.he.full_name }}</span></h3>
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
        display: grid; grid-template-rows: auto 1fr auto; height: 100%; overflow: hidden;
        border: 1px solid #e5e9f2; border-radius: 1.25rem; background: #fff;
        box-shadow: 0 16px 36px rgb(15 23 42 / 8%);
      }
      .archived-request-button:hover .archived-request-grid { box-shadow: 0 20px 40px rgb(15 23 42 / 12%); }
      .archived-request-grid__hero {
        position: relative; overflow: hidden; display: grid; align-content: space-between;
        gap: 1.5rem; min-height: 11rem; padding: 1.1rem 1.25rem;
        background: radial-gradient(circle at 95% 88%, rgb(255 255 255 / 22%) 0 27%, transparent 28%),
          linear-gradient(125deg, #fcd5d9, #fce7e9 52%, #fbd0d5);
      }
      .archived-request-grid__top { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
      .archived-request-grid__glow { display: none; }
      .archived-request-grid__headline { min-width: 0; }
      .archived-request-grid__title { font-size: 1.1rem; line-height: 1.5; }
      .archived-request-grid__body { padding: .75rem 1rem; }
      .archived-request-grid__retreat {
        display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); align-items: center;
        gap: .7rem; padding: .6rem; border: 1px solid #e9edf5;
        border-radius: .95rem; background: #fcfdff;
      }
      .archived-request-grid__retreat-icon {
        display: grid; place-items: center; width: 2.5rem; height: 2.5rem;
        border-radius: 50%; background: #fff0f2; color: #ed001b; font-size: 1.15rem;
      }
      .archived-request-grid__footer {
        display: flex; align-items: center; justify-content: center; justify-self: end;
        gap: .85rem; margin: .25rem 1rem 1rem; padding: .65rem 1rem;
        min-height: 2.65rem; border-radius: .8rem; background: #870c1b; color: #fff;
        font-size: .8rem;
      }
      .archived-request-button:hover .archived-request-grid__footer { background: #700917; }
      @container archived-request (max-width: 300px) {
        .archived-request-grid__hero { padding: 1rem; }
        .archived-request-grid__title { font-size: 1rem; }
      }
    `,
  ],
})
export class ArchivedRequestGridItem extends ArchivedRequestItemBase {}
