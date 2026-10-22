import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RequestClass } from '@core/entities/request/request.class';
import { PreRetreatPaymentI, RequestStatus } from '@core/entities/request/request.model';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { ExcelService } from '@pages/retreat-list/utils/excel.service';
import { PdfService } from '@pages/retreat-list/utils/pdf.service';
import { ReportType } from '@pages/retreat-list/utils/export.utils';

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
  private excelService = inject(ExcelService);
  private pdfService = inject(PdfService);
  exportActions: MenuItem[] = [
    { label: 'Exportar a Excel', icon: 'pi pi-file-excel', command: () => this.exportToExcel() },
    { label: 'Exportar a PDF', icon: 'pi pi-file-pdf', command: () => this.exportToPdf() },
  ];
  payments = signal<RetreatPaymentRow[]>([]);
  paymentSummary = computed(() => {
    const accepted = ((this.config.data.requests ?? []) as RequestClass[]).filter(request => request.status === RequestStatus.ACCEPTED);
    const amountPerCouple = Number(this.config.data.amountPerPerson ?? 0) * 2;
    const paidAmounts = accepted.map(request => (request.pre_retreat_payments ?? []).reduce((sum, payment) => sum + payment.amount, 0));
    const paid = paidAmounts.filter(amount => amount > 0).length;
    const expectedTotal = accepted.length * amountPerCouple;
    const receivedTotal = this.total();
    const percentage = expectedTotal > 0 ? receivedTotal / expectedTotal * 100 : 0;
    return {
      expectedTotal,
      outstanding: Math.max(expectedTotal - receivedTotal, 0),
      surplus: expectedTotal > 0 ? Math.max(receivedTotal - expectedTotal, 0) : 0,
      isOverpaid: expectedTotal > 0 && receivedTotal > expectedTotal,
      percentage,
      progressPercentage: Math.min(percentage, 100),
      paid,
      unpaid: accepted.length - paid,
      complete: amountPerCouple > 0 ? paidAmounts.filter(amount => amount >= amountPerCouple).length : 0,
      partial: amountPerCouple > 0 ? paidAmounts.filter(amount => amount > 0 && amount < amountPerCouple).length : 0,
    };
  });
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
    try {
      await this.excelService.generateReport(ReportType.PAYMENTS_REPORT, this.getExportData(), Ss.authService.current_user()?.cityData);
      Ss.toastService.success({ title: 'Excel exportado', message: 'Se descargó el reporte de pagos recibidos.' });
    } catch (error) {
      console.error('Error al exportar los pagos a Excel:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
      Ss.toastService.error({ title: 'Error al exportar', message: 'No se pudo generar el archivo Excel.' });
    }
  }

  async exportToPdf(): Promise<void> {
    try {
      await this.pdfService.generateReport(ReportType.PAYMENTS_REPORT, this.getExportData(), Ss.authService.current_user()?.cityData);
      Ss.toastService.success({ title: 'PDF exportado', message: 'Se descargó el reporte de pagos recibidos.' });
    } catch (error) {
      console.error('Error al exportar los pagos a PDF:', JSON.stringify(error instanceof Error ? { name: error.name, message: error.message } : error));
      Ss.toastService.error({ title: 'Error al exportar', message: 'No se pudo generar el archivo PDF.' });
    }
  }

  private getExportData() {
    const retreat = (this.config.data.requests as RequestClass[] | undefined)?.[0]?.retreatData;
    return {
      retreatInfo: {
        name: retreat?.displayCommunityName ?? 'Retiro',
        number: String(retreat?.displayNumber ?? ''),
        modality: retreat?.displayModality ?? '',
        dateRange: retreat?.displayDateRange ?? '',
      },
      payments: this.filteredPayments().map(payment => ({
        description: `- ${payment.brideName}\n- ${payment.groomName}`,
        type: payment.type,
        paymentDate: payment.paymentDate,
        amount: payment.amount,
      })),
    };
  }

  private firstThreeNames(name: string): string {
    return name.trim().split(/\s+/).slice(0, 3).join(' ');
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  async showReceipt(row: RetreatPaymentRow): Promise<void> {
    const payment = row.receipt;
    this.receiptPreview.set(payment);
    this.loadingReceipt.set(true);
    try {
      const retreat = this.config.data.retreat;
      if (!retreat?.city_id) throw new Error('No se encontró la ciudad del retiro');
      const url = await this.requestService.loadPreRetreatReceiptPreview(payment, {cityId: retreat.city_id, requestId: row.requestId});
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
