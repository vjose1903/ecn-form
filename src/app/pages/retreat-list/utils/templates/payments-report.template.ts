import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PdfTemplate } from '../pdf.service';

interface PaymentsReportData {
  payments: { description: string; type: string; paymentDate: Date; amount: number }[];
  retreatInfo: { name: string; number: string; modality: string; dateRange: string };
}

@Injectable()
export class PaymentsReportTemplate implements PdfTemplate {
  orientation: 'landscape' = 'landscape';

  async generateContent(doc: jsPDF, data: PaymentsReportData): Promise<void> {
    const { payments, retreatInfo } = data;
    const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const width = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Pagos recibidos', width / 2, 25, { align: 'center' });
    doc.setFontSize(9);
    doc.text(`Retiro No. ${retreatInfo.number}  |  ${retreatInfo.name}`, 5, 31);
    doc.setFont('helvetica', 'normal');
    doc.text(`Modalidad: ${retreatInfo.modality}  |  Período: ${retreatInfo.dateRange}  |  Generado: ${new Date().toLocaleDateString('es-DO')}`, 5, 36);

    autoTable(doc, {
      startY: 40,
      margin: { left: 5, right: 5, bottom: 15 },
      head: [['Descripción', 'Tipo', 'Fecha', 'Ingresos']],
      body: payments.map(payment => [
        payment.description,
        payment.type,
        new Date(payment.paymentDate).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(payment.amount),
      ]),
      foot: [['Total recibido', '', '', new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(total)]],
      styles: { fontSize: 8, cellPadding: 2.5, lineWidth: .1, lineColor: [220, 220, 220] },
      headStyles: { fillColor: [193, 0, 7], textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [248, 250, 252], textColor: [23, 32, 51], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30 }, 2: { cellWidth: 28 }, 3: { cellWidth: 36, halign: 'right' } },
      didDrawPage: ({ pageNumber }) => {
        doc.setFontSize(8);
        doc.text(`Página ${pageNumber} de ${doc.getNumberOfPages()}`, width - 5, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
      },
    });
  }
}
