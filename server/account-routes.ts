import type { DatabaseSync } from 'node:sqlite';
import { isValidPassword, normalizeName } from '../shared/accounts.ts';
import type { SessionResponse, User, UserResponse, UsersResponse } from '../shared/types.ts';
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  hashPassword,
  sessionCookie,
  verifyDummyPassword,
  verifyPassword,
} from './auth.ts';
import { HttpError, readObject, readString } from './http.ts';
import { created, currentUser, noContent, ok } from './router.ts';
import type { Route, RouteContext, RouteResult } from './router.ts';
import {
  countUsers,
  deleteUser,
  findUserByName,
  findUserWithPasswordById,
  insertUser,
  listUsers,
  nameExists,
  updatePasswordHash,
} from './users.ts';

function readName(body: Record<string, unknown>): string {
  const name = normalizeName(readString(body, 'name'));
  if (name === null) {
    throw new HttpError(400, 'Invalid name');
  }
  return name;
}

function readNewPassword(body: Record<string, unknown>, key: string): string {
  const password = readString(body, key);
  if (!isValidPassword(password)) {
    throw new HttpError(400, 'Invalid password');
  }
  return password;
}

function readUserId(params: Record<string, string>): number {
  const id = Number(params['id']);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(404, 'User not found');
  }
  return id;
}

// Opens a session for the user and answers with the cookie that holds it. A
// session the device already had is closed, since its cookie is replaced.
function logIn(context: RouteContext, user: User): RouteResult {
  if (context.sessionToken !== null) {
    deleteSession(context.db, context.sessionToken);
  }
  const token = createSession(context.db, user.id);
  const body: UserResponse = { user };
  return ok(body, { 'Set-Cookie': sessionCookie(token, context.cookie) });
}

// Inserts the first account, as admin, unless an account already exists. The
// check and the insert run without awaiting in between, so two setup requests
// cannot both succeed.
function insertFirstAdmin(db: DatabaseSync, name: string, passwordHash: string): User {
  if (countUsers(db) > 0) {
    throw new HttpError(409, 'Setup already done');
  }
  return insertUser(db, name, passwordHash, true);
}

export const accountRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: '/api/session',
    access: 'public',
    handler: ({ db, user }) => {
      const body: SessionResponse = { user, setupRequired: user === null && countUsers(db) === 0 };
      return ok(body);
    },
  },
  {
    method: 'POST',
    path: '/api/setup',
    access: 'public',
    handler: async (context) => {
      const body = readObject(context.body);
      const name = readName(body);
      const password = readNewPassword(body, 'password');
      if (countUsers(context.db) > 0) {
        throw new HttpError(409, 'Setup already done');
      }
      const user = insertFirstAdmin(context.db, name, await hashPassword(password));
      return logIn(context, user);
    },
  },
  {
    method: 'POST',
    path: '/api/login',
    access: 'public',
    handler: async (context) => {
      const body = readObject(context.body);
      const name = readString(body, 'name').trim();
      const password = readString(body, 'password');
      const found = findUserByName(context.db, name);
      if (found === null) {
        await verifyDummyPassword(password);
        throw new HttpError(401, 'Invalid name or password');
      }
      if (!(await verifyPassword(password, found.passwordHash))) {
        throw new HttpError(401, 'Invalid name or password');
      }
      return logIn(context, found.user);
    },
  },
  {
    // Public so that a device whose session has expired can still clear its cookie.
    method: 'POST',
    path: '/api/logout',
    access: 'public',
    handler: ({ db, sessionToken, cookie }) => {
      if (sessionToken !== null) {
        deleteSession(db, sessionToken);
      }
      return { status: 204, body: undefined, headers: { 'Set-Cookie': sessionCookie(null, cookie) } };
    },
  },
  {
    method: 'PUT',
    path: '/api/me/password',
    handler: async (context) => {
      const user = currentUser(context);
      const body = readObject(context.body);
      const currentPassword = readString(body, 'currentPassword');
      const newPassword = readNewPassword(body, 'newPassword');
      const found = findUserWithPasswordById(context.db, user.id);
      if (found === null || !(await verifyPassword(currentPassword, found.passwordHash))) {
        throw new HttpError(403, 'Wrong current password');
      }
      updatePasswordHash(context.db, user.id, await hashPassword(newPassword));
      deleteUserSessions(context.db, user.id, context.sessionToken);
      return noContent();
    },
  },
  {
    method: 'GET',
    path: '/api/users',
    access: 'admin',
    handler: ({ db }) => {
      const body: UsersResponse = { users: listUsers(db) };
      return ok(body);
    },
  },
  {
    method: 'POST',
    path: '/api/users',
    access: 'admin',
    handler: async ({ db, body: rawBody }) => {
      const body = readObject(rawBody);
      const name = readName(body);
      const password = readNewPassword(body, 'password');
      const isAdmin = body['isAdmin'] ?? false;
      if (typeof isAdmin !== 'boolean') {
        throw new HttpError(400, 'Missing or invalid field: isAdmin');
      }
      const passwordHash = await hashPassword(password);
      if (nameExists(db, name)) {
        throw new HttpError(409, 'Name already taken');
      }
      const response: UserResponse = { user: insertUser(db, name, passwordHash, isAdmin) };
      return created(response);
    },
  },
  {
    // Resets the password of an account and logs it out of its devices.
    method: 'PUT',
    path: '/api/users/:id',
    access: 'admin',
    handler: async (context) => {
      const id = readUserId(context.params);
      const password = readNewPassword(readObject(context.body), 'password');
      const passwordHash = await hashPassword(password);
      if (findUserWithPasswordById(context.db, id) === null) {
        throw new HttpError(404, 'User not found');
      }
      updatePasswordHash(context.db, id, passwordHash);
      deleteUserSessions(context.db, id, context.sessionToken);
      return noContent();
    },
  },
  {
    // Deleting one's own account is refused, so there is always an admin left.
    method: 'DELETE',
    path: '/api/users/:id',
    access: 'admin',
    handler: (context) => {
      const id = readUserId(context.params);
      if (id === currentUser(context).id) {
        throw new HttpError(400, 'Cannot delete your own account');
      }
      if (!deleteUser(context.db, id)) {
        throw new HttpError(404, 'User not found');
      }
      return noContent();
    },
  },
];
