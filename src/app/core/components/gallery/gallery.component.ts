import { GalleryOptions } from './../../../../../node_modules/@twogate/ngx-photo-gallery/lib/interfaces/photoswipe.d';
import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { PhotoGalleryModule } from '@twogate/ngx-photo-gallery';
import { FileClass } from '@core/entities/file/file.class';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'gallery',
  standalone: true,
  imports: [PhotoGalleryModule, CommonModule, ButtonModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss',
})
export class GalleryComponent {
  galleryImgs = input.required<Array<FileClass>>();
  classColumns = input<string>('columns-2 md:columns-3');

  showRemoveImage = input<boolean>(false);
  disableRemoveImage = input<boolean>(false);
  clickRemoveImage = output<number>();

  photoGalleryOptions: GalleryOptions = {
    arrowEl: true,
    zoomEl: true,
    indexIndicatorSep: ' - ',
  };

  
}
