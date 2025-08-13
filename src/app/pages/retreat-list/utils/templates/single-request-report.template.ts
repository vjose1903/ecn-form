import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { PdfTemplate, CityInfo, RetreatInfo } from '../pdf.service';

@Injectable()
export class SingleRequestReportTemplate implements PdfTemplate {
  orientation: 'portrait' | 'landscape' = 'portrait';

  async generateContent(doc: jsPDF, data: { request: any; retreatInfo: RetreatInfo }, cityInfo?: CityInfo): Promise<void> {
    const { request, retreatInfo } = data;

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
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Información de la Novia', 5, 65);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    this.addField(doc, 'Nombre Completo:', request.she?.full_name, 5, 72);

    // Cédula y Fecha de Nacimiento en dos columnas
    // Columna izquierda - Cédula
    this.addColumn(doc, 3, 77, 50, { type: 'field', label: 'Cédula:', value: request.she?.cedula });

    // Columna derecha - Fecha de Nacimiento
    this.addColumn(doc, 100, 77, 140, { type: 'field', label: 'Fecha de Nacimiento:', value: request.she?.birth_date });

    this.addField(doc, 'Teléfono:', request.she?.phone, 5, 86);
    this.addField(doc, 'Email:', request.she?.email, 5, 93);
    this.addField(doc, 'Dirección:', request.she?.address, 5, 100);

    // Contactos de Emergencia - Novia
    if (request.she?.emergency_full_name) {
      this.addField(doc, 'Contacto de Emergencia:', request.she.emergency_full_name, 5, 107);
      // Columna izquierda - Parentesco
      this.addColumn(doc, 3, 112, 100, { type: 'field', label: 'Parentesco:', value: request.she.emergency_relationship });
      // Columna derecha - Teléfono
      this.addColumn(doc, 60, 112, 150, { type: 'field', label: 'Teléfono:', value: request.she.emergency_phone });
    }

    // Información Familiar - Novia
    if (request.she?.family_information && request.she.family_information.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Información Familiar', 5, 122);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      request.she.family_information.forEach((family: any, index: number) => {
        const yPos = 129 + (index * 16);
        this.addField(doc, `Familiar ${index + 1}:`, family.familiar_full_name, 5, yPos);
        // Columna izquierda - Parentesco
        this.addColumn(doc, 3, (yPos + 4), 100, { type: 'field', label: 'Parentesco:', value: family.familiar_relationship });
        // Columna derecha - Teléfono
        this.addColumn(doc, 60, (yPos + 4), 150, { type: 'field', label: 'Teléfono:', value: family.familiar_phone });
    
        // this.addField(doc, 'Parentesco:', family.familiar_relationship, 5, yPos + 7);
        // this.addField(doc, 'Teléfono:', family.familiar_phone, 5, yPos + 14);
      });
    }

    // Información del Novio
    const novioYStart = this.calculateNovioYStart(request.she);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Información del Novio', 5, novioYStart);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    this.addField(doc, 'Nombre Completo:', request.he?.full_name, 5, novioYStart + 10);
    // Cédula y Fecha de Nacimiento en dos columnas
    const heColumnWidth = 35; // Ancho de cada columna
    const heSpacing = 10; // Espacio entre columnas

    // Columna izquierda - Cédula
    this.addColumn(doc, 5, novioYStart + 5, heColumnWidth, {
      type: 'field',
      label: 'Cédula:',
      value: request.he?.cedula,
    });

    // Columna derecha - Fecha de Nacimiento
    this.addColumn(doc, 20 + heColumnWidth + heSpacing, novioYStart + 5, heColumnWidth, {
      type: 'field',
      label: 'Fecha de Nacimiento:',
      value: request.he?.birth_date,
    });
    this.addField(doc, 'Teléfono:', request.he?.phone, 5, novioYStart + 40);
    this.addField(doc, 'Email:', request.he?.email, 5, novioYStart + 50);
    this.addField(doc, 'Dirección:', request.he?.address, 5, novioYStart + 60);

    // Contactos de Emergencia - Novio
    if (request.he?.emergency_full_name) {
      this.addField(doc, 'Contacto de Emergencia:', request.he.emergency_full_name, 5, novioYStart + 70);
      this.addField(doc, 'Parentesco:', request.he.emergency_relationship, 5, novioYStart + 80);
      this.addField(doc, 'Teléfono:', request.he.emergency_phone, 5, novioYStart + 90);
    }

    // Información Familiar - Novio
    if (request.he?.family_information && request.he.family_information.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Información Familiar - Novio', 5, novioYStart + 110);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      request.he.family_information.forEach((family: any, index: number) => {
        const yPos = novioYStart + 120 + index * 30;
        this.addField(doc, `Familiar ${index + 1}:`, family.familiar_full_name, 5, yPos);
        this.addField(doc, 'Parentesco:', family.familiar_relationship, 5, yPos + 10);
        this.addField(doc, 'Teléfono:', family.familiar_phone, 5, yPos + 20);
      });
    }

    // Información de la Solicitud
    const requestYStart = this.calculateRequestYStart(request);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Información de la Solicitud', 5, requestYStart);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    this.addField(doc, 'Estado:', request.status, 5, requestYStart + 10);
    this.addField(doc, 'Fecha de Solicitud:', request.created_at, 5, requestYStart + 20);

    if (request.notes) {
      this.addField(doc, 'Notas:', request.notes, 5, requestYStart + 30);
    }

    // Fecha de generación del reporte
    doc.setFontSize(8);
    doc.text(`Reporte generado el: ${new Date().toLocaleDateString('es-ES')}`, 5, doc.internal.pageSize.height - 20);
  }

  private calculateNovioYStart(sheInfo: any): number {
    let baseY = 215; // Posición base después de la información del retiro

    if (sheInfo?.emergency_full_name) {
      baseY += 30; // Espacio para contacto de emergencia
    }

    if (sheInfo?.family_information && sheInfo.family_information.length > 0) {
      baseY += 30 + sheInfo.family_information.length * 30; // Título + campos de familiares
    }

    return baseY + 20; // Espacio adicional antes de la información del novio
  }

  private calculateRequestYStart(request: any): number {
    let baseY = this.calculateNovioYStart(request.she);
    baseY += 80; // Espacio para información básica del novio

    if (request.he?.emergency_full_name) {
      baseY += 30; // Espacio para contacto de emergencia del novio
    }

    if (request.he?.family_information && request.he.family_information.length > 0) {
      baseY += 30 + request.he.family_information.length * 30; // Título + campos de familiares del novio
    }

    return baseY + 20; // Espacio adicional antes de la información de la solicitud
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
   * Ejemplo de uso del método addColumn para crear un layout de dos columnas
   */
  private createTwoColumnLayout(doc: jsPDF, request: any, retreatInfo: any): void {
    const pageWidth = doc.internal.pageSize.width;
    const leftColumnWidth = pageWidth * 0.45; // 45% del ancho de la página
    const rightColumnWidth = pageWidth * 0.45; // 45% del ancho de la página
    const margin = 20;
    const spacing = pageWidth * 0.1; // 10% de espacio entre columnas

    let currentY = 50; // Posición Y inicial después del header

    // Columna izquierda - Información del retiro
    currentY = this.addColumn(
      doc,
      margin,
      currentY,
      leftColumnWidth,
      {
        type: 'text',
        value: 'Información del Retiro',
        fontSize: 14,
        fontStyle: 'bold',
      },
      {
        backgroundColor: [240, 240, 240],
        border: true,
        align: 'center',
      }
    );

    currentY = this.addColumn(doc, margin, currentY + 5, leftColumnWidth, {
      type: 'field',
      label: 'Nombre:',
      value: retreatInfo.name,
    });

    currentY = this.addColumn(doc, margin, currentY + 2, leftColumnWidth, {
      type: 'field',
      label: 'Número:',
      value: retreatInfo.number,
    });

    currentY = this.addColumn(doc, margin, currentY + 2, leftColumnWidth, {
      type: 'field',
      label: 'Modalidad:',
      value: retreatInfo.modality,
    });

    // Columna derecha - Información de la solicitud
    const rightColumnX = margin + leftColumnWidth + spacing;
    let rightColumnY = 50;

    rightColumnY = this.addColumn(
      doc,
      rightColumnX,
      rightColumnY,
      rightColumnWidth,
      {
        type: 'text',
        value: 'Estado de la Solicitud',
        fontSize: 14,
        fontStyle: 'bold',
      },
      {
        backgroundColor: [240, 240, 240],
        border: true,
        align: 'center',
      }
    );

    rightColumnY = this.addColumn(doc, rightColumnX, rightColumnY + 5, rightColumnWidth, {
      type: 'field',
      label: 'Estado:',
      value: request.status,
    });

    rightColumnY = this.addColumn(doc, rightColumnX, rightColumnY + 2, rightColumnWidth, {
      type: 'field',
      label: 'Fecha:',
      value: request.created_at,
    });

    // Ejemplo de imagen (si existe)
    if (request.she?.profile_image) {
      rightColumnY = this.addColumn(
        doc,
        rightColumnX,
        rightColumnY + 5,
        rightColumnWidth,
        {
          type: 'image',
          src: request.she.profile_image,
          width: 40,
          height: 40,
        },
        {
          align: 'center',
          border: true,
        }
      );
    }

    // Ejemplo de contenido personalizado
    rightColumnY = this.addColumn(
      doc,
      rightColumnX,
      rightColumnY + 5,
      rightColumnWidth,
      {
        type: 'custom',
        height: 30,
        render: (doc: jsPDF, x: number, y: number, maxWidth: number) => {
          // Dibujar un gráfico simple o contenido personalizado
          doc.setFillColor(200, 200, 200);
          doc.rect(x, y, maxWidth, 20, 'F');
          doc.setFontSize(8);
          doc.text('Contenido personalizado aquí', x + 5, y + 12);
          return y + 20;
        },
      },
      {
        border: true,
        align: 'center',
      }
    );
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
    const { padding = 2, align = 'left', valign = 'top', backgroundColor, border = false, borderColor = [0, 0, 0], borderWidth = 0.1 } = options;

    let currentY = y;

    // Dibujar fondo si se especifica
    if (backgroundColor) {
      doc.setFillColor(...backgroundColor);
      doc.rect(x, y, columnWidth, this.calculateContentHeight(content, columnWidth, padding), 'F');
    }

    // Dibujar borde si se especifica
    if (border) {
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(borderWidth);
      doc.rect(x, y, columnWidth, this.calculateContentHeight(content, columnWidth, padding), 'S');
    }

    // Calcular posición X basada en alineación
    let contentX = x + padding;
    if (align === 'center') {
      contentX = x + columnWidth / 2;
    } else if (align === 'right') {
      contentX = x + columnWidth - padding;
    }

    // Calcular posición Y basada en alineación vertical
    let contentY = y + padding;
    if (valign === 'middle') {
      const contentHeight = this.calculateContentHeight(content, columnWidth, padding);
      contentY = y + contentHeight / 2;
    } else if (valign === 'bottom') {
      const contentHeight = this.calculateContentHeight(content, columnWidth, padding);
      contentY = y + contentHeight - padding;
    }

    // Renderizar el contenido según su tipo
    currentY = this.renderContent(doc, content, contentX, contentY, columnWidth - padding * 2, align);

    return currentY + padding;
  }

  /**
   * Calcula la altura necesaria para el contenido de la columna
   */
  private calculateContentHeight(content: ColumnContent, columnWidth: number, padding: number): number {
    const availableWidth = columnWidth - padding * 2;

    if (typeof content === 'string') {
      // Para texto, calcular altura basada en el ancho disponible
      const lines = this.splitTextIntoLines(content, availableWidth);
      return lines.length * 12 + padding * 2; // 12mm por línea
    }

    if (content.type === 'text') {
      const textContent = content as TextContent;
      const lines = this.splitTextIntoLines(textContent.value, availableWidth);
      return lines.length * (textContent.fontSize || 12) + padding * 2;
    }

    if (content.type === 'image') {
      const imageContent = content as ImageContent;
      return (imageContent.height || 20) + padding * 2;
    }

    if (content.type === 'field') {
      const fieldContent = content as FieldContent;
      const labelHeight = 12;
      const valueHeight = this.calculateTextHeight(fieldContent.value, availableWidth);
      return labelHeight + valueHeight + padding * 2;
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
  padding?: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: [number, number, number];
  border?: boolean;
  borderColor?: [number, number, number];
  borderWidth?: number;
}
