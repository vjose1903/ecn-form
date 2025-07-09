import { Component, EventEmitter, Output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'error-message',
  imports: [ButtonModule],
  templateUrl: './error-message.html',
})
export class ErrorMessage {
  @Output() retry = new EventEmitter<void>();
  
  retrying = signal(false);

  onRetry() {
    this.retrying.set(true);
    
    // Emitir evento para que el componente padre maneje el reintento
    this.retry.emit();
    
    // Simular un pequeño delay para mostrar el loading
    setTimeout(() => {
      this.retrying.set(false);
    }, 1000);
  }

  onContactTeam() {
    // Mostrar información de contacto del equipo
    Ss.confirmationService.confirm({
      message: `
        <div class="text-left">
          <p class="mb-3"><strong>Equipo de Reclutamiento y Promoción</strong></p>
          <p class="mb-2"><strong>Email:</strong> reclutamiento@ecn.com</p>
          <p class="mb-2"><strong>Teléfono:</strong> (809) 555-0123</p>
          <p class="mb-2"><strong>Horario:</strong> Lunes a Viernes, 8:00 AM - 5:00 PM</p>
          <p class="text-sm text-gray-600 mt-3">
            Por favor, mencione que está teniendo problemas técnicos con el formulario de solicitud de retiro.
          </p>
        </div>
      `,
      header: 'Información de Contacto',
      icon: 'pi pi-info-circle',
      acceptLabel: 'Entendido',
      rejectLabel: 'Cerrar',
      acceptIcon: 'pi pi-check',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-primary',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: () => {},
      reject: () => {},
    });
  }
} 