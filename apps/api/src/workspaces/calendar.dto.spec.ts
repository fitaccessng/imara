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

  it('accepts only the selectable calendar reminder offsets', async () => {
    for (const reminderMinutesBefore of [0, 5, 15, 30, 60, 1440, null]) {
      const dto = Object.assign(new CreateCalendarEventDto(), {
        title: 'Review',
        startsAt: '2026-11-10T10:00:00Z',
        endsAt: '2026-11-10T11:00:00Z',
        allDay: false,
        reminderMinutesBefore,
      });
      expect(await validate(dto)).toHaveLength(0);
    }

    const invalid = Object.assign(new CreateCalendarEventDto(), {
      title: 'Review',
      startsAt: '2026-11-10T10:00:00Z',
      endsAt: '2026-11-10T11:00:00Z',
      allDay: false,
      reminderMinutesBefore: 10,
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('rejects invalid email delivery recipients', async () => {
    const dto = Object.assign(new SendWorkspaceFileDto(), { emailRecipients: ['bad-address'] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
