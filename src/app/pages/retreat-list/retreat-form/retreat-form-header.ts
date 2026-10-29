import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';

@Component({
  selector: 'app-retreat-form-header',
  standalone: true,
  imports: [ButtonModule],
  template: `
    <div class="flex w-full items-center justify-between gap-3">
      <span class="min-w-0 truncate font-semibold">{{ config.header }}</span>
      <p-button icon="pi pi-cog" severity="secondary" [text]="true" ariaLabel="Configuración de devoluciones" (onClick)="config.data?.openRefundPolicy?.()" />
    </div>
  `,
  styles: `:host { display: block; width: 100%; }`,
})
export class RetreatFormHeader {
  protected readonly config = inject(DynamicDialogConfig);
}
