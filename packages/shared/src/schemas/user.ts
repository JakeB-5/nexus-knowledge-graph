import { z } from "zod";
import { IdSchema, TimestampsSchema } from "./common.js";

export const UserRoleSchema = z.enum(["admin", "editor", "viewer"]);

export const UserSchema = z
  .object({
    id: IdSchema,
    email: z.string().email(),
    name: z.string().min(1).max(200),
    role: UserRoleSchema.default("viewer"),
    avatarUrl: z.string().url().optional(),
  })
  .merge(TimestampsSchema);

export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type TokenPair = z.infer<typeof TokenPairSchema>;
