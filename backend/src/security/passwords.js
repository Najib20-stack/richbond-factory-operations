import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const LEGACY_INITIAL_PASSWORD = "richbond123";

export function isPasswordHash(value) {
  return /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(String(value || ""));
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(String(password), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return [
    "scrypt",
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString("base64url"),
    Buffer.from(derivedKey).toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, encodedHash) {
  if (!isPasswordHash(encodedHash)) return false;

  try {
    const [, n, r, p, saltValue, hashValue] = encodedHash.split("$");
    const expected = Buffer.from(hashValue, "base64url");
    const actual = Buffer.from(
      await scrypt(String(password), Buffer.from(saltValue, "base64url"), expected.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 64 * 1024 * 1024,
      }),
    );
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < 10 || value.length > 128) {
    return "Le mot de passe doit contenir entre 10 et 128 caractères.";
  }
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return "Le mot de passe doit contenir une minuscule, une majuscule et un chiffre.";
  }
  return "";
}
