import { Component, inject } from '@angular/core';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TagModule } from 'primeng/tag';
import { RetreatClass } from '@core/entities/retreat/retreat.class';

@Component({
  selector: 'app-retreat-view-header',
  imports: [TagModule],
  templateUrl: './retreat-view-header.html',
  styleUrl: './retreat-view-header.scss',
})
export class RetreatViewHeader {
  readonly retreat = inject(DynamicDialogConfig<{ retreat: RetreatClass }>).data?.retreat;
  readonly ref = inject(DynamicDialogRef);
}
