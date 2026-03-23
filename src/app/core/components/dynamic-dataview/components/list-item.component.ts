import { Component, Input } from '@angular/core';


@Component({
  selector: 'list-item',
  standalone: true,
  imports: [],
  template: `
    <div class="list-item p-3 border-bottom">
      <div class="flex align-items-center">
        <div class="flex-grow-1">
          <h4 class="m-0">{{ item?.title || 'Sin título' }}</h4>
          <p class="text-gray-600 m-0">{{ item?.description || 'Sin descripción' }}</p>
        </div>
        <div class="ml-3">
          <span class="badge bg-primary">{{ item?.category || 'Sin categoría' }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .list-item {
      transition: background-color 0.2s;
    }
    
    .list-item:hover {
      background-color: #f8f9fa;
    }
  `]
})
export class ListItemComponent {
  @Input() item: any;
} 