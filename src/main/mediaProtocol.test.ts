import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleMediaRequest } from './mediaProtocol';
import { toMediaUrl } from '../shared/mediaUrl';

function writeTempFile(bytes: number[]): string {
  const dir = mkdtempSync(join(tmpdir(), 've-protocol-test-'));
  const filePath = join(dir, 'test.mp4');
  writeFileSync(filePath, Buffer.from(bytes));
  return filePath;
}

describe('handleMediaRequest', () => {
  it('returns 206 partial content honoring a Range header', async () => {
    const content = Array.from({ length: 1000 }, (_, i) => i % 256);
    const filePath = writeTempFile(content);

    const request = new Request(toMediaUrl(filePath), { headers: { Range: 'bytes=100-199' } });
    const response = await handleMediaRequest(request);

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(response.headers.get('content-length')).toBe('100');

    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.length).toBe(100);
    expect(body[0]).toBe(content[100]);
    expect(body[99]).toBe(content[199]);
  });

  it('returns 200 with the full file when there is no Range header', async () => {
    const filePath = writeTempFile([1, 2, 3, 4, 5]);

    const response = await handleMediaRequest(new Request(toMediaUrl(filePath)));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe('5');
  });

  it('returns 404 for a missing file', async () => {
    const response = await handleMediaRequest(new Request(toMediaUrl('C:\\nonexistent\\file.mp4')));
    expect(response.status).toBe(404);
  });
});
