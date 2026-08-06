import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { FRONTEND_DIR } from "../src/config/env.js";
import { staticCacheControl } from "../src/services/staticFileService.js";

test("la page HTML n'est jamais servie depuis un cache obsolete", () => {
  assert.equal(staticCacheControl(path.join(FRONTEND_DIR, "index.html")), "no-store");
  assert.equal(staticCacheControl(path.join(FRONTEND_DIR, "manifest.webmanifest")), "no-cache");
});

test("les ressources versionnees peuvent etre conservees durablement", () => {
  assert.equal(
    staticCacheControl(path.join(FRONTEND_DIR, "assets", "index-BuSHuFwj.css")),
    "public, max-age=31536000, immutable",
  );
});
