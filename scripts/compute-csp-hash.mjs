#!/usr/bin/env node
// Extract the inline theme-bootstrap script content from
// src/_layouts/default.erb and print its SHA-256 hash in the form
// expected by Content-Security-Policy (`sha256-…` base64).
//
// Used to derive the `script-src` hash in `src/_headers`. If the inline
// script in default.erb ever changes (even whitespace), this hash must
// be recomputed and the header updated.
//
// Usage: node scripts/compute-csp-hash.mjs

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const layoutPath = resolve(here, "..", "src", "_layouts", "default.erb");
const src = readFileSync(layoutPath, "utf8");

// Look for a bare `<script>` (the theme-bootstrap IIFE) — distinct from
// `<script src=…>` and `<script type="application/json">` further down.
const openTag = "<script>\n";
const closeTag = "</script>";
const openIdx = src.indexOf(openTag);
if (openIdx === -1) {
  throw new Error(`no bare <script> opening tag in ${layoutPath}`);
}
const after = openIdx + openTag.length;
const closeIdx = src.indexOf(closeTag, after);
if (closeIdx === -1) {
  throw new Error(`no matching </script> after offset ${after}`);
}

// CSP hashes are computed over the raw bytes between the open and close
// tags, exactly as authored — no whitespace stripping.
const content = src.slice(after, closeIdx);
const digest = createHash("sha256").update(content, "utf8").digest("base64");
process.stdout.write(`sha256-${digest}\n`);
