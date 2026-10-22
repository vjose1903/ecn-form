import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Auth, confirmPasswordReset, verifyPasswordResetCode } from '@angular/fire/auth';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-create-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonModule],
  templateUrl: './create-password.html',
  styleUrl: './create-password.scss',
})
export class CreatePassword implements OnInit {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly email = signal('');
  readonly code = signal('');
  readonly error = signal('');
  readonly complete = signal(false);
  password = '';
  confirmPassword = '';

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('oobCode') ?? '';
    if (params.get('mode') !== 'resetPassword' || !code) {
      this.error.set('El enlace no es válido. Solicita una nueva invitación al administrador.');
      this.loading.set(false);
      return;
    }

    this.code.set(code);
    try {
      this.email.set(await verifyPasswordResetCode(this.auth, code));
    } catch {
      this.error.set('El enlace venció o ya fue utilizado. Solicita una nueva invitación al administrador.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.error.set('');
    if (this.password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }

    this.submitting.set(true);
    try {
      await confirmPasswordReset(this.auth, this.code(), this.password);
      this.complete.set(true);
      this.password = this.confirmPassword = '';
    } catch {
      this.error.set('No se pudo guardar la contraseña. El enlace puede haber vencido; solicita una nueva invitación.');
    } finally {
      this.submitting.set(false);
    }
  }
}
