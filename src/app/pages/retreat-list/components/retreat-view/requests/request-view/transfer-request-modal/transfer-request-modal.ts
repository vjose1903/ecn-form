import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { RequestClass } from '@core/entities/request/request.class';
import { RequestService } from '@core/entities/request/request.service';
import { Ss } from '@core/services/singleton.service';
import { ButtonModule } from 'primeng/button';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-transfer-request-modal',
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule],
  templateUrl: './transfer-request-modal.html',
  styleUrl: './transfer-request-modal.scss',
})
export class TransferRequestModal implements OnInit {
  private config = inject(DynamicDialogConfig);
  ref = inject(DynamicDialogRef);
  private requestService = inject(RequestService);
  private retreatService = inject(RetreatService);

  loading = signal(true);
  retreatListUnavailable = signal(false);
  saving = signal(false);
  requests: RequestClass[] = [];
  currentRetreat!: RetreatClass;
  requestOrigins: Record<string, RetreatClass> = {};
  isArchivedView = false;
  retreats = signal<RetreatClass[]>([]);
  selectedRetreatId = signal<string | null>(null);

  availableRetreatOptions = computed(() =>
    this.retreats().map(retreat => ({
      label: `Retiro #${retreat.displayNumber} - ${retreat.displayCommunityName}`,
      value: retreat.id,
    }))
  );
  get sourceRetreatCount(): number {
    return new Set([this.currentRetreat?.id, ...Object.values(this.requestOrigins).map(retreat => retreat.id)].filter(Boolean)).size;
  }

  ngOnInit(): void {
    this.requests = this.config.data.requests ?? [this.config.data.request];
    this.requestOrigins = this.config.data.requestOrigins ?? {};
    this.currentRetreat = this.config.data.retreat ?? this.requestOrigins[this.requests[0]?.id];
    this.isArchivedView = Boolean(this.config.data.isArchivedView);
    void this.loadRetreats();
  }

  private async loadRetreats(): Promise<void> {
    try {
      this.loading.set(true);
      const retreats = await this.retreatService.getAll();
      if (this.retreatService.retreatListPermissionDenied) {
        this.retreatListUnavailable.set(true);
        return;
      }
      const sourceIds = new Set([this.currentRetreat?.id, ...Object.values(this.requestOrigins).map(retreat => retreat.id)]);
      this.retreats.set(retreats.filter(retreat => !sourceIds.has(retreat.id)));
    } catch (error) {
      if (['permission-denied', 'firestore/permission-denied'].includes((error as {code?: string})?.code ?? '')) {
        this.retreatListUnavailable.set(true);
        return;
      }
      console.error('Error cargando retiros para transferir:', error);
      Ss.toastService.error({
        message: 'No se pudieron cargar los retiros disponibles',
        title: 'Error',
      });
    } finally {
      this.loading.set(false);
    }
  }

  async transfer(): Promise<void> {
    const selectedRetreat = this.retreats().find(retreat => retreat.id === this.selectedRetreatId());

    if (!selectedRetreat) {
      Ss.toastService.warning({
        message: 'Debes seleccionar el retiro destino',
        title: 'Selección requerida',
      });
      return;
    }

    try {
      this.saving.set(true);
      const transferredRequestIds: string[] = [];
      for (const request of this.requests) {
        try {
          await this.requestService.transferRequest({
            request,
            fromRetreat: this.requestOrigins[request.id] ?? this.currentRetreat,
            toRetreat: selectedRetreat,
            isArchived: this.isArchivedView,
          });
          transferredRequestIds.push(request.id);
        } catch (error) {
          console.error(`Error transfiriendo la solicitud ${request.id}:`, error);
        }
      }
      this.ref.close({ transferred: transferredRequestIds.length > 0, transferredRequestIds, retreatId: selectedRetreat.id });
    } catch (error) {
      console.error('Error transfiriendo solicitud:', error);
    } finally {
      this.saving.set(false);
    }
  }
}
