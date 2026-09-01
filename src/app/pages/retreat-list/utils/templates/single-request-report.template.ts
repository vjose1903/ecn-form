import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { PdfTemplate, CityInfo, RetreatInfo } from '../pdf.service';
import { fun } from '@core/services/functions.service';

@Injectable()
export class SingleRequestReportTemplate implements PdfTemplate {
  orientation: 'portrait' | 'landscape' = 'portrait';

  async generateContent(doc: jsPDF, data: { request: any; retreatInfo: RetreatInfo }, cityInfo?: CityInfo): Promise<void> {
    const { request, retreatInfo } = data;

    const { she, he } = request;

    // Título del documento
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Reporte de Solicitud Individual', 105, 30, { align: 'center' });

    // Información del retiro
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Información del Retiro', 5, 45);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    this.addField(doc, 'Rango de Fechas:', retreatInfo.dateRange, 5, 52);

    // Información de la Novia

    // Información Personal de la Novia
    this.addPersonalInfo(doc, she, 70, 'Información de la Novia');

    // Salto de página para la información del novio
    doc.addPage();
    
    // Información del Novio en nueva página
    this.addPersonalInfo(doc, he, 30, 'Información del Novio');
  }

  /**
   * Agrega la información personal completa de una persona (she o he)
   * @param doc - Documento PDF
   * @param person - Objeto con la información de la persona (she o he)
   * @param initialY - Posición Y inicial
   * @param sectionTitle - Título de la sección
   * @returns La posición Y final después de agregar toda la información
   */
  private addPersonalInfo(doc: jsPDF, person: any, initialY: number, sectionTitle: string): number {
    let currentY = initialY;

    // Título de la sección
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(sectionTitle, 5, currentY);
    currentY += 7;

    // Nombre completo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    this.addField(doc, 'Nombre Completo:', person?.full_name, 5, currentY);
    currentY += 7;

    // Cédula y Fecha de Nacimiento en dos columnas
    if (person?.identity_number || person?.cedula) {
      const cedulaValue = person?.identity_number ? `${person.identity_number} (${person.identity_type})` : person?.cedula;
      
      // Columna izquierda - Cédula
      this.addColumn(doc, 5, currentY, 300, { type: 'field', label: 'Cédula:', value: cedulaValue });
      
      // Columna derecha - Fecha de Nacimiento
      this.addColumn(doc, 100, currentY, 140, { type: 'field', label: 'Fecha de Nacimiento:', value: person?.birth_date });
      currentY += 7;
    }

    // Teléfonos en columnas
    if (person?.cell_phone || person?.phone) {
      const phoneValue = person?.cell_phone || person?.phone;
      
      // Columna izquierda - Celular/Teléfono principal
      this.addColumn(doc, 5, currentY, 100, { type: 'field', label: 'Celular:', value: phoneValue });
      
      // Columna centro - casa (si existe)
      if (fun.hasValue(person?.home_phone)) {
        this.addColumn(doc, 60, currentY, 100, { type: 'field', label: 'Tel. Casa:', value: person?.home_phone });
      }
      
      // Columna derecha - trabajo (si existe)
      if (fun.hasValue(person?.work_phone)) {
        const workPhoneX = person?.home_phone ? 120 : 60;
        this.addColumn(doc, workPhoneX, currentY, 100, { type: 'field', label: 'Tel. Trabajo:', value: person?.work_phone });
      }
      currentY += 7;
    }

    // Email
    if (person?.email) {
      this.addField(doc, 'Email:', person.email, 5, currentY);
      currentY += 7;
    }

    // Dirección
    if (person?.address) {
      this.addField(doc, 'Dirección:', person.address, 5, currentY);
      currentY += 7;
    }

    // Ciudad
    if (person?.city_of_residence) {
      this.addField(doc, 'Ciudad:', person.city_of_residence, 5, currentY);
      currentY += 7;
    }

    // Campos booleanos específicos de she
    if (person?.are_you_married !== undefined) {
      this.addField(doc, '¿Ha estado casado por la Iglesia?:', person.are_you_married ? 'Sí' : 'No', 5, currentY);
      currentY += 7;
    }

    if (person?.have_children !== undefined) {
      this.addField(doc, '¿Tiene hijos?:', person.have_children ? 'Sí' : 'No', 5, currentY);
      currentY += 7;
    }

    if (person?.religion) {
      this.addField(doc, 'Religión:', this.formatReligionDisplay(person), 5, currentY);
      currentY += 7;
    }

    if (person?.church_name) {
      this.addField(doc, 'Parroquia:', person.church_name, 5, currentY);
      currentY += 15;
    }

    // Contactos de Emergencia
    if (person?.emergency_full_name) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Contacto de Emergencia', 5, currentY);
      currentY += 7;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      this.addField(doc, 'Nombre:', person.emergency_full_name, 5, currentY);
      currentY += 7;
      
      // Columna izquierda - Parentesco
      this.addColumn(doc, 5, currentY, 100, { type: 'field', label: 'Parentesco:', value: person.emergency_relationship });
      // Columna derecha - Teléfono
      this.addColumn(doc, 60, currentY, 150, { type: 'field', label: 'Teléfono:', value: person.emergency_phone });
      currentY += 15;
    }

