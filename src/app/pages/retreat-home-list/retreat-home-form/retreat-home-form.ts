import { CommonModule } from '@angular/common';
import { Component, inject, signal, ChangeDetectorRef, effect, OnInit, OnDestroy, NgZone, ChangeDetectionStrategy } from '@angular/core';
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
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';

@Component({
  selector: 'app-retreat-home-form',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputNumberModule, ButtonModule, FormErrorMsgComponent, InputTextModule, InputMaskModule, TextareaModule, SkeletonModule, DividerLine, GalleryComponent],
  templateUrl: './retreat-home-form.html',
  styleUrl: './retreat-home-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetreatHomeForm implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private fileService = inject(FileService);
  private retreatHomeService = inject(RetreatHomeService);
  private authService = inject(AuthService);

  retreatHome!: RetreatHome | undefined;

  FormFieldId = FormFieldId;
  FormControlName = FormControlName;

  loading = signal(false);
  filesToDelete = signal<FileClass[]>([]);
  formGroup = signal<FormGroup | undefined>(undefined);
  uploadProgress = signal<number>(0);
  isFormValid = signal<boolean>(false);
  hasImages = signal<boolean>(false);

  private destroy$ = new Subject<void>();
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly MAX_FILES = 10;

  get imagesControl() {
    return this.formGroup()?.get(FormControlName.images) as FormArray;
  }

  get canAddMoreImages(): boolean {
    return this.imagesControl.length < this.MAX_FILES;
  }

  get uploadProgressText(): string {
    return `${this.uploadProgress()}%`;
  }

  constructor() {
    this.setupFormEffects();
  }

  ngOnInit(): void {
    if (this.config?.data?.retreatHome) {
      this.retreatHome = this.config.data.retreatHome;
    }

    this.createForm(this.retreatHome);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Configura los efectos del formulario
   */
  private setupFormEffects(): void {
    effect(() => {
      const form = this.formGroup();
      if (form) {
        this.loading() ? form?.disable() : form?.enable();

        // Validar formulario en tiempo real
        this.isFormValid.set(form.valid && this.hasValidImages());
      }
    });

    // Debounce para validaciones
    effect(() => {
      const form = this.formGroup();
      if (form) {
        form.valueChanges.pipe(takeUntil(this.destroy$), debounceTime(300), distinctUntilChanged()).subscribe(() => {
          this.isFormValid.set(form.valid && this.hasValidImages());
        });
      }
    });
  }

  /**
   * Verifica si las imágenes son válidas
   */
  private hasValidImages(): boolean {
    const images = this.imagesControl.value;
    return images.every((img: FileI) => img && (img.id || img.url));
  }

  /**
   * Crea el formulario
   */
  async createForm(retreatHome: RetreatHome | undefined) {
    try {
      const cityRef = await this.authService.current_user()?.cityRef;

      this.formGroup.set(
        this.fb.group({
          [FormControlName.id]: [retreatHome?.id ?? null, []],
          [FormControlName.name]: [retreatHome?.name ?? null, [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
          [FormControlName.phone]: [retreatHome?.phone ?? null, [Validators.pattern(/^\(\d{3}\) \d{3}-\d{4}$/)]],
          [FormControlName.address]: [retreatHome?.address ?? null, [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
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
      } else {
        // Inicializar la señal hasImages
        this.hasImages.set(false);
      }
    } catch (error) {
      console.error('Error al crear formulario:', error);
      Ss.toastService.error({
        message: 'Error al inicializar el formulario',
        title: 'Error',
      });
    }
  }

  /**
   * Abre Google Maps
   */
  openGoogleMaps() {
    window.open('https://www.google.com/maps', '_blank');
  }

  /**
   * Cancela la operación
   */
  onCancel() {
    if (this.hasUnsavedChanges()) {
      Ss.confirmationService.confirm({
        message: '¿Estás seguro de que quieres cancelar? Los cambios no guardados se perderán.',
        header: 'Confirmar cancelación',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Si, cancelar',
        rejectLabel: 'No, continuar',
        accept: () => this.ref.close(),
      });
    } else {
      this.ref.close();
    }
  }

  /**
   * Verifica si hay cambios sin guardar
   */
  private hasUnsavedChanges(): boolean {
    const form = this.formGroup();
    if (!form) return false;

    return form.dirty || this.filesToDelete().length > 0;
  }

  /**
   * Maneja la selección de archivos
   */
  onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (!files) return;

    const validFiles: File[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        errors.push(`${file.name} no es una imagen válida`);
        continue;
      }

      // Validar tamaño
      if (file.size > this.MAX_FILE_SIZE) {
        errors.push(`${file.name} excede el tamaño máximo de 5MB`);
        continue;
      }

      // Validar cantidad máxima
      if (this.imagesControl.length + validFiles.length >= this.MAX_FILES) {
        errors.push(`Máximo ${this.MAX_FILES} imágenes permitidas`);
        break;
      }

      validFiles.push(file);
    }

    // Mostrar errores si los hay
    if (errors.length > 0) {
      Ss.toastService.warning({
        message: errors.join('\n'),
        title: 'Archivos inválidos',
      });
    }

    // Procesar archivos válidos
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        // Usar NgZone.run para asegurar que los cambios se detecten correctamente
        this.ngZone.run(() => {
          this.addImage({
            file: file,
            name: file.name,
            url: e.target.result,
          });
        });
      };
      reader.readAsDataURL(file);
    });

    // Limpiar input
    event.target.value = '';
  }

  /**
   * Agrega una imagen al formulario
   */
  addImage(image: FileI) {
    if (this.imagesControl.length >= this.MAX_FILES) {
      Ss.toastService.warning({
        message: `Máximo ${this.MAX_FILES} imágenes permitidas`,
        title: 'Límite alcanzado',
      });
      return;
    }

    this.imagesControl.push(this.fb.control(image));
    // Actualizar la señal de hasImages
    this.hasImages.set(this.imagesControl.length > 0);
    // Marcar para detección de cambios
    this.cdr.markForCheck();
  }

  /**
   * Remueve una imagen del formulario
   */
  removeImage(index: number) {
    const fileRemoved = this.imagesControl.length > index ? this.imagesControl.at(index).value : null;
    this.imagesControl.removeAt(index);

    if (fileRemoved && fun.hasValue(fileRemoved.id)) {
      this.filesToDelete.set([...this.filesToDelete(), fileRemoved]);
    }

    // Actualizar la señal de hasImages
    this.hasImages.set(this.imagesControl.length > 0);
    // Marcar para detección de cambios
    this.cdr.markForCheck();
  }

  /**
   * Parsea las referencias de imágenes
   */
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

  /**
   * Envía el formulario
   */
  async onSubmit() {
    const form = this.formGroup();
    if (!form || !form.valid) {
      Ss.toastService.error({
        message: 'Por favor, completa todos los campos requeridos',
        title: 'Formulario inválido',
      });
      return;
    }

    try {
      this.loading.set(true);
      this.uploadProgress.set(0);

      const formData = form.getRawValue();
      const validationErrors = this.validateFormData(formData);

      if (validationErrors.length > 0) {
        Ss.toastService.error({
          message: validationErrors.join('\n'),
          title: 'Datos inválidos',
        });
        return;
      }

      const result = await this.processFormSubmission(formData);

      console.log('RESULTADO', result);

      // Cerrar el dialog y devolver los datos
      this.ref.close(result);
    } catch (error) {
      console.error('Error al procesar formulario:', error);
      this.handleSubmissionError(error);
    } finally {
      this.loading.set(false);
      this.uploadProgress.set(0);
    }
  }

  /**
   * Valida los datos del formulario
   */
  private validateFormData(formData: any): string[] {
    const errors: string[] = [];

    if (!formData.name?.trim()) {
      errors.push('El nombre es requerido');
    }

    if (!formData.address?.trim()) {
      errors.push('La dirección es requerida');
    }

    if (!formData.location?.trim()) {
      errors.push('La ubicación es requerida');
    }

    if (formData.phone && !formData.phone.match(/^\(\d{3}\) \d{3}-\d{4}$/)) {
      errors.push('El formato del teléfono debe ser (###) ###-####');
    }

    return errors;
  }

  /**
   * Procesa el envío del formulario
   */
  private async processFormSubmission(formData: any): Promise<RetreatHomeI> {
    const filesToUpload = formData.images.filter((image: FileI) => !fun.hasValue(image.id)).map((file: FileI) => new FileClass(file));

    const filesSaved = formData.images.filter((image: FileI) => fun.hasValue(image.id));

    const filesToDelete = this.filesToDelete();

    // Subir archivos con progreso
    const uploadResult = await this.uploadFilesWithProgress(filesToUpload);
    const { successful: uploadedFiles, failed: failedFiles } = uploadResult;

    // Eliminar archivos marcados para eliminar
    if (filesToDelete.length > 0) {
      await this.deleteFiles(filesToDelete);
    }

    // Preparar referencias de archivos
    const filesReferences = await this.parseImagesReferences([...filesSaved, ...uploadedFiles]);
    formData.images = filesReferences;

    // Crear o actualizar la casa de retiro
    let retreatHome: RetreatHomeI;
    if (formData.id) {
      retreatHome = await this.retreatHomeService.updateRetreatHome(formData);
    } else {
      console.log('CREAR NUEVO');

      retreatHome = await this.retreatHomeService.createRetreatHome(formData);
    }

    // Mostrar advertencia si algunos archivos fallaron
    if (failedFiles.length > 0) {
      const failedCount = failedFiles.length;
      const totalCount = filesToUpload.length;
      Ss.toastService.warning({
        message: `Algunos archivos (${failedCount}/${totalCount}) no se subieron correctamente`,
        title: 'Advertencia',
      });
    }

    return retreatHome;
  }

  /**
   * Sube archivos con progreso
   */
  private async uploadFilesWithProgress(files: FileClass[]): Promise<{ successful: FileClass[]; failed: FileClass[] }> {
    if (files.length === 0) {
      return { successful: [], failed: [] };
    }

    const successful: FileClass[] = [];
    const failed: FileClass[] = [];
    let completed = 0;

    const uploadPromises = files.map(async file => {
      try {
        const result = await this.fileService.uploadFile(file);
        successful.push(result);
      } catch (error) {
        console.error('Error al subir archivo:', error);
        failed.push(file);
      } finally {
        completed++;
        this.uploadProgress.set(Math.round((completed / files.length) * 100));
      }
    });

    await Promise.all(uploadPromises);
    return { successful, failed };
  }

  /**
   * Elimina archivos
   */
  private async deleteFiles(files: FileClass[]): Promise<void> {
    try {
      await this.fileService.deleteFiles(files);
    } catch (error) {
      console.warn('Error al eliminar algunos archivos:', error);
      // Continuamos aunque falle la eliminación
    }
  }

  /**
   * Maneja errores de envío
   */
  private handleSubmissionError(error: any): void {
    let message = 'Error inesperado al procesar el formulario';

    if (error instanceof Error) {
      if (error.message.includes('archivo') || error.message.includes('imagen')) {
        message = 'Error al procesar las imágenes. Intente nuevamente.';
      } else if (error.message.includes('red') || error.message.includes('conexión')) {
        message = 'Error de conexión. Verifique su internet e intente nuevamente.';
      } else {
        message = error.message;
      }
    }

    Ss.toastService.error({
      message,
      title: 'Error',
    });
  }
}
