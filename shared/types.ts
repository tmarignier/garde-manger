// Types shared between the server and the client.

// GET /api/health. `version` is the app's version, shown in the footer.
export type HealthResponse = {
  ok: true;
  version: string;
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

// POST /api/categories and PUT /api/categories/:id.
export type CategoryRequest = {
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

// A product of the shopping list, with the quantity to buy.
export type ShoppingListItem = {
  product: Product;
  quantityToBuy: number;
};

// An item added by hand to the shopping list, outside the tracked stock.
export type ExtraItem = {
  id: number;
  name: string;
};

// GET /api/shopping-list and POST /api/shopping-list/purchases.
export type ShoppingListResponse = {
  items: ShoppingListItem[];
  extraItems: ExtraItem[];
};

export type Purchase = {
  productId: number;
  quantity: number;
};

// POST /api/shopping-list/purchases: the bought quantities are added to the
// stock and the bought extra items leave the list.
export type PurchasesRequest = {
  purchases: Purchase[];
  extraItemIds: number[];
};

// POST /api/extra-items.
export type CreateExtraItemRequest = {
  name: string;
};

export type ExtraItemResponse = {
  extraItem: ExtraItem;
};
