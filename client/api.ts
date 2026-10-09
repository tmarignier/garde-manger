import type {
  Category,
  ChangePasswordRequest,
  CreateUserRequest,
  CredentialsRequest,
  ErrorResponse,
  HealthResponse,
  Product,
  ProductRequest,
  ResetPasswordRequest,
  SessionResponse,
  UpdateProductRequest,
  User,
} from '../shared/types.ts';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Called when the server answers 401: the session has expired or was revoked.
let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  const response = await fetch(path, init);
  const data: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    // A failed login is not an expired session.
    if (response.status === 401 && path !== '/api/login') {
      onUnauthorized();
    }
    throw new ApiError(response.status, isErrorResponse(data) ? data.error : response.statusText);
  }
  return data;
}

// The French message to show for a failed request. `messages` gives the
// message for the statuses the screen expects.
export function errorMessage(error: unknown, messages: Record<number, string> = {}): string {
  if (error instanceof ApiError) {
    return messages[error.status] ?? 'Une erreur est survenue. Réessayez.';
  }
  return 'Impossible de joindre le serveur.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return isRecord(value) && typeof value['error'] === 'string';
}

function isHealthResponse(value: unknown): value is HealthResponse {
  return isRecord(value) && value['ok'] === true;
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['isAdmin'] === 'boolean' &&
    typeof value['createdAt'] === 'string'
  );
}

function readUser(data: unknown): User {
  if (!isRecord(data) || !isUser(data['user'])) {
    throw new Error('Unexpected user response');
  }
  return data['user'];
}

export async function getHealth(): Promise<HealthResponse> {
  const data = await request('GET', '/api/health');
  if (!isHealthResponse(data)) {
    throw new Error('Unexpected health response');
  }
  return data;
}

export async function getSession(): Promise<SessionResponse> {
  const data = await request('GET', '/api/session');
  if (
    !isRecord(data) ||
    typeof data['setupRequired'] !== 'boolean' ||
    (data['user'] !== null && !isUser(data['user']))
  ) {
    throw new Error('Unexpected session response');
  }
  return { user: data['user'], setupRequired: data['setupRequired'] };
}

export async function setUp(credentials: CredentialsRequest): Promise<User> {
  return readUser(await request('POST', '/api/setup', credentials));
}

export async function logIn(credentials: CredentialsRequest): Promise<User> {
  return readUser(await request('POST', '/api/login', credentials));
}

export async function logOut(): Promise<void> {
  await request('POST', '/api/logout');
}

export async function changePassword(change: ChangePasswordRequest): Promise<void> {
  await request('PUT', '/api/me/password', change);
}

export async function listUsers(): Promise<User[]> {
  const data = await request('GET', '/api/users');
  if (!isRecord(data) || !Array.isArray(data['users']) || !data['users'].every(isUser)) {
    throw new Error('Unexpected users response');
  }
  return data['users'];
}

export async function createUser(user: CreateUserRequest): Promise<User> {
  return readUser(await request('POST', '/api/users', user));
}

export async function resetPassword(id: number, reset: ResetPasswordRequest): Promise<void> {
  await request('PUT', `/api/users/${id}`, reset);
}

export async function deleteUser(id: number): Promise<void> {
  await request('DELETE', `/api/users/${id}`);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isCategory(value: unknown): value is Category {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['name'] === 'string' &&
    typeof value['position'] === 'number'
  );
}

function isProduct(value: unknown): value is Product {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['name'] === 'string' &&
    isNumberOrNull(value['categoryId']) &&
    typeof value['unit'] === 'string' &&
    typeof value['quantity'] === 'number' &&
    typeof value['minQuantity'] === 'number' &&
    isNumberOrNull(value['targetQuantity']) &&
    (value['updatedByName'] === null || typeof value['updatedByName'] === 'string') &&
    typeof value['updatedAt'] === 'string'
  );
}

function readProduct(data: unknown): Product {
  if (!isRecord(data) || !isProduct(data['product'])) {
    throw new Error('Unexpected product response');
  }
  return data['product'];
}

export async function listCategories(): Promise<Category[]> {
  const data = await request('GET', '/api/categories');
  if (!isRecord(data) || !Array.isArray(data['categories']) || !data['categories'].every(isCategory)) {
    throw new Error('Unexpected categories response');
  }
  return data['categories'];
}

export async function createCategory(name: string): Promise<Category> {
  const data = await request('POST', '/api/categories', { name });
  if (!isRecord(data) || !isCategory(data['category'])) {
    throw new Error('Unexpected category response');
  }
  return data['category'];
}

export async function listProducts(): Promise<Product[]> {
  const data = await request('GET', '/api/products');
  if (!isRecord(data) || !Array.isArray(data['products']) || !data['products'].every(isProduct)) {
    throw new Error('Unexpected products response');
  }
  return data['products'];
}

export async function createProduct(product: ProductRequest): Promise<Product> {
  return readProduct(await request('POST', '/api/products', product));
}

export async function updateProduct(id: number, product: UpdateProductRequest): Promise<Product> {
  return readProduct(await request('PUT', `/api/products/${id}`, product));
}

export async function deleteProduct(id: number): Promise<void> {
  await request('DELETE', `/api/products/${id}`);
}

export async function adjustProduct(id: number, delta: number): Promise<Product> {
  return readProduct(await request('POST', `/api/products/${id}/adjust`, { delta }));
}
