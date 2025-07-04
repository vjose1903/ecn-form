import { Component, inject, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { TagModule } from 'primeng/tag';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeView } from '../retreat-home-view/retreat-home-view';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';

@Component({
  selector: 'app-retreat-home-data-grid',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule],
  templateUrl: './retreat-home-data-grid.html',
  providers: [DialogService],
})
export class RetreatHomeDataGrid {
  private retreatHomeService = inject(RetreatHomeService);

  @Input() item!: RetreatHome;
  @Input() showActions: boolean = true;
  @Input() enableSelection: boolean = false;

  loading = signal(false);

  constructor(private dialogService: DialogService) {}

  openRetreatHomeView(): void {
    this.dialogService.open(RetreatHomeView, {
      header: this.item.name,
      width: '70vw',
      modal: true,
      draggable: false,
      resizable: false,
      closable: true,
      focusOnShow: false,
      data: {
        retreatHome: this.item,
      },
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });
  }

  confirmToggleStatus(retreatHome: RetreatHome) {
    this.retreatHomeService.confirmToggleStatus(retreatHome, this.loading);
  }
}
