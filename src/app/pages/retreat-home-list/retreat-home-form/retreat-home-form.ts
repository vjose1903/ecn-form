import { CommonModule } from '@angular/common';
import { Component, inject, signal, ChangeDetectorRef, effect, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { FormControlName, FormFieldId } from './retreat-home-form.model';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { InputMaskModule } from 'primeng/inputmask';
import { TextareaModule } from 'primeng/textarea';
import { SkeletonModule } from 'primeng/skeleton';
import { FileI } from '@core/entities/file/file.model';
import { FileClass } from '@core/entities/file/file.class';
import { FileService } from '@core/entities/file/file.service';
import { fun } from '@core/services/functions.service';
import { UrlValidator } from '@core/typescript/validate-url';
import { RetreatHomeService } from '@core/entities/retreat-home/retreat-home.service';
import { Ss } from '@core/services/singleton.service';
import { AuthService } from '@core/services/auth.service';
import { GalleryComponent } from '@core/components/gallery/gallery.component';
import { RetreatHome } from '@core/entities/retreat-home/retreat-home.class';
import { RetreatHomeI } from '@core/entities/retreat-home/retreat-home.model';

@Component({
  selector: 'app-retreat-home-form',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputNumberModule, ButtonModule, FormErrorMsgComponent, InputTextModule, InputMaskModule, TextareaModule, SkeletonModule, DividerLine, GalleryComponent],
  templateUrl: './retreat-home-form.html',
  styleUrl: './retreat-home-form.scss',
})
export class RetreatHomeForm implements OnInit {
  private fb = inject(FormBuilder);
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  private cdr = inject(ChangeDetectorRef);
  private fileService = inject(FileService);
  private retreatHomeService = inject(RetreatHomeService);
  private authService = inject(AuthService);

  retreatHome!: RetreatHome | undefined;

  FormFieldId = FormFieldId;
  FormControlName = FormControlName;

  loading = signal(false);
  filesToDelete = signal<FileClass[]>([]);
  formGroup = signal<FormGroup | undefined>(undefined);

  get hasImages(): boolean {
    return this.imagesControl.length > 0;
  }

  get imagesControl() {
    return this.formGroup()?.get(FormControlName.images) as FormArray;
  }

  constructor() {
    effect(() => {
      const form = this.formGroup();
      if (form) {
        this.loading() ? form?.disable() : form?.enable();
      }
    });
  }

  ngOnInit(): void {
    if (this.config?.data?.retreatHome) this.retreatHome = this.config.data.retreatHome;

    this.createForm(this.retreatHome);
  }

  async createForm(retreatHome: RetreatHome | undefined) {
    const cityRef = await this.authService.current_user()?.cityRef;

    this.formGroup.set(
      this.fb.group({
        [FormControlName.id]: [retreatHome?.id ?? null, []],
        [FormControlName.name]: [retreatHome?.name ?? null, [Validators.required]],
        [FormControlName.phone]: [retreatHome?.phone ?? null, []],
        [FormControlName.address]: [retreatHome?.address ?? null, [Validators.required]],
        [FormControlName.location]: [retreatHome?.location ?? null, [Validators.required, UrlValidator.validate]],
        [FormControlName.city]: [cityRef, []],
        [FormControlName.is_active]: [retreatHome?.is_active ?? true, []],
        [FormControlName.images]: this.fb.array([]),
      })
    );

    if (retreatHome) {
      this.imagesControl.clear();
      retreatHome.imagesData.forEach(image => {
        this.addImage(image);
      });
    }
  }

  openGoogleMaps() {
    window.open('https://www.google.com/maps', '_blank');
  }

  onCancel() {
    this.ref.close();
  }

  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.addImage({ file: file, name: file.name, url: e.target.result });
          };
          reader.readAsDataURL(file);
        }
      }
    }
    // Limpiar el input para permitir seleccionar el mismo archivo nuevamente
    event.target.value = '';
  }

  addImage(image: FileI) {
    this.imagesControl.push(this.fb.control(image));
    this.cdr.detectChanges();
  }

  removeImage(index: number) {
    const fileRemoved = this.imagesControl.at(index).value;
    this.imagesControl.removeAt(index);
    if (fun.hasValue(fileRemoved.id)) this.filesToDelete.set([...this.filesToDelete(), fileRemoved]);
    this.cdr.detectChanges();
  }

  async parseImagesReferences(images: Array<FileClass | string>) {
    const promises = images.map(async image => {
      if (image instanceof FileClass) {
        return await image.getFileReference();
      } else {
        return this.fileService.getDocumentRef({ id: image });
      }
    });

    return await Promise.all(promises);
  }

  async onSubmit() {
    const form = this.formGroup();
    if (!form) return;

    try {
      this.loading.set(true);

      const formData = form.getRawValue();

      const filesToUpload = formData.images.filter((image: FileI) => !fun.hasValue(image.id)).map((file: FileI) => new FileClass(file));
      const filesSaved = formData.images.filter((image: FileI) => fun.hasValue(image.id));
      const filesToDelete = this.filesToDelete();

      // Subir archivos y obtener resultado detallado
      const uploadResult = await this.fileService.uploadFiles(filesToUpload);
      const { successful: uploadedFiles, failed: failedFiles } = uploadResult;

      // Eliminar archivos marcados para eliminar
      if (filesToDelete.length > 0) {
        try {
          await this.fileService.deleteFiles(filesToDelete);
        } catch (error) {
          console.warn('Error al eliminar algunos archivos:', error);
          // Continuamos aunque falle la eliminación
        }
      }

      // Preparar referencias de archivos (solo los exitosos)
      const filesReferences = await this.parseImagesReferences([...filesSaved, ...uploadedFiles]);

      formData.images = filesReferences;

      let retreatHome: RetreatHomeI | undefined;
      // Crear la casa de retiro
      if (formData.id) {
        retreatHome = await this.retreatHomeService._updateOne({ data: formData, find_by: 'id', find_value: formData.id });
      } else {
        retreatHome = await this.retreatHomeService._createOne({ data: formData });
      }

      // Mostrar mensaje según el resultado
      if (failedFiles.length === 0) {
        // Todo salió bien
        Ss.toastService.success({ message: formData.id ? 'Casa de Retiro editada correctamente' : 'Casa de Retiro creada correctamente' });
      } else {
        // Se creó la casa pero algunos archivos fallaron
        const failedCount = failedFiles.length;
        const totalCount = filesToUpload.length;
        Ss.toastService.warning({
          message: `Casa de Retiro ${formData.id ? 'editada' : 'creada'} correctamente, pero ${failedCount} de ${totalCount} imágenes no se subieron correctamente`,
        });
      }

      // Cerrar el dialog y devolver los datos
      this.ref.close(retreatHome);
    } catch (error) {
      console.error('Error al crear la casa de retiro:', error);

      // Determinar el tipo de error para mostrar mensaje apropiado
      if (error instanceof Error) {
        if (error.message.includes('archivo') || error.message.includes('imagen')) {
          Ss.toastService.error({ message: 'Error al procesar las imágenes. Intente nuevamente.' });
        } else {
          Ss.toastService.error({ message: 'Error al crear la casa de retiro. Intente nuevamente.' });
        }
      } else {
        Ss.toastService.error({ message: 'Error inesperado al crear la casa de retiro' });
      }
    } finally {
      this.loading.set(false);
    }
  }
}
