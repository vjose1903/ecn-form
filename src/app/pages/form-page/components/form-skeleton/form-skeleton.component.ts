import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-form-skeleton',
  standalone: true,
  imports: [CommonModule, SkeletonModule],
  templateUrl: './form-skeleton.component.html',
})
export class FormSkeletonComponent {
  // No additional logic needed for skeleton
  @Input() formType: 'new' | 'update' = 'new';
}
