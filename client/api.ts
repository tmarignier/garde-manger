import type { ErrorResponse, HealthResponse } from '../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(path, init);
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(response.status, isErrorResponse(data) ? data.error : response.statusText);
  }
  return data;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string';
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true;
}

export async function getHealth(): Promise<HealthResponse> {
  const data = await request('GET', '/api/health');
  if (!isHealthResponse(data)) {
    throw new Error('Unexpected health response');
  }
  return data;
}
