import type { EmployeeDirectory, ProgressListener } from '../../abstractions/employeeDirectory';
import { Command, type RequestHandler } from '../../common/mediator';

/** `full` reads everyone again instead of only what changed. Re-send GetOrgChartQuery afterwards. */
export class RefreshDirectoryCommand extends Command {
  constructor(
    readonly onProgress?: ProgressListener,
    readonly full = false,
  ) {
    super();
  }
}

export class RefreshDirectoryHandler implements RequestHandler<RefreshDirectoryCommand> {
  constructor(private readonly directory: EmployeeDirectory) {}

  async handle({ onProgress, full }: RefreshDirectoryCommand): Promise<void> {
    await this.directory.refresh(onProgress, full);
  }
}
