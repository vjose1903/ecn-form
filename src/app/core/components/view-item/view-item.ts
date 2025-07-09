import { Component, input } from '@angular/core';

@Component({
  selector: 'view-item',
  imports: [],
  templateUrl: './view-item.html',
  styleUrl: './view-item.scss',
})
export class ViewItem {
  isRow = input<boolean>(false);
  content = input<string>('');
  title = input.required<string>();
  icon = input.required<string>();
}
