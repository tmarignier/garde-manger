// Helpers shared by the API tests.

// A browser on one device: keeps the session cookie between requests.
export class Device {
  readonly baseUrl: string;
  cookie: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {};
    if (this.cookie !== null) {
      headers['Cookie'] = this.cookie;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie !== null) {
      const pair = setCookie.split(';')[0] ?? '';
      this.cookie = pair.endsWith('=') ? null : pair;
    }
    const text = await response.text();
    return { status: response.status, body: text === '' ? undefined : (JSON.parse(text) as unknown) };
  }
}
