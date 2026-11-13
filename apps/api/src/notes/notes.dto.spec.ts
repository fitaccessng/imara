import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateNoteDto, ListNotesQueryDto } from './notes.dto';

describe('Notes DTO validation', () => {
  it('trims and accepts valid notes at the configured length limits', async () => {
    const dto = plainToInstance(CreateNoteDto, {
      title: ` ${'t'.repeat(120)} `,
      body: ` ${'b'.repeat(20000)} `,
    });
    expect(dto.title).toHaveLength(120);
    expect(dto.body).toHaveLength(20000);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects empty or oversized note fields', async () => {
    const dto = plainToInstance(CreateNoteDto, { title: '  ', body: 'x'.repeat(20001) });
    const errors = await validate(dto);
    expect(errors.map(({ property }) => property).sort()).toEqual(['body', 'title']);
  });

  it('limits search text length', async () => {
    const dto = plainToInstance(ListNotesQueryDto, { search: 'x'.repeat(201) });
    expect((await validate(dto)).map(({ property }) => property)).toContain('search');
  });
});
