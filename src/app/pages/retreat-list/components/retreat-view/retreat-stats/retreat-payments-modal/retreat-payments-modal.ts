import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { PreRetreatPaymentI } from '@core/entities/request/request.model';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

type PaymentType = 'Parcial' | 'Completivo' | 'Sin clasificar';

interface RetreatPaymentRow {
  requestId: string;
  brideName: string;
  groomName: string;
  searchName: string;
  paymentDate: Date;
  amount: number;
  registrationTime: number;
  originalOrder: number;
  type: PaymentType;
  receipt: PreRetreatPaymentI;
}

@Component({
  selector: 'app-retreat-payments-modal',
  imports: [CommonModule, TableModule, TagModule, DialogModule, SkeletonModule, ButtonModule, MenuModule],
  templateUrl: './retreat-payments-modal.html',
  styleUrl: './retreat-payments-modal.scss',
})
export class RetreatPaymentsModal implements OnInit, OnDestroy {
  private config = inject(DynamicDialogConfig);
  private requestService = inject(RequestService);
  exportActions: MenuItem[] = [
    { label: 'Exportar a Excel', icon: 'pi pi-file-excel', command: () => this.exportToExcel() },
    { label: 'Exportar a PDF', icon: 'pi pi-file-pdf', command: () => this.exportToPdf() },
  ];
  payments = signal<RetreatPaymentRow[]>([]);
  searchTerm = signal('');
  filteredPayments = computed(() => {
    const query = this.searchTerm().trim().toLocaleLowerCase();
    return query ? this.payments().filter(payment => payment.searchName.includes(query)) : this.payments();
  });
  total = signal(0);
  receiptPreview = signal<PreRetreatPaymentI | null>(null);
  receiptPreviewUrl = signal<string | null>(null);
  loadingReceipt = signal(false);
  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    const url = this.receiptPreviewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  ngOnInit(): void {
    const amountPerCouple = Number(this.config.data.amountPerPerson ?? 0) * 2;
    let originalOrder = 0;
    const rows = ((this.config.data.requests ?? []) as RequestClass[]).flatMap(request =>
      (request.pre_retreat_payments ?? []).map((payment: PreRetreatPaymentI) => {
        const idTime = Number(payment.id.split('-')[0]);
        const paymentDate = new Date(payment.payment_date);
        return {
          requestId: request.id,
          brideName: this.firstThreeNames(request.she.full_name),
          groomName: this.firstThreeNames(request.he.full_name),
          searchName: `${request.she.full_name} ${request.he.full_name}`.toLocaleLowerCase(),
          paymentDate,
          amount: payment.amount,
          registrationTime: Number.isFinite(idTime) && idTime > 0 ? idTime : paymentDate.getTime(),
          originalOrder: originalOrder++,
          type: 'Sin clasificar' as PaymentType,
          receipt: payment,
        };
      })
    ).sort((left, right) => left.paymentDate.getTime() - right.paymentDate.getTime() || left.registrationTime - right.registrationTime || left.originalOrder - right.originalOrder);

    const paidByRequest = new Map<string, number>();
    for (const payment of rows) {
      if (amountPerCouple <= 0) continue;
      const accumulated = (paidByRequest.get(payment.requestId) ?? 0) + payment.amount;
      paidByRequest.set(payment.requestId, accumulated);
      payment.type = accumulated < amountPerCouple ? 'Parcial' : 'Completivo';
    }

    this.payments.set(rows);
    this.total.set(rows.reduce((sum, payment) => sum + payment.amount, 0));
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 2 }).format(amount);
  }

  formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async exportToExcel(): Promise<void> {
    const rows = this.filteredPayments();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pagos recibidos');
    worksheet.columns = [
      { header: 'Descripción', key: 'description', width: 52 },
      { header: 'Tipo', key: 'type', width: 18 },
      { header: 'Fecha', key: 'date', width: 16 },
      { header: 'Ingresos', key: 'amount', width: 20 },
    ];
    worksheet.addRows(rows.map(payment => ({
      description: `- ${payment.brideName}\n- ${payment.groomName}`,
      type: payment.type,
      date: payment.paymentDate,
      amount: payment.amount,
    })));
    worksheet.addRow({ description: 'Total recibido', amount: rows.reduce((sum, payment) => sum + payment.amount, 0) });
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC10007' } };
    worksheet.getColumn('date').numFmt = 'dd/mm/yyyy';
    worksheet.getColumn('amount').numFmt = '"RD$"#,##0.00';
    worksheet.eachRow(row => row.alignment = { vertical: 'middle', wrapText: true });
    const buffer = await workbook.xlsx.writeBuffer();
    this.downloadFile(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx');
  }

  exportToPdf(): void {
    const rows = this.filteredPayments();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Pagos recibidos', 14, 16);
    doc.setFontSize(10);
    doc.text(`Total recibido: ${this.formatAmount(rows.reduce((sum, payment) => sum + payment.amount, 0))}`, 14, 23);
    autoTable(doc, {
      startY: 29,
      head: [['Descripción', 'Tipo', 'Fecha', 'Ingresos']],
      body: rows.map(payment => [
        `- ${payment.brideName}\n- ${payment.groomName}`,
        payment.type,
        this.formatDate(payment.paymentDate),
        this.formatAmount(payment.amount),
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [193, 0, 7] },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 32 }, 2: { cellWidth: 32 }, 3: { cellWidth: 40, halign: 'right' } },
    });
    this.downloadFile(doc.output('blob'), 'pdf');
  }

  private downloadFile(blob: Blob, extension: 'pdf' | 'xlsx'): void {
    const date = new Date();
    const datePart = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(value => String(value).padStart(2, '0')).join('-');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Pagos_Recibidos_${datePart}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private firstThreeNames(name: string): string {
    return name.trim().split(/\s+/).slice(0, 3).join(' ');
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  async showReceipt(payment: PreRetreatPaymentI): Promise<void> {
    this.receiptPreview.set(payment);
    this.loadingReceipt.set(true);
    try {
      const url = await this.requestService.loadPreRetreatReceiptPreview(payment);
      if (this.destroyed || this.receiptPreview()?.id !== payment.id) {
        URL.revokeObjectURL(url);
        return;
      }
      const previousUrl = this.receiptPreviewUrl();
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      this.receiptPreviewUrl.set(url);
    } catch (error) {
      console.error('No se pudo cargar el recibo del pago:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
      this.receiptPreview.set(null);
      this.loadingReceipt.set(false);
      Ss.toastService.error({ title: 'Recibo no disponible', message: 'No se pudo cargar la imagen del recibo' });
    }
  }

  onReceiptImageLoad(): void {
    this.loadingReceipt.set(false);
  }

  onReceiptImageError(): void {
    this.loadingReceipt.set(false);
    Ss.toastService.error({ title: 'Recibo no disponible', message: 'No se pudo mostrar la imagen del recibo' });
  }

  onReceiptVisibilityChange(visible: boolean): void {
    if (visible) return;
    this.receiptPreview.set(null);
    this.loadingReceipt.set(false);
    const url = this.receiptPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.receiptPreviewUrl.set(null);
  }
}
