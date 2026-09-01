import { Injectable, inject } from '@angular/core';
import { RetreatClass } from '@core/entities/retreat/retreat.class';
import { RetreatService } from '@core/entities/retreat/retreat.service';
import { CoupleI, RequestStatus } from '@core/entities/request/request.model';
import { RequestClass } from '@core/entities/request/request.class';
import { Ss } from '@core/services/singleton.service';
import type { EChartsOption } from 'echarts';
import type { DashboardChart, DashboardData, DashboardDateRange, DashboardKpi, DashboardPeriodFilter } from './dashboard.model';

interface DashboardRequestEntry {
  retreat: RetreatClass;
  request: RequestClass;
}

interface CounterEntry {
  name: string;
  value: number;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private retreatService = inject(RetreatService);
  private readonly chartPalette = ['#a83044', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#ef4444', '#0f766e', '#ea580c', '#475569', '#db2777', '#65a30d'];

  async getDashboardData(filter: DashboardPeriodFilter, customRange: DashboardDateRange): Promise<DashboardData> {
    const currentUser = Ss.authService.current_user();

    if (!currentUser?.id) {
      throw new Error('Usuario no autenticado');
    }

    const retreats = await this.retreatService.getAll();
    const cityRetreats = retreats.filter(retreat => retreat.is_active && this.isRetreatInUserCity(retreat, currentUser.city));
    const scopedRetreats = this.filterRetreatsByPeriod(cityRetreats, filter, customRange);
    const requestGroups = await Promise.all(scopedRetreats.map(retreat => this.retreatService.getRequests(retreat).then(requests => ({ retreat, requests }))));
    const entries = requestGroups.flatMap(group => group.requests.map(request => ({ retreat: group.retreat, request })));

    return {
      kpis: this.buildKpis(entries),
      charts: this.buildCharts(scopedRetreats, entries),
      retreatCount: scopedRetreats.length,
      requestCount: entries.length,
    };
  }

  private filterRetreatsByPeriod(retreats: RetreatClass[], filter: DashboardPeriodFilter, customRange: DashboardDateRange): RetreatClass[] {
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;

    if (filter === 'last_year') {
      from = this.startOfYear(now);
      to = this.endOfYear(now);
    }

    if (filter === 'last_3_years') {
      from = this.startOfYear(this.addYears(now, -2));
      to = this.endOfYear(now);
    }

    if (filter === 'last_5_years') {
      from = this.startOfYear(this.addYears(now, -4));
      to = this.endOfYear(now);
    }

    if (filter === 'custom') {
      from = customRange.from;
      to = customRange.to;
    }

    return retreats.filter(retreat => {
      const startDate = this.toDate(retreat.start_date);

      if (!startDate) {
        return false;
      }

      if (from && startDate < this.startOfDay(from)) {
        return false;
      }

      if (to && startDate > this.endOfDay(to)) {
        return false;
      }

      return true;
    });
  }

  private isRetreatInUserCity(retreat: RetreatClass, userCity: unknown): boolean {
    const retreatCity = this.extractId((retreat as unknown as { city?: unknown }).city);

    if (!retreatCity) {
      return true;
    }

    return retreatCity === this.extractId(userCity);
  }

  private buildKpis(entries: DashboardRequestEntry[]): DashboardKpi[] {
    const total = entries.length;
    const statusCounts = this.countBy(entries, entry => entry.request.status || RequestStatus.PENDING);
    const weddingCounts = this.countBy(entries, entry => (entry.request.have_wedding_date ? 'con' : 'sin'));
    const invitedCounts = this.countBy(entries, entry => (this.hasText(entry.request.who_invited_you) ? 'con' : 'sin'));
    const participants = entries.flatMap(entry => this.getParticipants(entry.request));
    const withChildren = participants.filter(participant => participant.have_children).length;
    const churchMarried = participants.filter(participant => participant.are_you_married).length;
    const averageDatingYears = total > 0 ? entries.reduce((sum, entry) => sum + Number(entry.request.dating_period_year || 0), 0) / total : 0;
    const mainSource = this.topEntry(this.countBy(entries, entry => this.getSource(entry.request)))?.name || 'Sin datos';

    return [
      { label: 'Total de solicitudes', value: this.formatNumber(total), icon: 'pi pi-chart-bar', tone: 'primary' },
      {
        label: 'Estado de solicitudes',
        value: `${statusCounts[RequestStatus.PENDING] || 0} / ${statusCounts[RequestStatus.ACCEPTED] || 0} / ${statusCounts[RequestStatus.REJECTED] || 0}`,
        icon: 'pi pi-check-circle',
        tone: 'success',
        detail: 'Pendientes / aceptadas / rechazadas',
      },
      {
        label: 'Solicitudes por retiro',
        value: `${this.averagePerRetreat(entries).toFixed(1)} prom.`,
        icon: 'pi pi-calendar-clock',
        tone: 'info',
        detail: `${new Set(entries.map(entry => entry.retreat.id)).size} retiros con solicitudes`,
      },
      {
        label: 'Con fecha de boda',
        value: this.formatNumber(weddingCounts['con'] || 0),
        icon: 'pi pi-heart-fill',
        tone: 'danger',
        detail: `${weddingCounts['sin'] || 0} sin fecha`,
      },
      {
        label: 'Con invitador registrado',
        value: this.formatNumber(invitedCounts['con'] || 0),
        icon: 'pi pi-user-plus',
        tone: 'warning',
        detail: `${invitedCounts['sin'] || 0} sin invitador`,
      },
      { label: 'Fuente principal', value: mainSource, icon: 'pi pi-compass', tone: 'primary' },
      { label: 'Promedio de noviazgo', value: `${averageDatingYears.toFixed(1)} años`, icon: 'pi pi-clock', tone: 'info' },
      { label: 'Participantes con hijos', value: this.formatNumber(withChildren), icon: 'pi pi-users', tone: 'warning', detail: `${participants.length} participantes` },
      { label: 'Casados por la iglesia', value: this.formatNumber(churchMarried), icon: 'pi pi-building-columns', tone: 'success', detail: `${participants.length} participantes` },
    ];
  }

  private buildCharts(retreats: RetreatClass[], entries: DashboardRequestEntry[]): DashboardChart[] {
    const participants = entries.flatMap(entry => this.getParticipants(entry.request));
    const requestStatus = [
      { name: 'Pendientes', value: entries.filter(entry => entry.request.status === RequestStatus.PENDING).length },
      { name: 'Aceptadas', value: entries.filter(entry => entry.request.status === RequestStatus.ACCEPTED).length },
      { name: 'Rechazadas', value: entries.filter(entry => entry.request.status === RequestStatus.REJECTED).length },
    ];
    const requestsByRetreat = retreats.map(retreat => ({
      name: `Retiro ${retreat.displayNumber}`,
      value: entries.filter(entry => entry.retreat.id === retreat.id).length,
    }));
    const sourceData = this.toSortedEntries(this.countBy(entries, entry => this.getSource(entry.request)));
    const evolutionData = retreats
      .slice()
      .sort((left, right) => new Date(left.start_date).getTime() - new Date(right.start_date).getTime())
      .map(retreat => ({
        name: this.formatDate(retreat.start_date),
        value: entries.filter(entry => entry.retreat.id === retreat.id).length,
      }));
    const datingYears = this.toSortedEntries(this.countBy(entries, entry => `${entry.request.dating_period_year || 0} años`), (left, right) => Number.parseInt(left.name) - Number.parseInt(right.name));
    const weddingData = [
      { name: 'Con fecha', value: entries.filter(entry => entry.request.have_wedding_date).length },
      { name: 'Sin fecha', value: entries.filter(entry => !entry.request.have_wedding_date).length },
    ];
    const invitedData = [
      { name: 'Con invitador', value: entries.filter(entry => this.hasText(entry.request.who_invited_you)).length },
      { name: 'Sin invitador', value: entries.filter(entry => !this.hasText(entry.request.who_invited_you)).length },
    ];
    const ageData = this.toSortedEntries(this.countBy(participants, participant => this.getAgeRange(participant.age || 0)), (left, right) => this.ageRangeOrder(left.name) - this.ageRangeOrder(right.name));
    const religionData = this.toSortedEntries(this.countBy(participants, participant => this.normalizeReligionDisplay(participant))).slice(0, 10);
    const cityData = this.countByNormalized(participants, participant => participant.city_of_residence).slice(0, 12);

    return [
      { title: 'Estado de solicitudes', subtitle: 'Pendientes, aceptadas y rechazadas', option: this.pieOption(requestStatus), empty: entries.length === 0 },
      { title: 'Solicitudes por retiro', subtitle: 'Total por retiro seleccionado', option: this.barOption(requestsByRetreat), empty: entries.length === 0 },
      { title: 'Fuente de captación', subtitle: 'Cómo se enteraron del retiro', option: this.horizontalBarOption(sourceData), empty: entries.length === 0 },
      { title: 'Evolución por fecha de retiro', subtitle: 'Solicitudes agrupadas por fecha de inicio del retiro', option: this.barOption(evolutionData), empty: entries.length === 0 },
      { title: 'Años de noviazgo', subtitle: 'Distribución por ficha', option: this.barOption(datingYears), empty: entries.length === 0 },
      { title: 'Fecha de boda', subtitle: 'Solicitudes con y sin fecha definida', option: this.pieOption(weddingData), empty: entries.length === 0 },
      { title: 'Invitador registrado', subtitle: 'Solicitudes con referencia de invitador', option: this.pieOption(invitedData), empty: entries.length === 0 },
      { title: 'Edades de participantes', subtitle: 'Rangos de edad entre novio y novia', option: this.barOption(ageData), empty: participants.length === 0, size: 'half' },
      { title: 'Religión declarada', subtitle: 'Valores normalizados visualmente', option: this.horizontalBarOption(religionData), empty: participants.length === 0, size: 'half' },
      { title: 'Ciudad de residencia', subtitle: 'Distribución entre solicitantes', option: this.horizontalBarOption(cityData), empty: participants.length === 0, size: 'full' },
    ];
  }

  private pieOption(data: CounterEntry[]): EChartsOption {
    return {
      color: this.chartPalette,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#111827',
        borderWidth: 0,
        textStyle: { color: '#ffffff' },
      },
      legend: {
        bottom: 0,
        left: 'center',
        itemWidth: 11,
        itemHeight: 11,
        textStyle: { color: '#475569', fontWeight: 600 },
      },
      series: [
        {
          type: 'pie',
          radius: ['50%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          label: { formatter: '{b}: {c}', color: '#1f2937', fontWeight: 650 },
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 3,
            borderRadius: 6,
          },
          data: this.toColoredChartData(data),
        },
      ],
    };
  }

