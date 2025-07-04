import { Directive, Input, ViewContainerRef } from '@angular/core';

@Directive({
  selector: '[dynamicList]',
  standalone: true,
})
export class DynamicListDirective {
  @Input('dynamicList') dynamicList!: string;

  constructor(public viewContainerRef: ViewContainerRef) {}
} 