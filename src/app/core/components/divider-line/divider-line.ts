import { Component, Input, signal } from '@angular/core';

@Component({
  selector: 'divider-line',
  imports: [],
  template: `
    <div class="{{ separatorClass }}">
      <span class="h-px block {{ color }} w-full"></span>
    </div>
  `,
  styles: [],
})
export class DividerLine {
  @Input() color: string = 'bg-gray-200';
  @Input() separatorClass: string = 'py-2';
}
