import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatHomeForm } from './retreat-home-form/retreat-home-form';

@Component({
  selector: 'app-retreat-home-list',
  imports: [CommonModule, ButtonModule],
  templateUrl: './retreat-home-list.html',
  styleUrl: './retreat-home-list.scss',
})
export class RetreatHomeList {
  ref: DynamicDialogRef | undefined;

  constructor(public dialogService: DialogService) {
    // this.showNewRetreatDialog();
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
        console.log('Retiro creado:', result);
        Ss.toastService.success({ message: 'Retiro creado exitosamente' });
      }
    });
  }
}
