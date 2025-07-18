import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ParticipantInfo {
  name: string;
  familyContact: {
    name: string;
    relationship: string;
    phone: string;
  }[];
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
}

export interface CoupleInfo {
  novia: ParticipantInfo;
  novio: ParticipantInfo;
}

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  constructor() {}

  /**
   * Genera un PDF con la información de las parejas en formato de tabla
   */
  async generateCouplesReport(couples: CoupleInfo[], retreatInfo: any, cityInfo?: any): Promise<void> {
    const doc = new jsPDF('landscape', 'mm', 'a4');

    // Configurar el documento
    await this.setupDocument(doc, retreatInfo, cityInfo);

    // Generar la tabla
    this.generateCouplesTable(doc, couples);

    // Abrir el PDF en una nueva pestaña
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    // Abrir en nueva pestaña
    window.open(pdfUrl, '_blank');

    // Limpiar la URL del objeto después de un tiempo
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
  }

  private async setupDocument(doc: jsPDF, retreatInfo: any, cityInfo?: any): Promise<void> {
    // Generar header con tabla
    await this.generateHeaderTable(doc, cityInfo);

    // Título del documento
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Contactos de Parejas para el Retiro', 140, 25, { align: 'center' });

    // Información del retiro
    doc.setFontSize(10);
    this.addStyledText(doc, 'Retiro No: ', retreatInfo.number.toString(), 5, 30);
    this.addStyledText(doc, 'Fecha: ', new Date().toLocaleDateString('es-ES'), 5, 35);

    // Espacio para la tabla
    doc.setFontSize(10);
  }

  private async generateHeaderTable(doc: jsPDF, cityInfo?: any): Promise<void> {
    const img = await this.loadImage('/images/Logo_ECN.png');
    const cityLabel = cityInfo?.large_label || 'Ciudad';
    const baseColor = [193, 0, 7] as [number, number, number];
    const accentColor = [235, 187, 193];

    const headerConfig: any = {
      startY: 5,
      margin: { left: 5, right: 5 },
      head: [
        [
          { content: ' ', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'Encuentro Católico para Novios', styles: { halign: 'left', valign: 'middle' } },
        ],
        [{ content: cityLabel, styles: { halign: 'left', valign: 'middle', fontSize: 8, fontStyle: 'normal', textColor: accentColor } }],
      ],
      body: [],
      styles: {
        fontSize: 12,
        cellPadding: 1,
        lineWidth: 0.1,
        lineColor: baseColor,
      },
      headStyles: {
        fillColor: baseColor,
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 3 },
        1: { cellWidth: 'auto' },
      },
      didDrawCell: (data: any) => {
        if (data.row.index === 0 && data.column.index === 0) {
          const { cell } = data;
          const imgHeight = cell.height - 1;
          const aspectRatio = img.width / img.height;
          const imgWidth = imgHeight * aspectRatio;
          const x = cell.x + (cell.width - imgWidth) / 2;
          const y = cell.y + 0.5;

          doc.addImage(img, 'PNG', x, y, imgWidth, imgHeight);
        }
      },
    };

    autoTable(doc, headerConfig);
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private generateCouplesTable(doc: jsPDF, couples: CoupleInfo[]): void {
    const tableData = this.prepareTableData(couples);
    const headerColor = [233, 63, 68] as [number, number, number];
    const headerBorderColor = [255, 117, 121];
    const phoneColumnWidth = 23;

    const tableConfig: any = {
      startY: 40,
      margin: { left: 5, right: 5 },
      head: [
        [
          { content: 'No.', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'Nombre del Participante', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } },
          { content: 'Contacto de Familiar', colSpan: 6, styles: { halign: 'center', valign: 'middle' } },
          { content: 'Contacto de Emergencia', colSpan: 3, styles: { halign: 'center', valign: 'middle' } },
        ],
        [
          // Familiares (2 contactos × 3 campos cada uno)
          { content: 'Nombre', styles: { halign: 'center' } },
          { content: 'Parentesco', styles: { halign: 'center' } },
          { content: 'Teléfono', styles: { halign: 'center' } },
          { content: 'Nombre', styles: { halign: 'center' } },
          { content: 'Parentesco', styles: { halign: 'center' } },
          { content: 'Teléfono', styles: { halign: 'center' } },
          // Emergencia (1 contacto × 3 campos)
          { content: 'Nombre', styles: { halign: 'center' } },
          { content: 'Parentesco', styles: { halign: 'center' } },
          { content: 'Teléfono', styles: { halign: 'center' } },
        ],
      ],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 1.5,
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: headerColor,
        lineWidth: 0.2,
        lineColor: headerBorderColor,
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 10 }, // No.
        1: { cellWidth: 'auto' }, // Participante
        2: { cellWidth: 'auto' }, // Familiar 1 - Nombre
        3: { cellWidth: 'auto' }, // Familiar 1 - Parentesco
        4: { cellWidth: phoneColumnWidth }, // Familiar 1 - Teléfono
        5: { cellWidth: 'auto' }, // Familiar 2 - Nombre
        6: { cellWidth: 'auto' }, // Familiar 2 - Parentesco
        7: { cellWidth: phoneColumnWidth }, // Familiar 2 - Teléfono
        8: { cellWidth: 'auto' }, // Emergencia - Nombre
        9: { cellWidth: 'auto' }, // Emergencia - Parentesco
        10: { cellWidth: phoneColumnWidth }, // Emergencia - Teléfono
      },
      didDrawPage: (data: any) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.text(`Página ${data.pageNumber} de ${pageCount}`, data.settings.margin.left, doc.internal.pageSize.height - 10);
      },
    };

    autoTable(doc, tableConfig);
  }

  private prepareTableData(couples: CoupleInfo[]): any[] {
    const tableData: any[] = [];
    const totalCouples = couples.length;

    couples.forEach((couple, index) => {
      const isFirstRow = index === 0;
      const isLastRow = index === totalCouples - 1;

      // Crear filas para ambos participantes
      tableData.push(
        this.createParticipantRow({ participant: couple.novia, isNovio: false, isFirstRow, isLastRow, number: index + 1 }),
        this.createParticipantRow({ participant: couple.novio, isFirstRow, isNovio: true, isLastRow, number: index + 1 })
      );
    });

    return tableData;
  }

  private createParticipantRow(args: { participant: ParticipantInfo; isFirstRow: boolean; isNovio: boolean; isLastRow: boolean; number: number }): any[] {
    const { participant, isNovio, isFirstRow, isLastRow, number } = args;

    const backgroundColor = isNovio ? [245, 245, 245] : [255, 255, 255];
    const lineWidth = this.getLineWidth(isFirstRow, isLastRow, isNovio);

    const row: any = [
      { content: participant.name, styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.familyContact[0]?.name || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.familyContact[0]?.relationship || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.familyContact[0]?.phone || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.familyContact[1]?.name || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.familyContact[1]?.relationship || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.familyContact[1]?.phone || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.emergencyContact?.name || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.emergencyContact?.relationship || '', styles: { fillColor: backgroundColor, lineWidth } },
      { content: participant.emergencyContact?.phone || '', styles: { fillColor: backgroundColor, lineWidth } },
    ];

    if (!isNovio) {
      row.unshift({ content: number.toString(), rowSpan: 2, styles: { fillColor: backgroundColor, lineWidth, halign: 'center', valign: 'middle' } });
    }

    console.log(row);
    return row;
  }

  private getLineWidth(isFirstRow: boolean, isLastRow: boolean, isNovio: boolean): any {
    const baseWidth = 0.1;
    const thickWidth = 1.5;
    const commonBorders = { left: baseWidth, right: baseWidth };

    return isNovio ? { ...commonBorders, bottom: isLastRow ? baseWidth : thickWidth, top: baseWidth } : { ...commonBorders, top: isFirstRow ? baseWidth : thickWidth, bottom: baseWidth };
  }

  /**
   * Agrega texto con diferentes estilos en la misma línea
   * @param doc - Documento PDF
   * @param boldText - Texto que se mostrará en negrita
   * @param normalText - Texto que se mostrará en fuente normal
   * @param x - Posición X inicial
   * @param y - Posición Y
   */
  private addStyledText(doc: jsPDF, boldText: string, normalText: string, x: number, y: number): void {
    // Escribir texto en negrita
    doc.setFont('helvetica', 'bold');
    doc.text(boldText, x, y);

    // Calcular el ancho del texto bold y escribir el texto normal justo después
    doc.setFont('helvetica', 'normal');
    const textWidth = doc.getTextWidth(boldText);
    doc.text(normalText, x + textWidth + 2, y); // +2 para un pequeño espacio
  }
}
