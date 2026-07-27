import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const PROJECT_ROOT = path.resolve(currentDir, "../../..");
export const PORT = Number(process.env.PORT || 3000);
export const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");
export const DATABASE_DIR = process.env.DATABASE_DIR
  ? path.resolve(process.env.DATABASE_DIR)
  : path.join(PROJECT_ROOT, "database");
export const DATABASE_FILE = path.join(DATABASE_DIR, "richbond-db.json");
export const SEED_FILE = path.join(DATABASE_DIR, "seed.json");
