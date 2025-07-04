import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { GalleriaModule } from 'primeng/galleria';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { GalleryComponent } from '@core/components/gallery/gallery.component';
import { ConfirmationService } from 'primeng/api';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-retreat-home-view',
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule, GalleriaModule, DividerLine, GalleryComponent],
  templateUrl: './retreat-home-view.html',
  styleUrl: './retreat-home-view.scss',
})
export class RetreatHomeView implements OnInit {
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  private retreatHomeService = inject(RetreatHomeService);

  retreatHome!: RetreatHome;

  displayCustom = false;
  activeIndex = 0;
  loading = signal(false);
  responsiveOptions: any[] = [
    {
      breakpoint: '1024px',
      numVisible: 5,
    },
    {
      breakpoint: '768px',
      numVisible: 3,
    },
    {
      breakpoint: '560px',
      numVisible: 1,
    },
  ];

  constructor() {}

  get galleryImages(): any[] {
    return this.retreatHome.imagesData.map((image: any) => ({
      itemImageSrc: image.url,
      alt: image.name,
      title: image.name,
    }));
  }

  ngOnInit(): void {
    this.retreatHome = this.config.data.retreatHome;
  }

  openOnGoogleMaps(): void {
    window.open(this.retreatHome.location, '_blank');
  }

  openEditForm() {
    this.ref.close();
  }

  confirmToggleStatus() {
    this.retreatHomeService.confirmToggleStatus(this.retreatHome, this.loading, this.ref);
  }
}
