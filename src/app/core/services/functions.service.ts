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
}
