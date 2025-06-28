import { Component, effect, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, InputTextModule, PasswordModule, FormErrorMsgComponent, ButtonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  fb = inject(FormBuilder);
  auth = inject(AuthService);
  FormControlName = FormControlName;
  router = inject(Router);

  formGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  isLoading = signal(false);
  isGoogleLoading = signal(false);

  constructor() {
    // this.isLoading = true;

    effect(() => {
      this.changeFormStatus(this.isLoading() ? 'disable' : 'enable');
    });
  }

  ngOnInit() {
    // El manejo del redirect ahora se hace automáticamente en el AuthService
    // a través de onAuthStateChanged
  }

  onSubmit() {
    if (this.formGroup.valid) {
      this.isLoading.set(true);
      const payload: AuthPayload = this.formGroup.value as AuthPayload;

      this.auth.login(payload).finally(() => {
        this.isLoading.set(false);
      });
    }
  }

  onGoogleLogin() {
    console.log('🖱️ [Login] Botón de Google clickeado');
    this.isLoading.set(true);
    this.isGoogleLoading.set(true);

    // Para testing, usar popup en lugar de redirect
    console.log('🔄 [Login] Iniciando login con Google (popup)...');

    this.auth.loginWithGooglePopup().finally(() => {
      console.log('✅ [Login] Login con Google completado');
      this.isLoading.set(false);
      this.isGoogleLoading.set(false);
    });
  }

  changeFormStatus(status: 'disable' | 'enable') {
    this.formGroup.get('email')?.[status]();
    this.formGroup.get('password')?.[status]();
  }

  onTest() {
    this.router.navigateByUrl('/listado/retiros');
  }
}
