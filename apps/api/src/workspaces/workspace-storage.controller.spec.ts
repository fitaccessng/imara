jest.mock('@nestjs/common', () => {
  const decorator = () => () => undefined;
  return {
    Body: decorator,
    Controller: decorator,
    Delete: decorator,
    Get: decorator,
    HttpCode: decorator,
    HttpStatus: { CREATED: 201, NO_CONTENT: 204, OK: 200 },
    Injectable: decorator,
    Param: decorator,
    ParseUUIDPipe: class {},
    Patch: decorator,
    Post: decorator,
    Put: decorator,
    Query: decorator,
    Req: decorator,
    Res: decorator,
    UploadedFile: decorator,
    UseGuards: decorator,
    UseInterceptors: decorator,
  };
});

jest.mock('../storage/temp-upload.interceptor', () => ({ TempUploadInterceptor: () => class {} }));
jest.mock('./workspace-storage.service', () => ({ WorkspaceStorageService: class {} }));
jest.mock('./file-delivery.service', () => ({ FileDeliveryService: class {} }));

import { WorkspaceStorageController } from './workspace-storage.controller';

describe('WorkspaceStorageController full-text endpoints', () => {
  const listUnindexed = jest.fn();
  const setOcrText = jest.fn();
  const search = jest.fn();
  const controller = new WorkspaceStorageController(
    { listUnindexed, setOcrText, search } as never,
    {} as never,
  );
  const request = { auth: { userId: 'member-a' } } as never;

  beforeEach(() => jest.clearAllMocks());

  it('passes the caller identity to unindexed file listing', () => {
    controller.listUnindexedFiles(request, 'workspace-a');
    expect(listUnindexed).toHaveBeenCalledWith('workspace-a', 'member-a');
  });

  it('passes OCR text to the workspace service', () => {
    controller.setOcrText(request, 'workspace-a', 'file-a', { text: 'recognized words' });
    expect(setOcrText).toHaveBeenCalledWith('workspace-a', 'member-a', 'file-a', 'recognized words');
  });

  it('forwards the workspace search query', () => {
    controller.searchFiles(request, 'workspace-a', { q: 'invoice' });
    expect(search).toHaveBeenCalledWith('workspace-a', 'member-a', 'invoice');
  });
});
