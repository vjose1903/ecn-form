import type { EChartsOption } from 'echarts';

export type DashboardPeriodFilter = 'all' | 'last_year' | 'last_3_years' | 'last_5_years' | 'custom';

export interface DashboardPeriodOption {
  label: string;
  value: DashboardPeriodFilter;
}

export interface DashboardDateRange {
  from: Date | null;
  to: Date | null;
}

export interface DashboardKpi {
  label: string;
  value: string;
  icon: string;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  detail?: string;
}

export interface DashboardChart {
  title: string;
  subtitle: string;
  option: EChartsOption;
  empty: boolean;
  wide?: boolean;
  size?: 'half' | 'full';
}

export interface DashboardData {
  kpis: DashboardKpi[];
  charts: DashboardChart[];
  retreatCount: number;
  requestCount: number;
}
