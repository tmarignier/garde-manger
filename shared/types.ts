// Types shared between the server and the client.

export type HealthResponse = {
  ok: true;
};

export type ErrorResponse = {
  error: string;
};

export type User = {
  id: number;
  name: string;
  isAdmin: boolean;
  createdAt: string;
};

// GET /api/session: who is logged in on this device, and whether the first
// account still has to be created.
export type SessionResponse = {
  user: User | null;
  setupRequired: boolean;
};

export type UserResponse = {
  user: User;
};

export type UsersResponse = {
  users: User[];
};

// POST /api/setup and POST /api/login.
export type CredentialsRequest = {
  name: string;
  password: string;
};

// POST /api/users.
export type CreateUserRequest = {
  name: string;
  password: string;
  isAdmin?: boolean;
};

// PUT /api/users/:id.
export type ResetPasswordRequest = {
  password: string;
};

// PUT /api/me/password.
export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type Category = {
  id: number;
  name: string;
  position: number;
};

export type CategoryResponse = {
  category: Category;
};

export type CategoriesResponse = {
  categories: Category[];
};

// POST /api/categories.
export type CreateCategoryRequest = {
  name: string;
};

export type Product = {
  id: number;
  name: string;
  categoryId: number | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  targetQuantity: number | null;
  // The name of the last person who changed the product, null when their
  // account was deleted.
  updatedByName: string | null;
  updatedAt: string;
};

export type ProductResponse = {
  product: Product;
};

export type ProductsResponse = {
  products: Product[];
};

// POST /api/products and PUT /api/products/:id.
export type ProductRequest = {
  name: string;
  categoryId: number | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  targetQuantity: number | null;
};

// PUT /api/products/:id. Without quantity, the stock is left as it is, so that
// editing a product does not undo a + or − made meanwhile on another device.
export type UpdateProductRequest = Omit<ProductRequest, 'quantity'> & {
  quantity?: number;
};

// POST /api/products/:id/adjust.
export type AdjustmentRequest = {
  delta: number;
};
