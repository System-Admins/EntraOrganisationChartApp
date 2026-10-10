import type { EmployeePhotos } from '../../abstractions/employeePhotos';
import { Query, type RequestHandler } from '../../common/mediator';

export class GetEmployeePhotoQuery extends Query<string | null> {
  constructor(readonly employeeId: string) {
    super();
  }
}

export class GetEmployeePhotoHandler implements RequestHandler<GetEmployeePhotoQuery> {
  constructor(private readonly photos: EmployeePhotos) {}

  handle({ employeeId }: GetEmployeePhotoQuery): Promise<string | null> {
    return this.photos.getPhotoUrl(employeeId);
  }
}