    // Información Familiar
    if (person?.family_information && person.family_information.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Información Familiar', 5, currentY);
      currentY += 7;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      person.family_information.forEach((family: any, index: number) => {
        const yPos = currentY + index * 16;
        this.addField(doc, `Familiar ${index + 1}:`, family.familiar_full_name, 5, yPos);
        // Columna izquierda - Parentesco
        this.addColumn(doc, 5, yPos + 6, 100, { type: 'field', label: 'Parentesco:', value: family.familiar_relationship });
        // Columna derecha - Teléfono
        this.addColumn(doc, 60, yPos + 6, 150, { type: 'field', label: 'Teléfono:', value: family.familiar_phone });
      });
      
      currentY += person.family_information.length * 14;
    }

    return currentY;
  }


  private addField(doc: jsPDF, label: string, value: any, x: number, y: number): void {
    // Convertir el valor a string
    const stringValue = this.convertToString(value);

    // Escribir etiqueta en negrita
    doc.setFont('helvetica', 'bold');
    doc.text(label, x, y);

    // Calcular el ancho de la etiqueta y escribir el valor
    doc.setFont('helvetica', 'normal');
    const labelWidth = doc.getTextWidth(label);
    const valueX = x + labelWidth + 5; // +5 para un pequeño espacio

    // Truncar el valor si es muy largo para evitar que se salga de la página
    const maxWidth = doc.internal.pageSize.width - valueX - 20; // 20mm de margen derecho
    const truncatedValue = this.truncateText(doc, stringValue, maxWidth);

    doc.text(truncatedValue, valueX, y);
  }

  private convertToString(value: any): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      return value.toLocaleDateString('es-ES');
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'boolean') {
      return value ? 'Sí' : 'No';
    }

    // Para otros tipos, intentar convertir a string
    try {
      return String(value);
    } catch {
      return 'N/A';
    }
  }

  private formatReligionDisplay(person: any): string {
    if (person?.religion === 'Otra religión' && person?.religion_other) {
      return `${person.religion} (${person.religion_other})`;
    }

    return person?.religion;
  }

  private truncateText(doc: jsPDF, text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) {
      return text;
    }

    // Buscar el punto de corte apropiado
    let truncated = text;
    while (doc.getTextWidth(truncated + '...') > maxWidth && truncated.length > 0) {
      truncated = truncated.slice(0, -1);
    }

    return truncated + '...';
  }

  /**
   * Agrega una columna con contenido flexible
   * @param doc - Documento PDF
   * @param x - Posición X inicial
   * @param y - Posición Y inicial
   * @param columnWidth - Ancho de la columna en mm
   * @param content - Contenido de la columna (texto, imagen, campo, etc.)
   * @param options - Opciones de configuración de la columna
   * @returns La posición Y final después de agregar el contenido
   */
  private addColumn(doc: jsPDF, x: number, y: number, columnWidth: number, content: ColumnContent, options: ColumnOptions = {}): number {
    const { align = 'left', valign = 'top', backgroundColor, border = false, borderColor = [0, 0, 0], borderWidth = 0.1 } = options;

    let currentY = y;

    // Dibujar fondo si se especifica
    if (backgroundColor) {
      doc.setFillColor(...backgroundColor);
      doc.rect(x, y, columnWidth, this.calculateContentHeight(content, columnWidth), 'F');
    }

    // Dibujar borde si se especifica
    if (border) {
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(borderWidth);
      doc.rect(x, y, columnWidth, this.calculateContentHeight(content, columnWidth), 'S');
    }

    // Calcular posición X basada en alineación
    let contentX = x;
    if (align === 'center') {
      contentX = x + columnWidth / 2;
    } else if (align === 'right') {
      contentX = x + columnWidth;
    }

    // Calcular posición Y basada en alineación vertical
    let contentY = y;
    if (valign === 'middle') {
      const contentHeight = this.calculateContentHeight(content, columnWidth);
      contentY = y + contentHeight / 2;
    } else if (valign === 'bottom') {
      const contentHeight = this.calculateContentHeight(content, columnWidth);
      contentY = y + contentHeight;
    }

    // Renderizar el contenido según su tipo
    currentY = this.renderContent(doc, content, contentX, contentY, columnWidth * 2, align);

    return currentY;
  }

  /**
   * Calcula la altura necesaria para el contenido de la columna
   */
  private calculateContentHeight(content: ColumnContent, columnWidth: number): number {
    const availableWidth = columnWidth * 2;

    if (typeof content === 'string') {
      // Para texto, calcular altura basada en el ancho disponible
      const lines = this.splitTextIntoLines(content, availableWidth);
      return lines.length * 12 * 2; // 12mm por línea
    }

    if (content.type === 'text') {
      const textContent = content as TextContent;
      const lines = this.splitTextIntoLines(textContent.value, availableWidth);
      return lines.length * (textContent.fontSize || 12) * 2;
    }

    if (content.type === 'image') {
      const imageContent = content as ImageContent;
      return (imageContent.height || 20) * 2;
    }

    if (content.type === 'field') {
      const fieldContent = content as FieldContent;
      const labelHeight = 12;
      const valueHeight = this.calculateTextHeight(fieldContent.value, availableWidth);
      return labelHeight + valueHeight * 2;
    }

    if (content.type === 'custom') {
      const customContent = content as CustomContent;
      return customContent.height || 20;
    }

    return 20; // Altura por defecto
  }

  /**
   * Divide el texto en líneas según el ancho disponible
   */
  private splitTextIntoLines(text: string, maxWidth: number): string[] {
    if (!text) return [''];

    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (this.getTextWidth(testLine) <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Palabra muy larga, cortarla
          lines.push(word.substring(0, Math.floor(maxWidth / 6)));
          currentLine = word.substring(Math.floor(maxWidth / 6));
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [''];
  }

  /**
   * Calcula la altura del texto
   */
  private calculateTextHeight(text: string, maxWidth: number): number {
    const lines = this.splitTextIntoLines(text, maxWidth);
    return lines.length * 12; // 12mm por línea
  }

  /**
   * Obtiene el ancho del texto
   */
  private getTextWidth(text: string): number {
    // Simulación del ancho del texto (en un caso real usarías doc.getTextWidth)
    return text.length * 6; // Aproximación: 6mm por carácter
  }

  /**
   * Renderiza el contenido según su tipo
   */
  private renderContent(doc: jsPDF, content: ColumnContent, x: number, y: number, maxWidth: number, align: 'left' | 'center' | 'right'): number {
    let currentY = y;

    if (typeof content === 'string') {
      // Contenido simple de texto
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lines = this.splitTextIntoLines(content, maxWidth);

      lines.forEach((line, index) => {
        const lineY = currentY + index * 12;
        if (align === 'center') {
          doc.text(line, x, lineY, { align: 'center' });
        } else if (align === 'right') {
          doc.text(line, x, lineY, { align: 'right' });
        } else {
          doc.text(line, x, lineY);
        }
      });

      currentY += lines.length * 12;
    } else if (content.type === 'text') {
      // Contenido de texto con formato
      const textContent = content as TextContent;
      doc.setFont('helvetica', textContent.fontStyle || 'normal');
      doc.setFontSize(textContent.fontSize || 10);
      if (textContent.color) {
        doc.setTextColor(textContent.color[0], textContent.color[1], textContent.color[2]);
      }

      const lines = this.splitTextIntoLines(textContent.value, maxWidth);

      const fontSize = textContent.fontSize || 10;
      lines.forEach((line, index) => {
        const lineY = currentY + index * fontSize;
        if (align === 'center') {
          doc.text(line, x, lineY, { align: 'center' });
        } else if (align === 'right') {
          doc.text(line, x, lineY, { align: 'right' });
        } else {
          doc.text(line, x, lineY);
        }
      });

      currentY += lines.length * fontSize;
    } else if (content.type === 'image') {
      // Contenido de imagen
      const imageContent = content as ImageContent;
      try {
        doc.addImage(imageContent.src, imageContent.format || 'PNG', x, currentY, imageContent.width || maxWidth, imageContent.height || 20);
        currentY += imageContent.height || 20;
      } catch (error) {
        console.error('Error al agregar imagen:', error);
        doc.text('Error al cargar imagen', x, currentY);
        currentY += 12;
      }
    } else if (content.type === 'field') {
      // Contenido de campo (etiqueta + valor)
      const fieldContent = content as FieldContent;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(fieldContent.label, x, currentY);

      const labelWidth = doc.getTextWidth(fieldContent.label);
      const valueX = x + labelWidth + 5;

      doc.setFont('helvetica', 'normal');
      const value = this.convertToString(fieldContent.value);
      const lines = this.splitTextIntoLines(value, maxWidth - labelWidth - 5);

      lines.forEach((line, index) => {
        const lineY = currentY + index * 12;
        doc.text(line, valueX, lineY);
      });

      currentY += Math.max(1, lines.length) * 12;
    } else if (content.type === 'custom') {
      // Contenido personalizado
      const customContent = content as CustomContent;
      if (customContent.render) {
        currentY = customContent.render(doc, x, currentY, maxWidth);
      }
    }

    return currentY;
  }
}

// Tipos para el contenido de las columnas
export interface ColumnContent {
  type: 'text' | 'image' | 'field' | 'custom';
  [key: string]: any;
}

export interface TextContent extends ColumnContent {
  type: 'text';
  value: string;
  fontSize?: number;
  fontStyle?: 'normal' | 'bold' | 'italic';
  color?: [number, number, number];
}

export interface ImageContent extends ColumnContent {
  type: 'image';
  src: string;
  format?: 'PNG' | 'JPEG' | 'GIF';
  width?: number;
  height?: number;
}

export interface FieldContent extends ColumnContent {
  type: 'field';
  label: string;
  value: any;
}

export interface CustomContent extends ColumnContent {
  type: 'custom';
  height?: number;
  render?: (doc: jsPDF, x: number, y: number, maxWidth: number) => number;
}

export interface ColumnOptions {
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: [number, number, number];
  border?: boolean;
  borderColor?: [number, number, number];
  borderWidth?: number;
}
