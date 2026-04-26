// Mobile (native client) auth — JWT bearer tokens.
//
// Native clients can't easily round-trip NextAuth's encrypted session cookies,
// so this module issues plain HS256 JWTs that are validated on every request.
// The web app keeps using NextAuth cookies; `getAuthUser(req)` accepts either.
//
// Token shapes:
//   access:  { sub, typ: "access",  iat, exp }   ~ 1 hour
//   refresh: { sub, typ: "refresh", iat, exp }   ~ 60 days
//
// Refresh tokens are not (yet) tracked in the DB, so revocation only happens
// via the natural expiry. If we need server-side revocation later, store a
// jti per refresh token in a new MobileToken table and check it on refresh.

import { SignJWT, jwtVerify } from "jose";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ACCESS_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

const ISSUER = "tesil-media";
const AUDIENCE = "tesil-mobile";

function getSecret(): Uint8Array {
  const raw = process.env.MOBILE_JWT_SECRET ?? process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error(
      "MOBILE_JWT_SECRET (or AUTH_SECRET) must be set to sign mobile tokens.",
    );
  }
  return new TextEncoder().encode(raw);
}

type TokenType = "access" | "refresh";

export type MobileTokens = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // unix seconds
  refreshTokenExpiresAt: number;
};

async function sign(userId: string, typ: TokenType, ttlSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSec;
  const token = await new SignJWT({ typ })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());
  return { token, exp };
}

export async function issueMobileTokens(userId: string): Promise<MobileTokens> {
  const [access, refresh] = await Promise.all([
    sign(userId, "access", ACCESS_TTL_SECONDS),
    sign(userId, "refresh", REFRESH_TTL_SECONDS),
  ]);
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessTokenExpiresAt: access.exp,
    refreshTokenExpiresAt: refresh.exp,
  };
}

type VerifiedToken = { userId: string; typ: TokenType };

export async function verifyMobileToken(
  token: string,
  expected: TokenType,
): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (payload.typ !== expected) return null;
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub, typ: expected };
  } catch {
    return null;
  }
}

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Returns the authenticated user for an API request, accepting either:
 *   - Authorization: Bearer <access JWT>  (mobile clients)
 *   - NextAuth session cookie              (web clients)
 *
 * Returns null if neither is present or valid. The DB is only hit for the
 * Bearer path; the cookie path reuses NextAuth's already-decoded session.
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const verified = await verifyMobileToken(token, "access");
    if (!verified) return null;

    const user = await prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, email: true, name: true },
    });
    return user ?? null;
  }

  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
}
