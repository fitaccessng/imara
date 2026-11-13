import { validate } from 'class-validator';
import { SetOcrTextDto } from './storage.dto';

describe('SetOcrTextDto', () => {
  it('accepts extracted text up to the configured request limit', async () => {
    const dto = new SetOcrTextDto();
    dto.text = 'x'.repeat(100_000);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects non-string and over-limit text', async () => {
    const nonString = new SetOcrTextDto();
    (nonString as unknown as { text: unknown }).text = 42;
    await expect(validate(nonString)).resolves.not.toHaveLength(0);

    const overLimit = new SetOcrTextDto();
    overLimit.text = 'x'.repeat(100_001);
    await expect(validate(overLimit)).resolves.not.toHaveLength(0);
  });
});
