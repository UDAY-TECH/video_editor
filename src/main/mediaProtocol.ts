import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { extname } from 'path';
import { Readable } from 'stream';
import { fromMediaUrl } from '../shared/mediaUrl';

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

// Serves local media over the `media://` scheme with manual Range support.
// <video>/<audio> elements rely on 206 Partial Content responses to seek;
// without this, scrubbing has no byte range to jump to and playback resets.
export async function handleMediaRequest(request: Request): Promise<Response> {
  const filePath = fromMediaUrl(request.url);

  let fileSize: number;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return new Response(null, { status: 404 });
  }

  const contentType = mimeTypeFor(filePath);
  const rangeHeader = request.headers.get('range');
  const match = rangeHeader ? /bytes=(\d+)-(\d*)/.exec(rangeHeader) : null;

  if (match) {
    const start = parseInt(match[1], 10);
    const end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1;

    if (start < fileSize && start <= end) {
      const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(end - start + 1),
          'Content-Type': contentType,
        },
      });
    }
  }

  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    },
  });
}
