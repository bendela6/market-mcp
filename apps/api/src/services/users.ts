import { eq } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import { users, type UserRow } from '../db/schema.js';
import type { User, CreateUserBody } from '@market/contracts';

export interface UsersService {
  create(body: CreateUserBody): Promise<User>;
  getById(id: string): Promise<User | undefined>;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

export function createUsersService(db: DbClient): UsersService {
  return {
    async create(body) {
      const [row] = await db.insert(users).values({ name: body.name ?? null }).returning();
      return rowToUser(row!);
    },
    async getById(id) {
      const row = await db.query.users.findFirst({ where: eq(users.id, id) });
      return row ? rowToUser(row) : undefined;
    },
  };
}
