import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { CouplesExcelTemplate } from './templates/excel/couples-report.excel-template';
import { SingleRequestExcelTemplate } from './templates/excel/single-request-report.excel-template';
import { ParticipantInfo, CoupleInfo, RetreatInfo, CityInfo } from './pdf.service';

// Re-exportar tipos desde pdf.service para facilitar su uso
export type { ParticipantInfo, CoupleInfo, RetreatInfo, CityInfo };

export interface ExcelTemplate {
  generateContent(workbook: ExcelJS.Workbook, data: any, cityInfo?: CityInfo): Promise<void>;
}

export enum ExcelReportType {
  COUPLES_REPORT = 'couples',
  SINGLE_REQUEST_REPORT = 'single_request',
}

@Injectable({
  providedIn: 'root',
})
export class ExcelService {
  private templates: Map<ExcelReportType, ExcelTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    this.templates.set(ExcelReportType.COUPLES_REPORT, new CouplesExcelTemplate());
    this.templates.set(ExcelReportType.SINGLE_REQUEST_REPORT, new SingleRequestExcelTemplate());
  }

  /**
   * Genera un archivo Excel genérico basado en el tipo de reporte especificado
   */
  async generateReport(reportType: ExcelReportType, data: any, cityInfo?: CityInfo): Promise<void> {
    const template = this.templates.get(reportType);
    if (!template) {
      throw new Error(`Template no encontrado para el tipo: ${reportType}`);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ECN Form';
    workbook.created = new Date();

    // Configurar el header común
    await this.setupCommonHeader(workbook, cityInfo);

    // Generar el contenido específico del template
    await template.generateContent(workbook, data, cityInfo);

    // Descargar el archivo Excel
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = this.getFileName(reportType);
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Genera un Excel con la información de las parejas en formato de tabla
   */
  async generateCouplesReport(couples: CoupleInfo[], retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    await this.generateReport(ExcelReportType.COUPLES_REPORT, { couples, retreatInfo }, cityInfo);
  }

  /**
   * Genera un Excel con la información de una solicitud específica
   */
  async generateSingleRequestReport(request: any, retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    await this.generateReport(ExcelReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
  }

  /**
   * Configura el header común para todos los Excel
   */
  private async setupCommonHeader(workbook: ExcelJS.Workbook, cityInfo?: CityInfo): Promise<void> {
    // El header se configura en cada template ya que Excel maneja headers de manera diferente
  }

  /**
   * Obtiene el nombre del archivo según el tipo de reporte
   */
  private getFileName(reportType: ExcelReportType): string {
    const date = new Date().toISOString().split('T')[0];
    switch (reportType) {
      case ExcelReportType.COUPLES_REPORT:
        return `Contactos_Parejas_${date}.xlsx`;
      case ExcelReportType.SINGLE_REQUEST_REPORT:
        return `Reporte_Solicitud_${date}.xlsx`;
      default:
        return `Reporte_${date}.xlsx`;
    }
  }
}
