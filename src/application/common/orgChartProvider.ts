import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { OrgChart, OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { DirectorySnapshot, EmployeeDirectory, ProgressListener } from '../abstractions/employeeDirectory';

interface ChartForSnapshot {
  readonly chart: OrgChart;
  readonly snapshot: DirectorySnapshot;
}

/** Shares one built chart between queries until the snapshot or the options change. */
export class OrgChartProvider {
  private latest: (ChartForSnapshot & { readonly optionsKey: string }) | null = null;

  constructor(private readonly directory: EmployeeDirectory) {}

  async get(options: OrgChartOptions, onProgress?: ProgressListener): Promise<ChartForSnapshot> {
    const snapshot = await this.directory.getSnapshot(onProgress);
    const optionsKey = JSON.stringify(options);
    if (this.latest?.snapshot !== snapshot || this.latest.optionsKey !== optionsKey) {
      this.latest = { snapshot, optionsKey, chart: buildOrgChart(snapshot.employees, options) };
    }
    return this.latest;
  }
}
