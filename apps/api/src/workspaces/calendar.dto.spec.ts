import { validate } from 'class-validator';
import { CreateCalendarEventDto } from './calendar.dto';
import { SendWorkspaceFileDto } from './file-delivery.dto';

describe('calendar and file delivery DTO validation', () => {
  it('requires ISO date strings, a title, and a boolean allDay value', async () => {
    const dto = Object.assign(new CreateCalendarEventDto(), {
      title: '   ', startsAt: 'not-a-date', endsAt: '2026-11-10', allDay: 'false',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('rejects invalid email delivery recipients', async () => {
    const dto = Object.assign(new SendWorkspaceFileDto(), { emailRecipients: ['bad-address'] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
