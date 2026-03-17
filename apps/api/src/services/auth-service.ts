import * as argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { NexusError } from "@nexus/shared";
import { db as getDb, createUser, getUserByEmail, getUserById } from "@nexus/db";
import { randomUUID } from "node:crypto";

// ── Constants ──────────────────────────────────────────────────────────────

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Password policy ────────────────────────────────────────────────────────

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters");
  if (password.length > 128) errors.push("Password must not exceed 128 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain at least one digit");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain at least one special character");
  return { valid: errors.length === 0, errors };
}

// ── Token blacklist (in-memory for logout) ─────────────────────────────────

class TokenBlacklist {
  private readonly blacklisted = new Map<string, number>(); // jti → expiresAt

  add(jti: string, expiresAt: number): void {
    this.blacklisted.set(jti, expiresAt);
    this.prune();
  }

  has(jti: string): boolean {
    return this.blacklisted.has(jti);
  }

  private prune(): void {
    const now = Date.now();
    for (const [jti, exp] of this.blacklisted) {
      if (exp < now) this.blacklisted.delete(jti);
    }
  }
}

const blacklist = new TokenBlacklist();

// ── Token payload types ────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;   // userId
  email: string;
  role: string;
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;   // userId
  jti: string;
  family: string;
}

// ── Auth service ───────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date;
}

export class AuthService {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;
  private readonly db: ReturnType<typeof getDb>;

  constructor(
    accessSecret = process.env["JWT_SECRET"] ?? "",
    refreshSecret = process.env["JWT_REFRESH_SECRET"] ?? "",
  ) {
    if (!accessSecret || !refreshSecret) {
      throw new Error("JWT secrets must be configured");
    }
    this.accessSecret = new TextEncoder().encode(accessSecret);
    this.refreshSecret = new TextEncoder().encode(refreshSecret);
    this.db = getDb();
  }

  // ── Registration ──

  async register(input: RegisterInput): Promise<{ user: UserPublic; tokens: TokenPair }> {
    const pwValidation = validatePasswordStrength(input.password);
    if (!pwValidation.valid) {
      throw NexusError.validation("Password does not meet requirements", {
        errors: pwValidation.errors,
      });
    }

    const existing = await getUserByEmail(this.db, input.email.toLowerCase());
    if (existing) {
      throw NexusError.conflict(`Email already registered: ${input.email}`);
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await createUser(this.db, {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
      role: "viewer",
    });

    const tokens = await this.generateTokenPair(user.id, user.email, user.role);
    const publicUser: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
    return { user: publicUser, tokens };
  }

  // ── Login ──

  async login(input: LoginInput): Promise<{ user: UserPublic; tokens: TokenPair }> {
    const user = await getUserByEmail(this.db, input.email.toLowerCase());

    if (!user) {
      await argon2.hash("dummy-password-to-prevent-timing");
      throw NexusError.unauthorized("Invalid email or password");
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw NexusError.unauthorized("Invalid email or password");
    }

    const tokens = await this.generateTokenPair(user.id, user.email, user.role);
    const publicUser: UserPublic = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
    return { user: publicUser, tokens };
  }

  // ── Token refresh ──

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      const { payload: p } = await jwtVerify(refreshToken, this.refreshSecret);
      payload = {
        sub: p["sub"] as string,
        jti: p["jti"] as string,
        family: p["family"] as string,
      };
    } catch {
      throw NexusError.unauthorized("Invalid or expired refresh token");
    }

    if (blacklist.has(payload.jti)) {
      throw NexusError.unauthorized("Refresh token has been revoked");
    }

    const user = await getUserById(this.db, payload.sub);
    if (!user) throw NexusError.unauthorized("User not found");

    blacklist.add(payload.jti, Date.now() + REFRESH_TOKEN_TTL_MS);

    return this.generateTokenPair(user.id, user.email, user.role, payload.family);
  }

  // ── Logout ──

  async logout(accessToken: string): Promise<void> {
    try {
      const { payload } = await jwtVerify(accessToken, this.accessSecret);
      const jti = payload["jti"] as string | undefined;
      if (jti) {
        const exp = (payload["exp"] ?? 0) * 1000;
        blacklist.add(jti, exp);
      }
    } catch {
      // Token already invalid – treat as success
    }
  }

  // ── Token verification ──

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.accessSecret);
      const jti = payload["jti"] as string;

      if (blacklist.has(jti)) {
        throw NexusError.unauthorized("Token has been revoked");
      }

      return {
        sub: payload["sub"] as string,
        email: payload["email"] as string,
        role: payload["role"] as string,
        jti,
      };
    } catch (err) {
      if (err instanceof NexusError) throw err;
      throw NexusError.unauthorized("Invalid or expired access token");
    }
  }

  // ── Private helpers ──

  private async generateTokenPair(
    userId: string,
    email: string,
    role: string,
    family?: string,
  ): Promise<TokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const tokenFamily = family ?? randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({ email, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setJti(accessJti)
      .setIssuedAt(now)
      .setExpirationTime(ACCESS_TOKEN_TTL)
      .sign(this.accessSecret);

    const refreshToken = await new SignJWT({ family: tokenFamily })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setJti(refreshJti)
      .setIssuedAt(now)
      .setExpirationTime(REFRESH_TOKEN_TTL)
      .sign(this.refreshSecret);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_MS / 1000,
    };
  }
}
