import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ErrorResponse } from '../shared/types.ts';

const MAX_BODY_BYTES = 1024 * 1024;

// An error that is sent to the client with its status code and message.
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// Reads a JSON request body. Returns undefined when the body is empty.
export async function readJson(body: AsyncIterable<Uint8Array | string>): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of body) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body too large');
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

export function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  headers: Record<string, string> = {},
): void {
  const body: ErrorResponse = { error: message };
  sendJson(res, status, body, headers);
}

// True when the request carries a non-empty body.
export function hasBody(req: IncomingMessage): boolean {
  const length = req.headers['content-length'];
  return (length !== undefined && length !== '0') || req.headers['transfer-encoding'] !== undefined;
}

export function isJsonRequest(req: IncomingMessage): boolean {
  const mediaType = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}
