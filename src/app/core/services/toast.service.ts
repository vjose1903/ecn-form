import { inject, Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private messageService = inject(MessageService);

  error(args: { message: string; title?: string; life?: number }) {
    this.messageService.add({ severity: 'error', summary: args.title ?? 'Error', detail: args.message, life: args.life ?? 3000 });
  }

  success(args: { message: string; title?: string; life?: number }) {
    this.messageService.add({ severity: 'success', summary: args.title ?? 'Success', detail: args.message, life: args.life ?? 3000 });
  }

  warning(args: { message: string; title?: string; life?: number }) {
    this.messageService.add({ severity: 'warning', summary: args.title ?? 'Warning', detail: args.message, life: args.life ?? 3000 });
  }

  info(args: { message: string; title?: string; life?: number }) {
    this.messageService.add({ severity: 'info', summary: args.title ?? 'Info', detail: args.message, life: args.life ?? 3000 });
  }
}
