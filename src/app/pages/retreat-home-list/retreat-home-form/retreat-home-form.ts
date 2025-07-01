import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { FormControlName, FormFieldId } from './retreat-home-form.model';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { InputMaskModule } from 'primeng/inputmask';
import { TextareaModule } from 'primeng/textarea';

interface SelectedImage {
  file: File;
  preview: string;
}

@Component({
  selector: 'app-retreat-home-form',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputNumberModule, ButtonModule, FormErrorMsgComponent, InputTextModule, InputMaskModule, TextareaModule, DividerLine],
  templateUrl: './retreat-home-form.html',
  styleUrl: './retreat-home-form.scss',
})
export class RetreatHomeForm {
  private fb = inject(FormBuilder);
  private ref = inject(DynamicDialogRef);

  FormFieldId = FormFieldId;
  FormControlName = FormControlName;

  loading = signal(false);
  selectedImages: SelectedImage[] = [];

  formGroup: FormGroup = this.fb.group({
    [FormControlName.id]: [null],
    [FormControlName.name]: [null, [Validators.required]],
    [FormControlName.phone]: [null],
    [FormControlName.address]: [null, [Validators.required]],
    [FormControlName.location]: [null, [Validators.required]],
    [FormControlName.is_active]: [true],
    [FormControlName.images]: [[]],
  });

  constructor() {}

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
            this.selectedImages.push({
              file: file,
              preview: e.target.result
            });
            this.updateFormImages();
          };
          reader.readAsDataURL(file);
        }
      }
    }
    // Limpiar el input para permitir seleccionar el mismo archivo nuevamente
    event.target.value = '';
  }

  removeImage(index: number) {
    this.selectedImages.splice(index, 1);
    this.updateFormImages();
  }

  private updateFormImages() {
    const files = this.selectedImages.map(img => img.file);
    this.formGroup.patchValue({
      [FormControlName.images]: files
    });
  }

  onSubmit() {
    console.log(this.formGroup.getRawValue());
  }
}
