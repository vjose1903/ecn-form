import { Ss } from '@core/services/singleton.service';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { DividerLine } from '@core/components/divider-line/divider-line';
import { RequestClass } from '@core/entities/request/request.class';
import { DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ViewItem } from '@core/components/view-item/view-item';
import { CoupleType, RequestI, RequestStatus } from '@core/entities/request/request.model';
import { CoupleView } from './couple-view/couple-view';
import { RequestService } from '@core/entities/request/request.service';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { TooltipModule } from 'primeng/tooltip';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { FormPage } from '@pages/form-page/form-page';
import { PdfService } from '@pages/retreat-list/utils/pdf.service';
import { ExcelService } from '@pages/retreat-list/utils/excel.service';
import { ExportType, ReportType } from '@pages/retreat-list/utils/export.utils';

@Component({
  selector: 'app-request-view',
  imports: [CommonModule, TagModule, DividerLine, ButtonModule, ViewItem, CoupleView, TooltipModule, MenuModule],
  templateUrl: './request-view.html',
  styleUrl: './request-view.scss',
})
export class RequestView implements OnInit {
  private ref = inject(DynamicDialogRef);
  private config = inject(DynamicDialogConfig);
  requestService = inject(RequestService);
  pdfService = inject(PdfService);
  excelService = inject(ExcelService);

  loading = signal(false);
  private _request = signal<RequestClass | null>(null);
  request = computed(() => this._request());
  retreat!: RetreatClass;
  CoupleType = CoupleType;
  RequestStatus = RequestStatus;

  actions: MenuItem[] = [
    {
      label: 'Acciones',
      items: [
        {
          label: 'Editar solicitud',
          icon: 'pi pi-pencil',
          command: () => this.editRequest(),
        },
      ],
    },
    {
      separator: true,
    },
    {
      label: 'Exportar',
      items: [
        {
          label: 'Exportar en PDF',
          icon: 'pi pi-file-pdf',
          command: () => this.exportSingleRequestReport({ request: this.request()!, type: ExportType.PDF }),
        },
        {
          label: 'Exportar en Excel',
          icon: 'pi pi-file-excel',
          command: () => this.exportSingleRequestReport({ request: this.request()!, type: ExportType.EXCEL }),
        },
      ],
    },
  ];

  ngOnInit(): void {
    this._request.set(this.config.data.request);
    this.retreat = this.config.data.retreat;
  }

  toggleStatus(status: RequestStatus) {
    this.loading.set(true);
    const currentRequest = this.request();
    if (!currentRequest) return;
    const payload = { id: currentRequest.id, status };

    this.requestService
      .updateRequest(payload, this.retreat)
      .then(() => {
        if (status === RequestStatus.ACCEPTED) {
          Ss.toastService.success({ message: 'Solicitud aceptada correctamente', title: 'Éxito' });
        } else {
          Ss.toastService.success({ message: 'Solicitud rechazada correctamente', title: 'Éxito' });
        }

        this.loading.set(false);
        this.ref.close();
      })
      .catch(() => {
        Ss.toastService.error({ message: 'Error al actualizar la solicitud', title: 'Error' });
        this.loading.set(false);
      });
  }

  editRequest() {
    const dialogService = Ss.dialogService;

    if (!dialogService) {
      console.error('DialogService no disponible');
      return;
    }

    const dialogRef = dialogService.open(FormPage, {
      header: `Editar Solicitud`,
      width: '70vw',
      modal: true,
      appendTo: 'body',
      draggable: false,
      resizable: false,
      closable: true,
      contentStyle: { padding: '0' },
      focusOnShow: false,
      data: {
        request: this.request(),
        formType: 'update',
        user_id: Ss.authService.current_user()?.id,
      },
      breakpoints: { '960px': '80vw', '640px': '90vw' },
    });

    // Aquí capturas lo que retorna el modal
    dialogRef.onClose.subscribe((result: RequestI | undefined) => {
      if (result) {
        if (result && result.id) {
          const newRequest = new RequestClass(result);
          this._request.set(newRequest);
          this.config.data.request = newRequest;
        }
      }
    });
  }

  async exportSingleRequestReport(args: { request: RequestClass; type: ExportType }): Promise<void> {
    const { request, type } = args;
    try {
      // Información del retiro para el reporte
      const retreatInfo = {
        name: this.retreat.displayCommunityName,
        number: this.retreat.displayNumber,
        modality: this.retreat.displayModality,
        dateRange: this.retreat.displayDateRange,
      };

      // Obtener información de la ciudad desde el layout
      const cityInfo = Ss.authService.current_user()?.cityData;

      // Generar el reporte según el tipo
      if (type === ExportType.EXCEL) {
        await this.excelService.generateReport(ReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
        Ss.toastService.success({
          message: 'Reporte de solicitud individual generado',
          title: 'Excel Exportado',
        });
      } else {
        await this.pdfService.generateReport(ReportType.SINGLE_REQUEST_REPORT, { request, retreatInfo }, cityInfo);
        Ss.toastService.success({
          message: 'Reporte de solicitud individual generado',
          title: 'PDF Exportado',
        });
      }
    } catch (error) {
      console.error(`Error al exportar ${type === ExportType.EXCEL ? 'Excel' : 'PDF'}:`, error);
      Ss.toastService.error({
        message: `Error al generar el reporte ${type === ExportType.EXCEL ? 'Excel' : 'PDF'}`,
        title: 'Error',
      });
    }
  }
}
