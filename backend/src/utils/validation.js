import { HttpError } from "./http.js";

export function ensureObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Le corps de la requête doit être un objet JSON.", "INVALID_BODY");
  }
  return value;
}

export function text(value, field, { required = false, min = 0, max = 500 } = {}) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new HttpError(400, `${field} est obligatoire.`, "VALIDATION_ERROR");
  if (result && result.length < min) throw new HttpError(400, `${field} est trop court.`, "VALIDATION_ERROR");
  if (result.length > max) throw new HttpError(400, `${field} dépasse ${max} caractères.`, "VALIDATION_ERROR");
  return result;
}

export function email(value) {
  const result = text(value, "L'adresse e-mail", { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new HttpError(400, "L'adresse e-mail n'est pas valide.", "VALIDATION_ERROR");
  }
  return result;
}

export function enumValue(value, field, allowed, fallback = "") {
  const result = String(value ?? fallback);
  if (!allowed.includes(result)) {
    throw new HttpError(400, `${field} n'est pas valide.`, "VALIDATION_ERROR");
  }
  return result;
}

export function stringArray(value, field, { required = false, max = 20 } = {}) {
  if (value == null && !required) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `${field} doit être une liste.`, "VALIDATION_ERROR");
  const result = [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  if (required && !result.length) throw new HttpError(400, `${field} est obligatoire.`, "VALIDATION_ERROR");
  if (result.length > max) throw new HttpError(400, `${field} contient trop de valeurs.`, "VALIDATION_ERROR");
  return result;
}

export function numberValue(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) {
  const result = value === "" || value == null ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw new HttpError(400, `${field} n'est pas valide.`, "VALIDATION_ERROR");
  }
  return result;
}

export function rejectUnknownFields(object, allowedFields) {
  const unknown = Object.keys(object).filter((key) => !allowedFields.includes(key));
  if (unknown.length) {
    throw new HttpError(400, `Champ non autorisé : ${unknown[0]}.`, "VALIDATION_ERROR");
  }
}
