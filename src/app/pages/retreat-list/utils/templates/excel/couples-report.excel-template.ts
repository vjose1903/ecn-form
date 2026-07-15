import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { ExcelTemplate } from '../../excel.service';
import { CityInfo, CoupleInfo, RetreatInfo } from '../../pdf.service';

@Injectable()
export class CouplesExcelTemplate implements ExcelTemplate {
  async generateContent(workbook: ExcelJS.Workbook, data: { couples: CoupleInfo[]; retreatInfo: RetreatInfo }, cityInfo?: CityInfo): Promise<void> {
    const { couples, retreatInfo } = data;

    // Crear hoja de trabajo
    const worksheet = workbook.addWorksheet('Contactos de Parejas');

    // Configurar ancho de columnas
    worksheet.columns = [
      { width: 8 }, // No.
      { width: 40 }, // Nombre del Participante
      { width: 35 }, // Familiar 1 - Nombre
      { width: 15 }, // Familiar 1 - Parentesco
      { width: 18 }, // Familiar 1 - Teléfono
      { width: 35 }, // Familiar 2 - Nombre
      { width: 15 }, // Familiar 2 - Parentesco
      { width: 18 }, // Familiar 2 - Teléfono
      { width: 35 }, // Emergencia - Nombre
      { width: 15 }, // Emergencia - Parentesco
      { width: 18 }, // Emergencia - Teléfono
    ];

    // Agregar header común
    await this.addHeader(worksheet, cityInfo);

    // Título del documento
    worksheet.mergeCells('A6:K6');
    const titleRow = worksheet.getRow(6);
    titleRow.getCell(1).value = 'Contactos de Parejas para el Retiro';
    titleRow.getCell(1).font = { size: 16, bold: true };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 20;

    // Información del retiro
    const retreatRow = worksheet.getRow(7);
    retreatRow.getCell(1).value = 'Retiro No:';
    retreatRow.getCell(1).font = { bold: true };
    retreatRow.getCell(2).value = retreatInfo.number;
    retreatRow.getCell(5).value = 'Fecha:';
    retreatRow.getCell(5).font = { bold: true };
    retreatRow.getCell(6).value = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Generar la tabla
    this.generateCouplesTable(worksheet, couples);
  }

  private async addHeader(worksheet: ExcelJS.Worksheet, cityInfo?: CityInfo): Promise<void> {
    // Agregar logo e información del header
    const cityLabel = cityInfo?.large_label || 'Ciudad';

    // Fila 1: Logo y título principal
    worksheet.mergeCells('A1:B2');
    const logoCell = worksheet.getRow(1).getCell(1);
    logoCell.value = 'Logo ECN';
    logoCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('C1:K1');
    const titleCell = worksheet.getRow(1).getCell(3);
    titleCell.value = '  Encuentro Católico de Novios';
    titleCell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Fila 2: Ciudad
    worksheet.mergeCells('C2:K2');
    const cityCell = worksheet.getRow(2).getCell(3);
    cityCell.value = `  ${cityLabel}`;
    cityCell.font = { size: 8, color: { argb: 'FFEBBBC1' } };
    cityCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    cityCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Configurar altura de filas
    worksheet.getRow(1).height = 25;
    worksheet.getRow(2).height = 20;
  }

