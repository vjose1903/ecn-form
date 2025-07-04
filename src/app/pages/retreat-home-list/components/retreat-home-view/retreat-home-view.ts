import { Component, inject, Input, OnInit, signal, OnDestroy } from '@angular/core';
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
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-home-view',
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule, TagModule, GalleriaModule, DividerLine, GalleryComponent],
  templateUrl: './retreat-home-view.html',
  styleUrl: './retreat-home-view.scss',
})
export class RetreatHomeView implements OnInit, OnDestroy {
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  private destroy$ = new Subject<void>();
  private toastService = inject(ToastService);

  retreatHome!: RetreatHome;

  displayCustom = false;
  activeIndex = 0;
  loading = signal(false);
  imagesLoaded = signal(0);

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

  ngOnInit(): void {
    this.retreatHome = this.config.data.retreatHome;
    this.preloadImages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Precarga las imágenes para mejor UX
   */
  private preloadImages(): void {
    if (!this.retreatHome.hasImages) {
      this.imagesLoaded.set(1);
      return;
    }

    let loadedCount = 0;
    const totalImages = this.retreatHome.imagesData.length;

    this.retreatHome.imagesData.forEach(image => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        this.imagesLoaded.set(loadedCount);
      };
      img.onerror = () => {
        loadedCount++;
        this.imagesLoaded.set(loadedCount);
      };
      img.src = image.url;
    });
  }

  /**
   * Obtiene las imágenes para la galería
   */
  get galleryImages(): any[] {
    return this.retreatHome.imagesData.map((image: any) => ({
      itemImageSrc: image.url,
      alt: image.name || this.retreatHome.displayName,
      title: image.name || this.retreatHome.displayName,
    }));
  }

  /**
   * Obtiene el progreso de carga de imágenes
   */
  get imagesLoadProgress(): number {
    if (!this.retreatHome.hasImages) return 100;
    return Math.round((this.imagesLoaded() / this.retreatHome.imagesData.length) * 100);
  }

  /**
   * Verifica si todas las imágenes están cargadas
   */
  get allImagesLoaded(): boolean {
    if (!this.retreatHome.hasImages) return true;
    return this.imagesLoaded() >= this.retreatHome.imagesData.length;
  }

  /**
   * Abre la ubicación en Google Maps
   */
  openOnGoogleMaps(): void {
    if (this.retreatHome.hasLocation) {
      window.open(this.retreatHome.location, '_blank');
    } else {
      this.toastService.warning({
        message: 'No hay ubicación disponible',
        title: 'Ubicación no disponible',
      });
    }
  }

  /**
   * Abre el formulario de edición
   */
  openEditForm(): void {
    if (this.loading()) return;

    this.ref.close();
    this.retreatHome.openForm().catch(error => {
      console.error('Error al abrir formulario:', error);
    });
  }

  /**
   * Confirma el cambio de estado
   */
  confirmToggleStatus(): void {
    if (this.loading()) return;

    this.retreatHome
      .confirmToggleStatus(this.retreatHome)
      .then(() => {
        this.ref.close();
      })
      .finally(() => this.loading.set(false));
  }

  /**
   * Obtiene el texto del botón de estado
   */
  getStatusButtonText(): string {
    if (this.loading()) {
      return this.retreatHome.is_active ? 'Desactivando...' : 'Activando...';
    }
    return this.retreatHome.is_active ? 'Desactivar' : 'Reactivar';
  }

  /**
   * Obtiene el icono del botón de estado
   */
  getStatusButtonIcon(): string {
    if (this.loading()) {
      return 'pi pi-spinner pi-spin';
    }
    return this.retreatHome.is_active ? 'pi pi-trash' : 'pi pi-undo';
  }

  /**
   * Obtiene la severidad del botón de estado
   */
  getStatusButtonSeverity(): 'danger' | 'success' {
    return this.retreatHome.is_active ? 'danger' : 'success';
  }

  /**
   * Obtiene el texto de información de contacto
   */
  getContactInfoText(): string {
    if (this.retreatHome.hasPhone) {
      return this.retreatHome.phone;
    }
    return 'Sin teléfono definido';
  }

  /**
   * Obtiene la clase CSS para el estado de carga
   */
  getLoadingClass(): string {
    return this.loading() ? 'opacity-50 pointer-events-none' : '';
  }

  /**
   * Cierra el diálogo
   */
  closeDialog(): void {
    this.ref.close();
  }
}
