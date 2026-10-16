import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { ExcelTemplate } from '../../excel.service';
import { CityInfo } from '../../pdf.service';

interface PaymentsReportData {
  payments: { description: string; type: string; paymentDate: Date; amount: number }[];
  retreatInfo: { name: string; number: string; modality: string; dateRange: string };
}

@Injectable()
export class PaymentsExcelTemplate implements ExcelTemplate {
  async generateContent(workbook: ExcelJS.Workbook, data: PaymentsReportData, cityInfo?: CityInfo): Promise<void> {
    const { payments, retreatInfo } = data;
    const worksheet = workbook.addWorksheet('Pagos recibidos');
    worksheet.columns = [{ width: 52 }, { width: 18 }, { width: 16 }, { width: 20 }];

    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = 'Encuentro Católico de Novios';
    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = cityInfo?.large_label || 'Ciudad';
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC10007' } };
    worksheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC10007' } };
    worksheet.getCell('A1').font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A2').font = { size: 8, color: { argb: 'FFEBBBC1' } };
    worksheet.getCell('A1').alignment = { vertical: 'middle' };
    worksheet.getCell('A2').alignment = { vertical: 'middle' };
    worksheet.getRow(1).height = 25;
    worksheet.getRow(2).height = 20;

    worksheet.mergeCells('A4:D4');
    worksheet.getCell('A4').value = 'Reporte de pagos recibidos';
    worksheet.getCell('A4').font = { size: 16, bold: true };
    worksheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(4).height = 24;
    worksheet.getCell('A5').value = 'Retiro No.:';
    worksheet.getCell('A5').font = { bold: true };
    worksheet.getCell('B5').value = retreatInfo.number;
    worksheet.getCell('C5').value = 'Comunidad:';
    worksheet.getCell('C5').font = { bold: true };
    worksheet.getCell('D5').value = retreatInfo.name;
    worksheet.getCell('A6').value = 'Modalidad:';
    worksheet.getCell('A6').font = { bold: true };
    worksheet.getCell('B6').value = retreatInfo.modality;
    worksheet.getCell('C6').value = 'Período:';
    worksheet.getCell('C6').font = { bold: true };
    worksheet.getCell('D6').value = retreatInfo.dateRange;
    worksheet.getCell('A7').value = 'Generado:';
    worksheet.getCell('A7').font = { bold: true };
    worksheet.getCell('B7').value = new Date();
    worksheet.getCell('B7').numFmt = 'dd/mm/yyyy';

    const header = worksheet.getRow(9);
    header.values = ['Descripción', 'Tipo', 'Fecha', 'Ingresos'];
    header.height = 25;
    header.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC10007' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin', color: { argb: 'FFFF7579' } }, bottom: { style: 'thin', color: { argb: 'FFFF7579' } }, left: { style: 'thin', color: { argb: 'FFFF7579' } }, right: { style: 'thin', color: { argb: 'FFFF7579' } } };
    });

    for (const payment of payments) {
      const row = worksheet.addRow([payment.description, payment.type, payment.paymentDate, payment.amount]);
      row.alignment = { vertical: 'middle', wrapText: true };
      row.getCell(3).numFmt = 'dd/mm/yyyy';
      row.getCell(4).numFmt = '"RD$"#,##0.00';
      row.height = 32;
    }
    const totalRow = worksheet.addRow(['Total recibido', '', '', payments.reduce((sum, payment) => sum + payment.amount, 0)]);
    totalRow.font = { bold: true };
    totalRow.getCell(4).numFmt = '"RD$"#,##0.00';
    totalRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = { top: { style: 'thin', color: { argb: 'FFDBE3ED' } }, bottom: { style: 'thin', color: { argb: 'FFDBE3ED' } } };
    });
  }
}
