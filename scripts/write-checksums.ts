/**
 * Corpus checksums.
 *
 *   node scripts/write-checksums.ts          write data/CHECKSUMS.txt
 *   node scripts/write-checksums.ts --check  verify without writing
 *
 * The challenge brief describes the case pack as frozen and versioned, with
 * SHA-256 checksums. No organiser pack existed, so this corpus is ours — which
 * makes the checksums our job rather than something we inherit.
 *
 * They are not decoration. Every citation in this project is a character offset
 * into a specific document, so a one-character edit to a profile silently
 * invalidates every quote that points past it. A checksum turns that from a
 * mystery into a diff.
 *
 * Hashes are taken over the NORMALISED text (BOM stripped, CRLF→LF, NFC), which
 * is the same text the offsets index into. Hashing raw bytes would report a
 * mismatch on a Windows checkout that is in fact byte-correct after
 * normalisation.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectRoot } from "../src/lib/paths.ts";
import { normalizeText, sha256 } from "../src/lib/ingestion/index.ts";

const CHECKSUM_RELPATH = "data/CHECKSUMS.txt";

const root = resolveProjectRoot();
const check = process.argv.includes("--check");

const targets: string[] = ["data/product-brief.md", "data/DATA_MANIFEST.md"];

for (const dir of ["data/supplier-profiles", "data/paraphrased", "data/derived"]) {
  const entries = await readdir(path.join(root, dir));
  for (const name of entries.sort()) {
    if (name.endsWith(".md") || name.endsWith(".json")) {
      targets.push(`${dir}/${name}`);
    }
  }
}

const rows: string[] = [];
for (const relPath of targets) {
  const raw = await readFile(path.join(root, relPath), "utf8");
  rows.push(`${sha256(normalizeText(raw).text)}  ${relPath}`);
}

const body = [
  "# SHA-256 checksums — AI Manufacturing Decision Copilot corpus",
  "#",
  "# Hashes are over normalised text (BOM stripped, CRLF->LF, NFC), not raw bytes,",
  "# because that is the text every citation offset indexes into. A checkout with",
  "# different line endings is still correct and still verifies here.",
  "#",
  "# Regenerate: npm run checksums      Verify: npm run checksums:check",
  "",
  ...rows,
  "",
].join("\n");

const outPath = path.join(root, CHECKSUM_RELPATH);

if (check) {
  let current = "";
  try {
    current = await readFile(outPath, "utf8");
  } catch {
    console.error(`No ${CHECKSUM_RELPATH}. Run \`npm run checksums\`.`);
    process.exit(1);
  }
  if (current !== body) {
    console.error(
      `\n${CHECKSUM_RELPATH} does not match the corpus on disk.\n\n` +
        `A corpus file changed without the checksums being regenerated. If the change\n` +
        `was intended, run \`npm run checksums\` and re-run the evaluation — citation\n` +
        `offsets may have moved.\n`,
    );
    process.exit(1);
  }
  console.log(`${rows.length} files verified against ${CHECKSUM_RELPATH}.`);
} else {
  await writeFile(outPath, body, "utf8");
  console.log(`Wrote ${CHECKSUM_RELPATH} — ${rows.length} files.`);
}
