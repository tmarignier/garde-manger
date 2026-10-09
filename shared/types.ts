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
