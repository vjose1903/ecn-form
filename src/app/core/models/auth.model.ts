import { AuthErrorCodes } from '@angular/fire/auth';

export interface AuthPayload {
  email: string;
  password: string;
}

// Interfaz simplificada para el resultado
export interface AuthResult {
  success: boolean;
  message?: string;
  title?: string;
  severity?: 'success' | 'error' | 'warn' | 'info';
}

export const errorMessages: Record<string, AuthResult> = {
  [AuthErrorCodes.INVALID_LOGIN_CREDENTIALS]: {
    success: false,
    message: 'Credenciales inválidas. Verifica que el email y contraseña sean correctos.',
    title: 'Credenciales inválidas',
    severity: 'error',
  },
  [AuthErrorCodes.USER_DELETED]: {
    success: false,
    message: 'Usuario no encontrado. Verifica que el email sea correcto.',
    title: 'Usuario no encontrado',
    severity: 'error',
  },
  [AuthErrorCodes.INVALID_PASSWORD]: {
    success: false,
    message: 'Contraseña incorrecta. Verifica tu contraseña.',
    title: 'Contraseña incorrecta',
    severity: 'error',
  },
  [AuthErrorCodes.INVALID_EMAIL]: {
    success: false,
    message: 'Email inválido. Ingresa un email válido.',
    title: 'Email inválido',
    severity: 'error',
  },
  [AuthErrorCodes.WEAK_PASSWORD]: {
    success: false,
    message: 'La contraseña es demasiado débil (mínimo 6 caracteres).',
    title: 'Contraseña débil',
    severity: 'error',
  },
  [AuthErrorCodes.EMAIL_EXISTS]: {
    success: false,
    message: 'Ya existe una cuenta con este email.',
    title: 'Cuenta existente',
    severity: 'error',
  },
  [AuthErrorCodes.NETWORK_REQUEST_FAILED]: {
    success: false,
    message: 'Error de conexión. Verifica tu internet.',
    title: 'Error de conexión',
    severity: 'error',
  },
  [AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER]: {
    success: false,
    message: 'Demasiados intentos fallidos. Intenta más tarde.',
    title: 'Demasiados intentos',
    severity: 'warn',
  },
  [AuthErrorCodes.USER_DISABLED]: {
    success: false,
    message: 'Esta cuenta ha sido deshabilitada.',
    title: 'Cuenta deshabilitada',
    severity: 'error',
  },
  [AuthErrorCodes.POPUP_CLOSED_BY_USER]: {
    success: false,
    message: 'Inicio de sesión cancelado.',
    title: 'Inicio de sesión cancelado',
    severity: 'info',
  },
  [AuthErrorCodes.POPUP_BLOCKED]: {
    success: false,
    message: 'El popup fue bloqueado. Permite popups para este sitio.',
    title: 'Popup bloqueado',
    severity: 'warn',
  },
  error: {
    success: false,
    message: 'Error inesperado. Intenta nuevamente.',
    title: 'Error inesperado',
    severity: 'error',
  },
};
