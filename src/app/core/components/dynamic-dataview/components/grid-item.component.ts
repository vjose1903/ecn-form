import { Component, Input } from '@angular/core';


@Component({
  selector: 'grid-item',
  standalone: true,
  imports: [],
  template: `
    <div class="grid-item p-3 border rounded shadow-sm">
      <div class="text-center">
        <div class="mb-3">
          <i class="pi pi-image text-4xl text-gray-400"></i>
        </div>
        <h5 class="m-0 mb-2">{{ item?.title || 'Sin título' }}</h5>
        <p class="text-gray-600 m-0 mb-3">{{ item?.description || 'Sin descripción' }}</p>
        <span class="badge bg-secondary">{{ item?.category || 'Sin categoría' }}</span>
      </div>
    </div>
  `,
  styles: [`
    .grid-item {
      transition: transform 0.2s, box-shadow 0.2s;
      height: 200px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .grid-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important;
    }
  `]
})
export class GridItemComponent {
  @Input() item: any;
} 