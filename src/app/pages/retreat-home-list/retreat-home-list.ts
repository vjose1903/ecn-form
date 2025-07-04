import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeForm } from './retreat-home-form/retreat-home-form';
import { DynamicDataviewComponent, DynamicDataviewConfig } from '@core/components/dynamic-dataview';
import { RetreatHomeDataList } from './components/retreat-home-data-list/retreat-home-data-list';
import { RetreatHomeDataGrid } from './components/retreat-home-data-grid/retreat-home-data-grid';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-home-list',
  imports: [CommonModule, ButtonModule, DynamicDataviewComponent],
  templateUrl: './retreat-home-list.html',
  styleUrl: './retreat-home-list.scss',
})
export class RetreatHomeList implements OnInit, OnDestroy {
  private retreatHomeService = inject(RetreatHomeService);
  ref: DynamicDialogRef | undefined;

  dataviewConfig = new DynamicDataviewConfig({
    listComponent: RetreatHomeDataList,
    gridComponent: RetreatHomeDataGrid,
    layout: 'list',
    componentProps: { showActions: true, enableSelection: false },
    pagination: { enabled: false, rows: 5, totalRecords: 4 },
    sortField: 'title',
    sortOrder: 1,
  });

  private onDestroy$: Subject<void> = new Subject<void>();

  constructor(public dialogService: DialogService) {
    // this.showNewRetreatDialog();
  }

  ngOnInit(): void {
    this.getRetreatHomes();
    this.retreatHomeService.reload$.pipe(takeUntil(this.onDestroy$)).subscribe(reload => {
      console.log('%c reload', 'color: lime >>>>; font-weight: bold;', reload);
      if (reload) {
        this.getRetreatHomes();
        this.retreatHomeService.setReload(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  getRetreatHomes() {
    this.retreatHomeService.getAll().then(retreats => {
      console.log('%c retreats', 'color: blue; font-weight: bold;', JSON.stringify(retreats));

      this.dataviewConfig.setData(retreats);
    });
  }

  showNewRetreatDialog() {
    this.ref = this.dialogService.open(RetreatHomeForm, {
      header: 'Nueva Casa de Retiro',
      width: '70%',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      maximizable: true,
      modal: true,
      breakpoints: { '960px': '75vw', '640px': '90vw' },
    });

    this.ref.onClose.subscribe(result => {
      if (result) {
        // Aquí puedes manejar el resultado del formulario
      }
    });
  }
}
