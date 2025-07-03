import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeForm } from './retreat-home-form/retreat-home-form';
import { DynamicDataviewComponent, DynamicDataviewConfig } from '@core/components/dynamic-dataview';
import { RetreatHomeDataList } from './components/retreat-home-data-list/retreat-home-data-list';
import { RetreatHomeDataGrid } from './components/retreat-home-data-grid/retreat-home-data-grid';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';

@Component({
  selector: 'app-retreat-home-list',
  imports: [CommonModule, ButtonModule, DynamicDataviewComponent],
  templateUrl: './retreat-home-list.html',
  styleUrl: './retreat-home-list.scss',
})
export class RetreatHomeList implements OnInit {
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

  constructor(public dialogService: DialogService) {
    // this.showNewRetreatDialog();
  }

  ngOnInit(): void {
    // this.dataviewConfig.setData(this.dataviewConfig.data());
    this.getRetreatHomes();
  }

  getRetreatHomes() {
    this.retreatHomeService.getAll().then(retreats => {
      console.log('%c retreats', 'color: blue; font-weight: bold;', retreats);

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
