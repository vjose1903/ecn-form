import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardChartComponent } from './dashboard-chart.component';
import { DashboardFullscreenCardComponent } from './dashboard-fullscreen-card.component';
import { DashboardService } from './dashboard.service';
import type { DashboardChart, DashboardData, DashboardDateRange, DashboardPeriodFilter, DashboardPeriodOption } from './dashboard.model';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, SelectModule, TooltipModule, DashboardChartComponent, DashboardFullscreenCardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage implements OnInit {
  private dashboardService = inject(DashboardService);

  loading = signal(false);
  data = signal<DashboardData | null>(null);
  selectedPeriod = signal<DashboardPeriodFilter>('all');
  customFrom = signal<Date | null>(null);
  customTo = signal<Date | null>(null);
  fullscreenChart = signal<DashboardChart | null>(null);
  fullscreenOriginRect = signal<DOMRect | null>(null);

  periodOptions: DashboardPeriodOption[] = [
    { label: 'Sin filtro', value: 'all' },
    { label: 'Último año', value: 'last_year' },
    { label: 'Últimos 3 años', value: 'last_3_years' },
    { label: 'Últimos 5 años', value: 'last_5_years' },
    { label: 'Rango personalizado', value: 'custom' },
  ];

  showCustomRange = computed(() => this.selectedPeriod() === 'custom');
  kpis = computed(() => this.data()?.kpis || []);
  charts = computed(() => this.data()?.charts || []);
  summary = computed(() => {
    const data = this.data();

    if (!data) {
      return 'Sin datos cargados';
    }

    return `${data.retreatCount} retiros · ${data.requestCount} solicitudes`;
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  onPeriodChange(period: DashboardPeriodFilter): void {
    this.selectedPeriod.set(period);

    if (period !== 'custom') {
      void this.loadDashboard();
    }
  }

  onCustomRangeChange(): void {
    if (this.customFrom() && this.customTo()) {
      void this.loadDashboard();
    }
  }

  refresh(): void {
    void this.loadDashboard();
  }

  openChartFullscreen(chart: DashboardChart, cardElement: HTMLElement, event: Event): void {
    if (this.shouldIgnoreCardEvent(event)) {
      return;
    }

    event.preventDefault();
    this.fullscreenOriginRect.set(cardElement.getBoundingClientRect());
    this.fullscreenChart.set(chart);
  }

  closeChartFullscreen(): void {
    this.fullscreenChart.set(null);
    this.fullscreenOriginRect.set(null);
  }

  private async loadDashboard(): Promise<void> {
    try {
      this.loading.set(true);
      const range: DashboardDateRange = {
        from: this.customFrom(),
        to: this.customTo(),
      };

      this.data.set(await this.dashboardService.getDashboardData(this.selectedPeriod(), range));
    } catch (error) {
      console.error('Error al cargar el dashboard:', error);
      Ss.toastService.error({ title: 'Error', message: 'No se pudo cargar el dashboard' });
    } finally {
      this.loading.set(false);
    }
  }

  private shouldIgnoreCardEvent(event: Event): boolean {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return !!target.closest('button, a, input, select, textarea, p-select, p-datepicker, .p-select, .p-datepicker, .p-datepicker-panel, .p-button');
  }
}
