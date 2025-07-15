import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { Ss } from '@core/services/singleton.service';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { UserService } from '@core/entities/user/user.service';
import { CityService } from '@core/entities/city/city.service';
import { CityClass } from '@core/entities/city/city.class';
import { FormControlName, FormFieldId } from './account.model';
import { InputMaskModule } from 'primeng/inputmask';

@Component({
  selector: 'app-account',
  imports: [CommonModule, ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, FormErrorMsgComponent, InputMaskModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private userService = inject(UserService);
  private cityService = inject(CityService);
  private config = inject(DynamicDialogConfig);
  private fb = inject(FormBuilder);
  private ref = inject(DynamicDialogRef);

  FormControlName = FormControlName;
  FormFieldId = FormFieldId;

  formGroup!: FormGroup;
  loading = signal(false);
  cities = signal<CityClass[]>([]);

  ngOnInit() {
    this.loadCities();
    this.initializeForm();
  }

  private async loadCities() {
    try {
      const cities = await this.cityService._getAll();
      this.cities.set(cities.map((city: any) => new CityClass(city)));
    } catch (error) {
      console.error('Error cargando ciudades:', error);
      Ss.toastService.error({ message: 'Error al cargar las ciudades', title: 'Error' });
    }
  }

  private initializeForm() {
    const currentUser = Ss.authService.current_user();

    this.formGroup = this.fb.group({
      [FormControlName.id]: [currentUser?.id],
      [FormControlName.email]: [{ value: currentUser?.email || '', disabled: true }, [Validators.required, Validators.email]],
      [FormControlName.city]: [currentUser?.city || '', [Validators.required]],
      [FormControlName.phone]: [currentUser?.phone || '', [Validators.required]],
    });
  }

  async onSubmit() {
    if (this.formGroup.invalid || this.loading()) return;

    this.loading.set(true);

    try {
      const currentUser = Ss.authService.current_user();
      if (!currentUser) throw new Error('Usuario no encontrado');

      const formData = this.formGroup.value;

      // Actualizar solo los campos editables
      const updateData = {
        id: currentUser.id,
        city: formData.city,
        phone: formData.phone,
      };

      const selectedCity = this.cities().find(city => city.id === formData.city);
      updateData.city = await selectedCity?.getCityRef();

      await this.userService._updateOne({ find_by: 'id', find_value: updateData.id, data: updateData });

      // Actualizar el usuario en el AuthService
      const updatedUser = await this.userService.getUserById(currentUser.id);

      if (updatedUser) {
        Ss.authService.current_user.set(updatedUser);
      }

      Ss.toastService.success({ message: 'Datos de cuenta actualizados correctamente', title: 'Éxito' });

      this.ref.close(true);
    } catch (error) {
      console.error('Error actualizando cuenta:', error);

      Ss.toastService.error({ message: 'Error al actualizar los datos de cuenta', title: 'Error' });
    } finally {
      this.loading.set(false);
    }
  }

  onCancel() {
    this.ref.close();
  }

  get isFormValid(): boolean {
    return this.formGroup.valid && !this.loading();
  }
}
