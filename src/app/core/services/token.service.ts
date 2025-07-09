import { Injectable, inject } from '@angular/core';
import { Auth, getIdTokenResult, User } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class TokenService {
  private auth = inject(Auth);

  /**
   * Verifica si un token está próximo a expirar
   * @param user Usuario de Firebase
   * @param thresholdMinutes Minutos antes de la expiración para considerar renovación
   * @returns true si el token expira pronto
   */
  async isTokenExpiringSoon(user: User, thresholdMinutes: number = 10): Promise<boolean> {
    try {
      const tokenResult = await getIdTokenResult(user);
      
      if (!tokenResult.expirationTime) {
        return false;
      }

      const expirationTime = new Date(tokenResult.expirationTime).getTime();
      const currentTime = Date.now();
      const timeUntilExpiration = expirationTime - currentTime;
      const thresholdMs = thresholdMinutes * 60 * 1000;

      return timeUntilExpiration < thresholdMs;
    } catch (error) {
      console.error('❌ [TokenService] Error verificando expiración de token:', error);
      return true; // Asumir que está expirando si hay error
    }
  }

  /**
   * Verifica si un token es válido
   * @param user Usuario de Firebase
   * @returns true si el token es válido
   */
  async isTokenValid(user: User): Promise<boolean> {
    try {
      const tokenResult = await getIdTokenResult(user);
      
      if (!tokenResult.expirationTime) {
        return false;
      }

      const expirationTime = new Date(tokenResult.expirationTime).getTime();
      const currentTime = Date.now();

      return expirationTime > currentTime;
    } catch (error) {
      console.error('❌ [TokenService] Error verificando validez de token:', error);
      return false;
    }
  }

  /**
   * Renueva el token del usuario
   * @param user Usuario de Firebase
   * @returns true si se renovó exitosamente
   */
  async refreshToken(user: User): Promise<boolean> {
    try {
      await user.getIdToken(true); // Force refresh
      console.log('✅ [TokenService] Token renovado exitosamente');
      return true;
    } catch (error) {
      console.error('❌ [TokenService] Error renovando token:', error);
      return false;
    }
  }

  /**
   * Obtiene el tiempo restante hasta la expiración del token
   * @param user Usuario de Firebase
   * @returns Tiempo en milisegundos, null si no se puede obtener
   */
  async getTimeUntilExpiration(user: User): Promise<number | null> {
    try {
      const tokenResult = await getIdTokenResult(user);
      
      if (!tokenResult.expirationTime) {
        return null;
      }

      const expirationTime = new Date(tokenResult.expirationTime).getTime();
      const currentTime = Date.now();
      
      return Math.max(0, expirationTime - currentTime);
    } catch (error) {
      console.error('❌ [TokenService] Error obteniendo tiempo de expiración:', error);
      return null;
    }
  }
} 