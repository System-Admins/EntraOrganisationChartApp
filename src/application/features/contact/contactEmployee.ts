import type { Employee } from '@/domain/employees/employee';
import type { ContactChannel, ContactLauncher } from '../../abstractions/contactLauncher';
import { Command, type RequestHandler } from '../../common/mediator';

export class ContactEmployeeCommand extends Command {
  constructor(
    readonly employee: Employee,
    readonly channel: ContactChannel,
  ) {
    super();
  }
}

export class ContactEmployeeHandler implements RequestHandler<ContactEmployeeCommand> {
  constructor(private readonly launcher: ContactLauncher) {}

  handle({ employee, channel }: ContactEmployeeCommand): Promise<void> {
    switch (channel) {
      case 'chat':
        return this.launcher.chat(employee.userPrincipalName);
      case 'call':
        return this.launcher.call(employee.userPrincipalName);
      case 'email':
        return employee.mail
          ? this.launcher.email(employee.mail)
          : Promise.reject(new Error(`${employee.displayName} has no e-mail address.`));
    }
  }
}
