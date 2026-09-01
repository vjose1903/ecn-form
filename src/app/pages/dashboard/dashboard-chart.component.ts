import { AfterViewInit, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

@Component({
  selector: 'app-dashboard-chart',
  template: `<div #chartContainer class="dashboard-chart"></div>`,
  styles: [
    `
      .dashboard-chart {
        width: 100%;
        height: 100%;
        min-height: 232px;
      }
    `,
  ],
})
export class DashboardChartComponent implements AfterViewInit, OnDestroy {
  option = input.required<EChartsOption>();
  private chartContainer = viewChild.required<ElementRef<HTMLDivElement>>('chartContainer');
  private chart: echarts.ECharts | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const option = this.option();

      if (this.chart) {
        this.chart.setOption(option, true);
      }
    });
  }

  ngAfterViewInit(): void {
    this.chart = echarts.init(this.chartContainer().nativeElement);
    this.chart.setOption(this.option(), true);

    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.chartContainer().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }
}
