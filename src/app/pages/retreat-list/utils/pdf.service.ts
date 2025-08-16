import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CouplesReportTemplate, SingleRequestReportTemplate } from './templates';

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

export interface RetreatInfo {
  name: string;
  number: string;
  modality: string;
  dateRange: string;
}

export interface CityInfo {
  large_label?: string;
}

export interface PdfTemplate {
  orientation: 'portrait' | 'landscape';
  generateContent(doc: jsPDF, data: any, cityInfo?: CityInfo): Promise<void>;
}

export enum PdfReportType {
  COUPLES_REPORT = 'couples',
  SINGLE_REQUEST_REPORT = 'single_request',
}

@Injectable({
  providedIn: 'root',
})
export class PdfService {
  private templates: Map<PdfReportType, PdfTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    this.templates.set(PdfReportType.COUPLES_REPORT, new CouplesReportTemplate());
    this.templates.set(PdfReportType.SINGLE_REQUEST_REPORT, new SingleRequestReportTemplate());
  }

  /**
   * Genera un PDF genérico basado en el tipo de reporte especificado
   */
  async generateReport(reportType: PdfReportType, data: any, cityInfo?: CityInfo): Promise<void> {
    const template = this.templates.get(reportType);
    if (!template) {
      throw new Error(`Template no encontrado para el tipo: ${reportType}`);
    }

    const doc = new jsPDF(template.orientation, 'mm', 'a4');

    // Configurar el header común
    await this.setupCommonHeader(doc, cityInfo);

    // Generar el contenido específico del template
    await template.generateContent(doc, data, cityInfo);

    // Abrir el PDF en una nueva pestaña
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    window.open(pdfUrl, '_blank');

    // Limpiar la URL del objeto después de un tiempo
    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
  }

  /**
   * Genera un PDF con la información de las parejas en formato de tabla
   */
  async generateCouplesReport(couples: CoupleInfo[], retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    await this.generateReport(PdfReportType.COUPLES_REPORT, { couples, retreatInfo }, cityInfo);
  }

  /**
   * Genera un PDF con la información de una solicitud específica
   */
  async generateSingleRequestReport(request: any, retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    await this.generateReport(PdfReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
  }

  /**
   * Configura el header común para todos los PDFs
   */
  private async setupCommonHeader(doc: jsPDF, cityInfo?: CityInfo): Promise<void> {
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

  /**
   * Carga una imagen desde una ruta
   */
  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /**
   * Agrega texto con diferentes estilos en la misma línea
   */
  addStyledText(doc: jsPDF, boldText: string, normalText: string, x: number, y: number): void {
    // Escribir texto en negrita
    doc.setFont('helvetica', 'bold');
    doc.text(boldText, x, y);

    // Calcular el ancho del texto bold y escribir el texto normal justo después
    doc.setFont('helvetica', 'normal');
    const textWidth = doc.getTextWidth(boldText);
    doc.text(normalText, x + textWidth + 2, y); // +2 para un pequeño espacio
  }
}
