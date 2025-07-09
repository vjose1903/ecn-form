import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { ViewItem } from '@core/components/view-item/view-item';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { CoupleI, CoupleType } from '@core/entities/request/request.model';
import { BadgeModule } from 'primeng/badge';

@Component({
  selector: 'couple-view',
  imports: [CommonModule, TagModule, DividerLine, AngularSvgIconModule, BadgeModule, ViewItem],
  templateUrl: './couple-view.html',
  styleUrl: './couple-view.scss',
})
export class CoupleView {
  couple = input.required<CoupleI>();
  coupleType = input.required<CoupleType>();

  coupleLabel = computed(() => {
    return this.coupleType() === CoupleType.SHE ? 'Novia' : 'Novio';
  });

  coupleIcon = computed(() => {
    return this.coupleType() === CoupleType.SHE ? 'icons/woman.svg' : 'icons/man.svg';
  });

  coupleIconBg = computed(() => {
    return this.coupleType() === CoupleType.SHE ? 'bg-pink-100/80' : 'bg-blue-100/60';
  });

  coupleIconColor = computed(() => {
    return this.coupleType() === CoupleType.SHE ? 'deeppink' : 'dodgerblue';
  });

  coupleIconName = computed(() => {
    return this.coupleType() === CoupleType.SHE ? 'woman-icon' : 'man-icon';
  });
}
