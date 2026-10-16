import { Injectable } from '@angular/core';
import ExcelJS from 'exceljs';
import { ExcelTemplate } from '../../excel.service';
import { CityInfo, RetreatInfo } from '../../pdf.service';
import { fun } from '@core/services/functions.service';

@Injectable()
export class SingleRequestExcelTemplate implements ExcelTemplate {
  async generateContent(workbook: ExcelJS.Workbook, data: { request: any; retreatInfo: RetreatInfo }, cityInfo?: CityInfo): Promise<void> {
    const { request, retreatInfo } = data;
    const { she, he } = request;

    // Crear hoja para la novia
    const sheWorksheet = workbook.addWorksheet('Información de la Novia');
    await this.setupWorksheet(sheWorksheet, 'Información de la Novia', retreatInfo, cityInfo);
    this.addPersonalInfo(sheWorksheet, she, 6);

    // Crear hoja para el novio
    const heWorksheet = workbook.addWorksheet('Información del Novio');
    await this.setupWorksheet(heWorksheet, 'Información del Novio', retreatInfo, cityInfo);
    this.addPersonalInfo(heWorksheet, he, 6);
  }

  private async setupWorksheet(worksheet: ExcelJS.Worksheet, title: string, retreatInfo: RetreatInfo, cityInfo?: CityInfo): Promise<void> {
    // Configurar ancho de columnas
    worksheet.columns = [
      { width: 30 }, // A - Etiqueta 1
      { width: 35 }, // B - Valor 1
      { width: 23 }, // C - Etiqueta 2
      { width: 20 }, // D - Valor 2 (Tel Casa y teléfonos familiares) - menos ancha
      { width: 23 }, // E - Etiqueta 3 (Tel Trabajo)
      { width: 20 }, // F - Valor 3 (Tel Trabajo) - más ancha
    ];

    // Agregar header común
    await this.addHeader(worksheet, cityInfo);

    // Título del documento
    worksheet.mergeCells('A6:D6');
    const titleRow = worksheet.getRow(6);
    titleRow.getCell(1).value = 'Reporte de Solicitud Individual';
    titleRow.getCell(1).font = { size: 16, bold: true };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 25;

    // Información del retiro
    const retreatInfoRow = worksheet.getRow(7);
    retreatInfoRow.getCell(1).value = 'Información del Retiro';
    retreatInfoRow.getCell(1).font = { size: 14, bold: true };
    retreatInfoRow.height = 20;

    const retreatDateRow = worksheet.getRow(8);
    retreatDateRow.getCell(1).value = 'Rango de Fechas:';
    retreatDateRow.getCell(1).font = { bold: true };
    retreatDateRow.getCell(2).value = retreatInfo.dateRange;
    retreatDateRow.height = 20;
  }

  private async addHeader(worksheet: ExcelJS.Worksheet, cityInfo?: CityInfo): Promise<void> {
    const cityLabel = cityInfo?.large_label || 'Ciudad'; 

    // Filas 1 y 2: encabezado institucional a todo el ancho
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getRow(1).getCell(1);
    titleCell.value = 'Encuentro Católico de Novios';
    titleCell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC10007' },
    };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Fila 2: Ciudad
    worksheet.mergeCells('A2:F2');
    const cityCell = worksheet.getRow(2).getCell(1);
    cityCell.value = cityLabel;
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

