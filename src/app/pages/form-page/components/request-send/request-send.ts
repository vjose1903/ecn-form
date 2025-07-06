import { Component, EventEmitter, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'request-send',
  imports: [ButtonModule],
  templateUrl: './request-send.html',
})
export class RequestSend {
  @Output() close = new EventEmitter<void>();

  onClose() {
    this.close.emit();
  }
}
