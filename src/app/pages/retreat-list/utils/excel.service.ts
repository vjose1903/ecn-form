import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { CouplesExcelTemplate } from './templates/excel/couples-report.excel-template';
import { SingleRequestExcelTemplate } from './templates/excel/single-request-report.excel-template';
import { PaymentsExcelTemplate } from './templates/excel/payments-report.excel-template';
import { ParticipantInfo, CoupleInfo, RetreatInfo, CityInfo } from './pdf.service';
import { TitleCasePipe } from '@angular/common';
import { ExportType, getFileName, ReportType } from './export.utils';

// Re-exportar tipos desde pdf.service para facilitar su uso
export type { ParticipantInfo, CoupleInfo, RetreatInfo, CityInfo };

export interface ExcelTemplate {
  generateContent(workbook: ExcelJS.Workbook, data: any, cityInfo?: CityInfo): Promise<void>;
}


@Injectable({
  providedIn: 'root',
})
export class ExcelService {
  private templates: Map<ReportType, ExcelTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    this.templates.set(ReportType.COUPLES_REPORT, new CouplesExcelTemplate());
    this.templates.set(ReportType.SINGLE_REQUEST_REPORT, new SingleRequestExcelTemplate());
    this.templates.set(ReportType.PAYMENTS_REPORT, new PaymentsExcelTemplate());
  }

  /**
   * Genera un archivo Excel genérico basado en el tipo de reporte especificado
   */
  async generateReport(reportType: ReportType, data: any, cityInfo?: CityInfo): Promise<void> {
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
    link.download = getFileName(reportType, ExportType.EXCEL, data);
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Genera un Excel con la información de las parejas en formato de tabla
   */
  async generateCouplesReport(couples: CoupleInfo[], retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    await this.generateReport(ReportType.COUPLES_REPORT, { couples, retreatInfo }, cityInfo);
  }

  /**
   * Genera un Excel con la información de una solicitud específica
   */
  async generateSingleRequestReport(request: any, retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    await this.generateReport(ReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
  }

  /**
   * Configura el header común para todos los Excel
   */
  private async setupCommonHeader(workbook: ExcelJS.Workbook, cityInfo?: CityInfo): Promise<void> {
    // El header se configura en cada template ya que Excel maneja headers de manera diferente
  }
}
