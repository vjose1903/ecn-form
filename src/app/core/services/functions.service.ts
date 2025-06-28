import { Ss } from './singleton.service';

export class fun {
  /**
   * Nombre: setTimeOut
   * Descripcion : Esta funcion ejecuta una funcion despues de un tiempo
   * @param callback - The function to execute after the timeout
   * @param time - The time in milliseconds to wait before executing the callback
   * @returns The timeout ID that can be used to clear the timeout
   */
  static setTimeout(callback: () => void, time: number) {
    const timeout = setTimeout(() => {
      callback();
      Ss.cdRef.markForCheck();
    }, time);

    return timeout;
  }

  /**
   * Helper function to round up to the next ten
   * @param numero - The number to round up
   * @returns number - The rounded up number
   */
  static roundDecenaMayor(numero: number): number {
    return Math.ceil(numero / 10) * 10;
  }
}
