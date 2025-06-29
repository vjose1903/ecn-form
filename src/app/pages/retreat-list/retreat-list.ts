import { Component, OnDestroy } from '@angular/core';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { RetreatForm } from './retreat-form/retreat-form';

@Component({
  selector: 'app-retreat-list',
  imports: [ButtonModule],
  templateUrl: './retreat-list.html',
  styleUrl: './retreat-list.scss',
})
export class RetreatList implements OnDestroy {
  ref: DynamicDialogRef | undefined;

  constructor(public dialogService: DialogService) {
    // this.showNewRetreatDialog();
  }

  copyLink() {
    const user = Ss.authService.current_user();
    if (!user) {
      Ss.toastService.error({ message: 'No se pudo obtener el usuario' });
      Ss.authService.logout();
      return;
    }

    user.copyFormLink();
  }

  showNewRetreatDialog() {
    this.ref = this.dialogService.open(RetreatForm, {
      header: 'Nuevo Retiro',
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

  ngOnDestroy() {
    if (this.ref) {
      this.ref.close();
    }
  }
}
