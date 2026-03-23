import { Component, effect, inject, signal, OnInit, OnDestroy } from '@angular/core';

import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { FormErrorMsgComponent } from '@core/components/form-error-msg/form-error-msg.component';
import { FormControlName } from './login.model';
import { AuthService } from '@core/services/auth.service';
import { AuthPayload } from '@core/models/auth.model';
import { fun } from '@core/services/functions.service';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-login',
  imports: [FormsModule, ReactiveFormsModule, InputTextModule, PasswordModule, FormErrorMsgComponent, ButtonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit, OnDestroy {
  fb = inject(FormBuilder);
  auth = inject(AuthService);
  FormControlName = FormControlName;
  router = inject(Router);

  formGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  // Usar el signal de loading del AuthService
  isLoading = this.auth.isLoading;

  isSubmitting = signal(false);

  private destroy$ = new Subject<void>();

  constructor() {
    // Efecto para manejar el estado de loading del AuthService
    effect(() => {
      const loading = this.isLoading();
      this.changeFormStatus(loading ? 'disable' : 'enable');
    });

    // Efecto para redirigir cuando el usuario se autentique
    effect(() => {
      const isAuthenticated = this.auth.isAuthenticated();
      if (isAuthenticated) {
        console.log('✅ [Login] Usuario autenticado, redirigiendo...');
        this.router.navigateByUrl('/retiros');
      }
    });
  }

  ngOnInit() {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onSubmit() {
    if (this.formGroup.valid && !this.isSubmitting()) {
      this.isSubmitting.set(true);
      const payload: AuthPayload = this.formGroup.value as AuthPayload;

      try {
        await this.auth.login(payload);
        // El efecto se encargará de la redirección
      } catch (error) {
        console.error('❌ [Login] Error en login:', error);
        // El error ya se maneja en el AuthService
      } finally {
        this.isSubmitting.set(false);
      }
    }
  }

  changeFormStatus(status: 'disable' | 'enable') {
    if (status === 'disable') {
      this.formGroup.get('email')?.disable();
      this.formGroup.get('password')?.disable();
    } else {
      this.formGroup.get('email')?.enable();
      this.formGroup.get('password')?.enable();
    }
  }

  // Método para testing (mantener por compatibilidad)
  onTest() {
    this.router.navigateByUrl('/retiros');
  }
}
