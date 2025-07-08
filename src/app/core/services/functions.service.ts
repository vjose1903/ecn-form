import { RetryOptions } from '@core/interfaces/retry-until';
import { Ss } from './singleton.service';
import { BirthDate } from '@core/entities/request/request.model';

export class fun {
  /**
   * Helper function to round up to the next ten
   * @param numero - The number to round up
   * @returns number - The rounded up number
   */
  static roundDecenaMayor(numero: number): number {
    return Math.ceil(numero / 10) * 10;
  }

  /**
   * Nombre: getActualPathName
   * Descripcion : Esta funcion obtiene el path actual de la url
   * @returns string - The actual path name
   */
  static getActualPathName() {
    const actualPath = window.location.pathname;
    const parameters = window.location.search;
    return `${actualPath}${fun.hasValue(parameters) ? parameters : ''}`;
  }

  /**
   * Nombre: isEmpty
   * Descripcion : Esta funcion valida que si una variable esta vacia
   * @param value - The value to validate
   * @returns boolean - True if the value is empty, false otherwise
   */
  static isEmpty(value: any) {
    if (value instanceof Function) return false;
    if (value === null || value === undefined) return true;

    if (value instanceof Date) return isNaN(value.getTime());

    if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Nombre: hasValue
   * Descripcion : Esta funcion valida que si una variable tiene valor
   * @param value - The value to validate
   * @returns boolean - True if the value is not empty, false otherwise
   */
  static hasValue(value: any): boolean {
    return !fun.isEmpty(value);
  }

  /**
   * Nombre: convertFirebaseTimestamp
   * Descripcion : Esta funcion convierte un objeto Timestamp de Firebase a string de fecha ISO
   * @param timestamp - The timestamp to convert
   * @returns string - The converted timestamp
   */
  static convertFirebaseTimestamp(timestamp: any): string {
    if (!timestamp) return '';

    // Si ya es un string, devolverlo tal como está
    if (typeof timestamp === 'string') {
      return timestamp;
    }

    // Si es un objeto Timestamp de Firebase con seconds
    if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
      const date = new Date(timestamp.seconds * 1000);
      return date.toISOString();
    }

    // Si es un objeto Date
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    // Si es un número (timestamp en milisegundos)
    if (typeof timestamp === 'number') {
      const date = new Date(timestamp);
      return date.toISOString();
    }

    return '';
  }

  /**
   * Calcula la edad a partir de una fecha de nacimiento
   * @param birthDate - Fecha de nacimiento (puede ser Date, string, o BirthDate de Firebase)
   * @returns La edad en años
   */
  static calculateAge(birthDate: Date | string | BirthDate | null | undefined): number {
    if (!birthDate) return 0;

    let date: Date;

    // Convertir diferentes tipos de fecha a Date
    if (typeof birthDate === 'string') {
      date = new Date(birthDate);
    } else if (birthDate instanceof Date) {
      date = birthDate;
    } else if (typeof birthDate === 'object' && 'seconds' in birthDate) {
      // Es un timestamp de Firebase
      date = new Date(birthDate.seconds * 1000);
    } else {
      return 0;
    }

    // Verificar que la fecha sea válida
    if (isNaN(date.getTime())) return 0;

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();

    // Si aún no ha cumplido años este año, restar 1
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
      age--;
    }

    return Math.max(0, age);
  }

  /**
   * Nombre: retryUntil
   * Descripcion : Esta funcion recibe una tarea y la repite hasta que las condiciones establecidas se cumplan
   * @param params - Las opciones de configuración
   * @param params.task - La tarea a ejecutar
   * @param params.retryWhen - La funcion que determina si se debe reintentar la tarea
   * @param params.actionAfterRetry - La funcion que se ejecuta después de cada reintento
   * @param params.actionIfNoSuccess - La funcion que se ejecuta si la tarea no tiene éxito
   * @param params.options - Las opciones de configuración
   * @returns void - No retorna nada
   */

  static async retryUntil<T>(params: { task: () => Promise<T>; retryWhen: (response: T) => boolean; actionAfterRetry: (response: T) => void; actionIfNoSuccess: () => void; options?: RetryOptions }): Promise<void> {
    const { task, retryWhen, actionAfterRetry, actionIfNoSuccess, options = {} } = params;
    const { delayBetweenRetries = 500, retryMax = 20, logError = false } = options;

    let retryCount = 0;

    const executeTask = async (): Promise<void> => {
      try {
        const response = await task();
        const shouldRetry = retryWhen(response);
        const hasRetries = retryCount < retryMax;

        if (shouldRetry && hasRetries) {
          retryCount++;
          await new Promise<void>(resolve => {
            setTimeout(() => {
              resolve();
              Ss.cdRef.detectChanges();
            }, delayBetweenRetries);
          });
          return executeTask();
        }

        if (shouldRetry && !hasRetries) {
          if (logError) {
            console.error(`Max number of retries (${retryMax}) reached`);
          }
          Ss.ngZone.run(() => actionIfNoSuccess());
        } else {
          Ss.ngZone.run(() => actionAfterRetry(response));
        }
      } catch (error) {
        if (logError) {
          console.error('Task execution failed:', error);
        }
        Ss.ngZone.run(() => actionIfNoSuccess());
      }
    };

    Ss.ngZone.runOutsideAngular(() => executeTask());
  }
}
