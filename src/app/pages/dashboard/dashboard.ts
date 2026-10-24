import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardChartComponent } from './dashboard-chart.component';
import { DashboardFullscreenCardComponent } from './dashboard-fullscreen-card.component';
import { DashboardService } from './dashboard.service';
import type { DashboardChart, DashboardData, DashboardDateRange, DashboardPeriodFilter, DashboardPeriodOption, DashboardSkeletonLayout } from './dashboard.model';
import { Ss } from '@core/services/singleton.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, SelectModule, MultiSelectModule, TooltipModule, DashboardChartComponent, DashboardFullscreenCardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage implements OnInit {
  private dashboardService = inject(DashboardService);

  loading = signal(false);
  data = signal<DashboardData | null>(null);
  loadingLayout = signal<DashboardSkeletonLayout>({kpiKeys: [], chartKeys: []});
  selectedPeriod = signal<DashboardPeriodFilter>('last_3_years');
  selectedRetreats = signal<string[]>(['all']);
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

  skeletonBars = [0, 1, 2, 3, 4, 5];
  skeletonRows = [0, 1, 2, 3, 4];

  showCustomRange = computed(() => this.selectedPeriod() === 'custom');
  retreatOptions = computed(() => [
    { label: 'Todos', value: 'all' },
    ...(this.data()?.retreatOptions || []),
  ]);
  kpis = computed(() => this.data()?.kpis || []);
  charts = computed(() => this.data()?.charts || []);
  summary = computed(() => {
    const data = this.data();

    if (!data) {
      return this.loading() ? 'Cargando datos…' : 'Sin datos cargados';
    }

    return `${data.retreatCount} retiros · ${data.requestCount} solicitudes`;
  });

  ngOnInit(): void {
    void this.loadDashboard();
  }

  onPeriodChange(period: DashboardPeriodFilter): void {
    this.selectedPeriod.set(period);
    this.selectedRetreats.set(['all']);

    if (period !== 'custom') {
      void this.loadDashboard();
    }
  }

  onCustomRangeChange(): void {
    if (this.customFrom() && this.customTo()) {
      this.selectedRetreats.set(['all']);
      void this.loadDashboard();
    }
  }

  onRetreatSelectionChange(selection: string[]): void {
    const previous = this.selectedRetreats();
    let normalized: string[];

    if (selection.includes('all')) {
      normalized = previous.includes('all')
        ? selection.filter(value => value !== 'all')
        : ['all'];
    } else {
      normalized = selection;
    }

    if (!normalized.length) normalized = ['all'];
    this.selectedRetreats.set(normalized);
    this.data.set(this.dashboardService.filterDashboardData(normalized.includes('all') ? [] : normalized));
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

  kpiTone(key: string): string {
    const tones: Record<string, string> = {
      request_status: 'success',
      requests_per_retreat: 'info',
      wedding_date: 'danger',
      inviter: 'warning',
      dating_average: 'info',
      participants_children: 'warning',
      church_marriage: 'success',
    };
    return tones[key] || 'primary';
  }

  kpiHasDetail(key: string): boolean {
    return ['request_status', 'requests_per_retreat', 'wedding_date', 'inviter', 'participants_children', 'church_marriage'].includes(key);
  }

  chartSkeletonSize(key: string): 'half' | 'full' | null {
    if (key === 'participant_ages_chart' || key === 'declared_religion_chart') return 'half';
    if (key === 'residence_city_chart') return 'full';
    return null;
  }

  chartSkeletonType(key: string): 'donut' | 'horizontal' | 'bars' {
    if (['requests_status_chart', 'wedding_date_chart', 'inviter_chart'].includes(key)) return 'donut';
    if (['acquisition_source_chart', 'declared_religion_chart', 'residence_city_chart'].includes(key)) return 'horizontal';
    return 'bars';
  }

  skeletonBarHeight(index: number): number {
    return [38, 76, 54, 88, 63, 46][index] ?? 50;
  }

  skeletonRowWidth(index: number): number {
    return [78, 92, 64, 85, 54][index] ?? 70;
  }

  private async loadDashboard(): Promise<void> {
    try {
      this.loading.set(true);
      const range: DashboardDateRange = {
        from: this.customFrom(),
        to: this.customTo(),
      };

      this.data.set(await this.dashboardService.getDashboardData(this.selectedPeriod(), range, layout => this.loadingLayout.set(layout)));
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
