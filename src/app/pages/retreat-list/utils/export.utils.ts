import { TitleCasePipe } from '@angular/common';

export enum ReportType {
  COUPLES_REPORT = 'couples',
  SINGLE_REQUEST_REPORT = 'single_request',
  PAYMENTS_REPORT = 'payments',
}

export enum ExportType {
  PDF = 'pdf',
  EXCEL = 'excel',
}

export function getFileName(reportType: ReportType, exportType: ExportType, data?: any): string {
  const getFirstName = (fullName: string): string => {
    return fullName.split(' ')[0];
  };

  const extension = exportType === ExportType.PDF ? 'pdf' : 'xlsx';

  const titleCasePipe = new TitleCasePipe();
  switch (reportType) {
    case ReportType.COUPLES_REPORT:
      const retreatNumber = data?.retreatInfo?.number;
      return retreatNumber ? `Contactos_Parejas_Retiro_NO_${retreatNumber}.${extension}` : `Contactos_Parejas.${extension}`;

    case ReportType.SINGLE_REQUEST_REPORT:
      const request = data?.request;
      const sheName = request?.she?.full_name;
      const heName = request?.he?.full_name;

      if (sheName && heName) {
        const sheFirstName = getFirstName(sheName);
        const heFirstName = getFirstName(heName);
        if (sheFirstName && heFirstName) {
          const coupleNames = [sheFirstName, heFirstName].map(name => titleCasePipe.transform(name));
          return `Reporte_Solicitud_${coupleNames.join('_')}.${extension}`;
        }
      }
      return `Reporte_Solicitud.${extension}`;

    case ReportType.PAYMENTS_REPORT:
      const paymentRetreatNumber = data?.retreatInfo?.number;
      return paymentRetreatNumber ? `Pagos_Recibidos_Retiro_${paymentRetreatNumber}.${extension}` : `Pagos_Recibidos.${extension}`;

    default:
      return `Reporte.${extension}`;
  }
}
