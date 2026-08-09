/**
 * Public surface of the ingestion layer.
 *
 * Application code should import from `./server.ts` instead, which adds a
 * client-bundle guard. This entry point exists un-guarded so the CLI inspection
 * script and the evaluation harness can import it under plain `node`, where
 * `server-only` throws by design.
 */
export type {
  Citation,
  CitationRef,
  CitationStatus,
  ChunkRole,
  Corpus,
  DocumentChunk,
  DocumentKind,
  ExcludedChunk,
  IngestedDocument,
  IngestionAudit,
  LeakageWarning,
  SourceDocument,
} from "./types.ts";

export {
  buildLineStarts,
  countNonWhitespace,
  estimateTokens,
  normalizeText,
  offsetToLine,
  sha256,
} from "./text.ts";

export {
  detectHeadings,
  isHorizontalRule,
  slugifyHeading,
  type HeadingDetector,
  type HeadingHit,
} from "./headings.ts";

export {
  chunkDocument,
  DEFAULT_CHUNKER_CONFIG,
  type ChunkerConfig,
} from "./chunker.ts";

export {
  assertNoHardLeakage,
  firstHardHit,
  scanLeakage,
  LEAKAGE_RULES,
  type LeakageHit,
  type LeakageRule,
} from "./leakage.ts";

export {
  buildAudit,
  buildCorpusVariant,
  clearCorpusCache,
  discoverDocuments,
  getCorpus,
  ingestDocument,
  loadDocument,
  resolveDataDir,
  SUPPLIER_DIRS,
  type SupplierDirKey,
} from "./loader.ts";

export {
  formatLocator,
  normalizeForMatch,
  resolveCitation,
  verifyCitations,
} from "./citation.ts";
