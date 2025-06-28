import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  credentials = {
    email: '',
    password: ''
  };
  
  isLoading = false;
  showPassword = false;

  constructor(private router: Router) {}

  onSubmit() {
    if (this.credentials.email && this.credentials.password) {
      this.isLoading = true;
      
      // Simular proceso de login
      setTimeout(() => {
        this.isLoading = false;
        // Aquí puedes agregar tu lógica de autenticación
        console.log('Login attempt:', this.credentials);
        // this.router.navigate(['/dashboard']);
      }, 2000);
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
