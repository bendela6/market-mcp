import * as v from 'valibot';

export const UserSchema = v.object({
  id:        v.string(),
  name:      v.optional(v.string()),
  createdAt: v.string(),
});

export const CreateUserBodySchema = v.object({
  name: v.optional(v.string()),
});

export type User = v.InferOutput<typeof UserSchema>;
export type CreateUserBody = v.InferOutput<typeof CreateUserBodySchema>;