  private addPersonalInfo(worksheet: ExcelJS.Worksheet, person: any, startRow: number): number {
    let currentRow = startRow + 3;

    // Título de la sección
    const sectionTitleRow = worksheet.getRow(currentRow);
    sectionTitleRow.getCell(1).value = 'Información Personal';
    sectionTitleRow.getCell(1).font = { size: 12, bold: true };
    sectionTitleRow.height = 20;
    currentRow++;

    // Nombre completo
    this.addField(worksheet, 'Nombre Completo:', person?.full_name || 'N/A', currentRow);
    currentRow++;

    // Cédula y Fecha de Nacimiento
    if (person?.identity_number || person?.cedula) {
      const cedulaValue = person?.identity_number ? `${person.identity_number} (${person.identity_type})` : person?.cedula || 'N/A';
      const rowObj = worksheet.getRow(currentRow);
      rowObj.height = 20;

      // Cédula
      rowObj.getCell(1).value = 'Cédula:';
      rowObj.getCell(1).font = { bold: true };
      rowObj.getCell(2).value = this.convertToString(cedulaValue);
      rowObj.getCell(2).alignment = { wrapText: true };

      // Fecha de Nacimiento (en la misma fila, columna siguiente)
      rowObj.getCell(3).value = 'Fecha de Nacimiento:';
      rowObj.getCell(3).font = { bold: true };
      rowObj.getCell(4).value = this.convertToString(person?.birth_date);
      rowObj.getCell(4).alignment = { wrapText: true };

      currentRow++;
    } else if (person?.birth_date) {
      // Si no hay cédula pero sí fecha de nacimiento
      this.addField(worksheet, 'Fecha de Nacimiento:', person.birth_date, currentRow);
      currentRow++;
    }

    // Teléfonos
    if (person?.cell_phone || person?.phone) {
      const phoneValue = person?.cell_phone || person?.phone || 'N/A';
      this.addField(worksheet, 'Celular:', phoneValue, currentRow);

      let phoneCol = 2;
      if (fun.hasValue(person?.home_phone)) {
        worksheet.getRow(currentRow).getCell(phoneCol + 1).value = 'Tel. Casa:';
        worksheet.getRow(currentRow).getCell(phoneCol + 1).font = { bold: true };
        worksheet.getRow(currentRow).getCell(phoneCol + 2).value = person.home_phone;
        phoneCol += 2;
      }

      if (fun.hasValue(person?.work_phone)) {
        worksheet.getRow(currentRow).getCell(phoneCol + 1).value = 'Tel. Trabajo:';
        worksheet.getRow(currentRow).getCell(phoneCol + 1).font = { bold: true };
        worksheet.getRow(currentRow).getCell(phoneCol + 2).value = person.work_phone;
      }
      currentRow++;
    }

    // Email
    if (person?.email) {
      this.addField(worksheet, 'Email:', person.email, currentRow);
      currentRow++;
    }

    // Dirección
    if (person?.address) {
      this.addField(worksheet, 'Dirección:', person.address, currentRow);
      currentRow++;
    }

    // Ciudad
    if (person?.city_of_residence) {
      this.addField(worksheet, 'Ciudad:', person.city_of_residence, currentRow);
      currentRow++;
    }

    // Campos booleanos específicos
    if (person?.are_you_married !== undefined) {
      this.addField(worksheet, '¿Ha estado casado por la Iglesia?:', person.are_you_married ? 'Sí' : 'No', currentRow);
      currentRow++;
    }

    if (person?.have_children !== undefined) {
      this.addField(worksheet, '¿Tiene hijos?:', person.have_children ? 'Sí' : 'No', currentRow);
      currentRow++;
    }

    if (person?.religion) {
      this.addField(worksheet, 'Religión:', this.formatReligionDisplay(person), currentRow);
      currentRow++;
    }

    if (person?.church_name) {
      this.addField(worksheet, 'Parroquia:', person.church_name, currentRow);
      currentRow += 3;
    }

    // Contacto de Emergencia
    if (person?.emergency_full_name) {
      const emergencyTitleRow = worksheet.getRow(currentRow);
      emergencyTitleRow.getCell(1).value = 'Contacto de Emergencia';
      emergencyTitleRow.getCell(1).font = { size: 14, bold: true };
      emergencyTitleRow.height = 20;
      currentRow++;

      this.addField(worksheet, 'Nombre:', person.emergency_full_name, currentRow);
      currentRow++;

      // Parentesco y Teléfono en la misma fila
      const emergencyRow = worksheet.getRow(currentRow);
      emergencyRow.height = 20;
      emergencyRow.getCell(1).value = 'Parentesco:';
      emergencyRow.getCell(1).font = { bold: true };
      emergencyRow.getCell(2).value = this.convertToString(person.emergency_relationship);
      emergencyRow.getCell(2).alignment = { wrapText: true };

      emergencyRow.getCell(3).value = 'Teléfono:';
      emergencyRow.getCell(3).font = { bold: true };
      emergencyRow.getCell(4).value = this.convertToString(person.emergency_phone);
      emergencyRow.getCell(4).alignment = { wrapText: true };

      currentRow += 3;
    }

    // Información Familiar
    if (person?.family_information && person.family_information.length > 0) {
      const familyTitleRow = worksheet.getRow(currentRow);
      familyTitleRow.getCell(1).value = 'Información Familiar';
      familyTitleRow.getCell(1).font = { size: 14, bold: true };
      familyTitleRow.height = 20;
      currentRow++;

      person.family_information.forEach((family: any, index: number) => {
        this.addField(worksheet, `Familiar ${index + 1}:`, family.familiar_full_name || 'N/A', currentRow);
        currentRow++;

        // Parentesco y Teléfono en la misma fila
        const familyRow = worksheet.getRow(currentRow);
        familyRow.height = 20;
        familyRow.getCell(1).value = 'Parentesco:';
        familyRow.getCell(1).font = { bold: true };
        familyRow.getCell(2).value = this.convertToString(family.familiar_relationship);
        familyRow.getCell(2).alignment = { wrapText: true };

        familyRow.getCell(3).value = 'Teléfono:';
        familyRow.getCell(3).font = { bold: true };
        familyRow.getCell(4).value = this.convertToString(family.familiar_phone);
        familyRow.getCell(4).alignment = { wrapText: true };

        currentRow++;
      });

      currentRow++;
    }

    return currentRow;
  }

  private addField(worksheet: ExcelJS.Worksheet, label: string, value: any, row: number): void {
    const rowObj = worksheet.getRow(row);
    rowObj.height = 20;
    rowObj.getCell(1).value = label;
    rowObj.getCell(1).font = { bold: true };
    rowObj.getCell(2).value = this.convertToString(value);
    rowObj.getCell(2).alignment = { wrapText: true };
  }

  private addFieldToColumn(worksheet: ExcelJS.Worksheet, label: string, value: any, row: number, column: number): void {
    const rowObj = worksheet.getRow(row);
    rowObj.getCell(column).value = label;
    rowObj.getCell(column).font = { bold: true };
    rowObj.getCell(column + 1).value = this.convertToString(value);
    rowObj.getCell(column + 1).alignment = { wrapText: true };
  }

  private formatReligionDisplay(person: any): string {
    if (person?.religion === 'Otra religión' && person?.religion_other) {
      return `${person.religion} (${person.religion_other})`;
    }

    return person?.religion;
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

    try {
      return String(value);
    } catch {
      return 'N/A';
    }
  }
}