  private generateCouplesTable(worksheet: ExcelJS.Worksheet, couples: CoupleInfo[]): void {
    // Encabezados de la tabla
    const headerRow = worksheet.getRow(9);
    headerRow.height = 25;

    // Fila de encabezados principal
    const header1 = worksheet.getRow(9);
    header1.getCell(1).value = 'No.';
    header1.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header1.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    header1.getCell(1).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header1.getCell(2).value = 'Nombre del Participante';
    header1.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header1.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header1.getCell(2).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    header1.getCell(2).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Contacto de Familiar (colSpan 6)
    worksheet.mergeCells('C9:H9');
    const familiarHeader = header1.getCell(3);
    familiarHeader.value = 'Contacto de Familiar';
    familiarHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    familiarHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    familiarHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    familiarHeader.border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Contacto de Emergencia (colSpan 3)
    worksheet.mergeCells('I9:K9');
    const emergencyHeader = header1.getCell(9);
    emergencyHeader.value = 'Contacto de Emergencia';
    emergencyHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    emergencyHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    emergencyHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    emergencyHeader.border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Fila de encabezados secundaria
    const header2 = worksheet.getRow(10);
    header2.height = 20;

    // Celda vacia debajo del No1
    header2.getCell(1).value = ' ';
    header2.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(1).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Celda vacia debajo del Nombre del Participante
    header2.getCell(2).value = ' ';
    header2.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(2).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Familiar 1
    header2.getCell(3).value = 'Nombre';
    header2.getCell(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(3).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header2.getCell(4).value = 'Parentesco';
    header2.getCell(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(4).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header2.getCell(5).value = 'Teléfono';
    header2.getCell(5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(5).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Familiar 2
    header2.getCell(6).value = 'Nombre';
    header2.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(6).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header2.getCell(7).value = 'Parentesco';
    header2.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(7).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(7).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header2.getCell(8).value = 'Teléfono';
    header2.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(8).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(8).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Emergencia
    header2.getCell(9).value = 'Nombre';
    header2.getCell(9).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(9).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(9).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header2.getCell(10).value = 'Parentesco';
    header2.getCell(10).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(10).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(10).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    header2.getCell(11).value = 'Teléfono';
    header2.getCell(11).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    header2.getCell(11).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header2.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    header2.getCell(11).border = {
      top: { style: 'thin', color: { argb: 'FFFF7579' } },
      bottom: { style: 'thin', color: { argb: 'FFFF7579' } },
      left: { style: 'thin', color: { argb: 'FFFF7579' } },
      right: { style: 'thin', color: { argb: 'FFFF7579' } },
    };

    // Agregar datos
    let currentRow = 11;
    couples.forEach((couple, index) => {
      // Combinar celda de número para ambas filas (novia y novio)
      worksheet.mergeCells(`A${currentRow}:A${currentRow + 1}`);

      // Fila de la novia
      const noviaRow = worksheet.getRow(currentRow);
      noviaRow.height = 20;

      noviaRow.getCell(1).value = index + 1;
      noviaRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      noviaRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFFFF' },
      };
      noviaRow.getCell(1).border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      };

      this.addParticipantCells(noviaRow, couple.novia, false);
      currentRow++;

      // Fila del novio
      const novioRow = worksheet.getRow(currentRow);
      novioRow.height = 20;

      this.addParticipantCells(novioRow, couple.novio, true);
      currentRow++;
    });

    // Freeze panes en la fila de encabezados
    worksheet.views = [{ state: 'frozen', ySplit: 10 }];
  }

  private addParticipantCells(row: ExcelJS.Row, participant: any, isNovio: boolean): void {
    const backgroundColor = isNovio ? 'FFF5F5F5' : 'FFFFFFFF';
    const borderStyle = {
      top: { style: 'thin' as const },
      bottom: { style: 'thin' as const },
      left: { style: 'thin' as const },
      right: { style: 'thin' as const },
    };

    // Nombre del participante
    row.getCell(2).value = participant.name;
    row.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(2).border = borderStyle;
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };

    // Familiar 1
    row.getCell(3).value = participant.familyContact[0]?.name || '';
    row.getCell(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(3).border = borderStyle;
    row.getCell(3).alignment = { vertical: 'middle', wrapText: true };

    row.getCell(4).value = participant.familyContact[0]?.relationship || '';
    row.getCell(4).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(4).border = borderStyle;
    row.getCell(4).alignment = { vertical: 'middle', wrapText: true };

    row.getCell(5).value = participant.familyContact[0]?.phone || '';
    row.getCell(5).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(5).border = borderStyle;
    row.getCell(5).alignment = { vertical: 'middle', wrapText: true };

    // Familiar 2
    row.getCell(6).value = participant.familyContact[1]?.name || '';
    row.getCell(6).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(6).border = borderStyle;
    row.getCell(6).alignment = { vertical: 'middle', wrapText: true };

    row.getCell(7).value = participant.familyContact[1]?.relationship || '';
    row.getCell(7).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(7).border = borderStyle;
    row.getCell(7).alignment = { vertical: 'middle', wrapText: true };

    row.getCell(8).value = participant.familyContact[1]?.phone || '';
    row.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(8).border = borderStyle;
    row.getCell(8).alignment = { vertical: 'middle', wrapText: true };

    // Emergencia
    row.getCell(9).value = participant.emergencyContact?.name || '';
    row.getCell(9).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(9).border = borderStyle;
    row.getCell(9).alignment = { vertical: 'middle', wrapText: true };

    row.getCell(10).value = participant.emergencyContact?.relationship || '';
    row.getCell(10).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(10).border = borderStyle;
    row.getCell(10).alignment = { vertical: 'middle', wrapText: true };

    row.getCell(11).value = participant.emergencyContact?.phone || '';
    row.getCell(11).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: backgroundColor },
    };
    row.getCell(11).border = borderStyle;
    row.getCell(11).alignment = { vertical: 'middle', wrapText: true };
  }
}
