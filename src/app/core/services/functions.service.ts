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
}
