import { Directive, Input, ViewContainerRef } from '@angular/core';

@Directive({
  selector: '[dynamicGrid]',
  standalone: true,
})
export class DynamicGridDirective {
  @Input('dynamicGrid') dynamicGrid!: string;

  constructor(public viewContainerRef: ViewContainerRef) {}
} 