  private barOption(data: CounterEntry[]): EChartsOption {
    return {
      color: this.chartPalette,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#111827',
        borderWidth: 0,
        textStyle: { color: '#ffffff' },
      },
      grid: { left: 42, right: 18, top: 30, bottom: 48 },
      xAxis: {
        type: 'category',
        data: data.map(item => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { interval: 0, rotate: data.length > 5 ? 25 : 0, color: '#475569', fontWeight: 600 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#64748b', fontWeight: 600 },
      },
      series: [
        {
          type: 'bar',
          data: this.toColoredChartData(data),
          barMaxWidth: 42,
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }

  private horizontalBarOption(data: CounterEntry[]): EChartsOption {
    const sortedData = data.slice().reverse();

    return {
      color: this.chartPalette,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#111827',
        borderWidth: 0,
        textStyle: { color: '#ffffff' },
      },
      grid: { left: 128, right: 22, top: 24, bottom: 30 },
      xAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#64748b', fontWeight: 600 },
      },
      yAxis: {
        type: 'category',
        data: sortedData.map(item => item.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { width: 112, overflow: 'truncate', color: '#475569', fontWeight: 650 },
      },
      series: [{ type: 'bar', data: this.toColoredChartData(sortedData), barMaxWidth: 30, itemStyle: { borderRadius: [0, 6, 6, 0] } }],
    };
  }

  private toColoredChartData(data: CounterEntry[]): (CounterEntry & { itemStyle: { color: string } })[] {
    return data.map((item, index) => ({
      name: item.name,
      value: item.value,
      itemStyle: {
        color: this.getChartColor(index),
      },
    }));
  }

  private getChartColor(index: number): string {
    if (index < this.chartPalette.length) {
      return this.chartPalette[index];
    }

    return `hsl(${(index * 137.508) % 360}, 68%, 46%)`;
  }

  private getParticipants(request: RequestClass): CoupleI[] {
    return [request.she, request.he].filter(participant => Boolean(participant));
  }

  private getSource(request: RequestClass): string {
    if (request.how_find_us === 'Otro' && this.hasText(request.how_find_us_other)) {
      return this.normalizeText(request.how_find_us_other);
    }

    return this.normalizeText(request.how_find_us);
  }

  private normalizeReligion(value: string): string {
    const normalized = this.normalizeText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (['catolica', 'catolico', 'catolina'].includes(normalized)) {
      return 'Católica';
    }

    if (['cristiana', 'cristiano'].includes(normalized)) {
      return 'Cristiana';
    }

    if (['evangelico', 'evangelica'].includes(normalized)) {
      return 'Evangélica';
    }

    return this.normalizeText(value);
  }

  private normalizeReligionDisplay(participant: CoupleI): string {
    const religion = this.normalizeReligion(participant.religion);
    const otherReligion = this.normalizeText(participant.religion_other);

    if (religion === 'Otra religión' && otherReligion !== 'Sin definir') {
      return `${religion} (${otherReligion})`;
    }

    return religion;
  }

  private normalizeText(value: string | null | undefined): string {
    const text = String(value || '').trim().replace(/\s+/g, ' ');

    if (!text) {
      return 'Sin definir';
    }

    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private normalizeGroupKey(value: string | null | undefined): string {
    const key = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return this.normalizeCityAliasKey(key);
  }

  private normalizeCityAliasKey(key: string): string {
    const aliases: Record<string, string> = {
      'concepcion la vega': 'la vega',
      'monsenor nouel': 'bonao',
      'bonao monsenor nouel': 'bonao',
      'maimon monsenor nouel': 'maimon',
    };

    return aliases[key] || key;
  }

  private normalizeGroupLabel(value: string | null | undefined): string {
    const text = String(value || '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) {
      return 'Sin definir';
    }

    return text
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getAgeRange(age: number): string {
    if (!age || age < 1) {
      return 'Sin fecha';
    }

    if (age < 20) {
      return '<20';
    }

    if (age <= 24) {
      return '20-24';
    }

    if (age <= 29) {
      return '25-29';
    }

    if (age <= 34) {
      return '30-34';
    }

    return '35+';
  }

  private ageRangeOrder(range: string): number {
    const order: Record<string, number> = {
      '<20': 1,
      '20-24': 2,
      '25-29': 3,
      '30-34': 4,
      '35+': 5,
      'Sin fecha': 6,
    };

    return order[range] || 99;
  }

  private countBy<T>(items: T[], selector: (item: T) => string): Record<string, number> {
    return items.reduce(
      (acc, item) => {
        const key = selector(item) || 'Sin definir';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private toSortedEntries(counter: Record<string, number>, sorter?: (left: CounterEntry, right: CounterEntry) => number): CounterEntry[] {
    const entries = Object.entries(counter).map(([name, value]) => ({ name, value }));

    return entries.sort(sorter || ((left, right) => right.value - left.value));
  }

  private countByNormalized<T>(items: T[], selector: (item: T) => string | null | undefined): CounterEntry[] {
    const grouped = new Map<string, CounterEntry>();

    for (const item of items) {
      const value = selector(item);
      const key = this.normalizeGroupKey(value) || 'sin definir';
      const current = grouped.get(key);

      if (current) {
        current.value += 1;
      } else {
        grouped.set(key, {
          name: this.normalizeGroupLabelFromKey(key, value),
          value: 1,
        });
      }
    }

    return Array.from(grouped.values()).sort((left, right) => right.value - left.value);
  }

  private normalizeGroupLabelFromKey(key: string, value: string | null | undefined): string {
    const labels: Record<string, string> = {
      'la vega': 'La Vega',
      bonao: 'Bonao',
      maimon: 'Maimón',
    };

    return labels[key] || this.normalizeGroupLabel(value);
  }

  private topEntry(counter: Record<string, number>): CounterEntry | null {
    return this.toSortedEntries(counter)[0] || null;
  }

  private hasText(value: string | null | undefined): boolean {
    return Boolean(String(value || '').trim());
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private extractId(value: unknown): string {
    if (!value) {
      return '';
    }

    if (typeof value === 'string') {
      return value.split('/').pop() || value;
    }

    if (typeof value === 'object' && 'id' in value) {
      return String((value as { id?: string }).id || '');
    }

    return '';
  }

  private addYears(date: Date, years: number): Date {
    const newDate = new Date(date);
    newDate.setFullYear(newDate.getFullYear() + years);
    return newDate;
  }

  private startOfDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  }

  private endOfDay(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(23, 59, 59, 999);
    return newDate;
  }

  private startOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  private endOfYear(date: Date): Date {
    return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('es-DO').format(value);
  }

  private formatDate(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'Sin fecha';
    }

    return date.toLocaleDateString('es-DO', { month: 'short', year: 'numeric' });
  }

  private averagePerRetreat(entries: DashboardRequestEntry[]): number {
    const retreatCount = new Set(entries.map(entry => entry.retreat.id)).size;

    if (retreatCount === 0) {
      return 0;
    }

    return entries.length / retreatCount;
  }
}
