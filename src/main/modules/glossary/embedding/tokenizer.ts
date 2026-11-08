// Pure-JS XLM-R (SentencePiece Unigram) tokenizer for the local embedding
// model (design §2.5.6.3 / P2b-2).
//
// Ported from the P0-5 spike (`test/spike-embedding/tokenizer.mjs`), which was
// verified to produce id-for-id identical output to the official `tokenizers`
// Rust binding (290/290 samples). It implements exactly what the model's
// `tokenizer.json` describes:
//
//   1. normalizer: Precompiled(charsmap) → Replace(" {2,}" → " ")
//   2. pre_tokenizer: Metaspace(replacement "▁", add_prefix_space)
//   3. model: Unigram (Viterbi)
//   4. post_processor: <s> … </s>
//
// The Precompiled charsmap is a Darts-clone double-array trie whose values are
// offsets into a NUL-separated replacement blob — both are decoded directly
// from the base64 payload, so no native/WASM dependency is involved.

import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';

/** Length in bytes of a UTF-8 sequence given its lead byte. */
function utf8LengthOfLeadByte(byte: number): number {
  if (byte < 0x80) return 1;
  if (byte >= 0xf0) return 4;
  if (byte >= 0xe0) return 3;
  if (byte >= 0xc0) return 2;
  return 1; // invalid lead byte: consume as-is
}

interface CharsMapMatch {
  length: number;
  value: number;
}

/** Darts-clone precompiled charsmap decoder. */
class PrecompiledCharsMap {
  private readonly trie: Uint32Array;
  private readonly normalized: Buffer;

  constructor(base64: string) {
    const blob = Buffer.from(base64, 'base64');
    const trieBytes = blob.readUInt32LE(0);
    if (4 + trieBytes > blob.length) throw new Error('precompiled charsmap: bad trie size');

    const units = Math.floor(trieBytes / 4);
    this.trie = new Uint32Array(units);
    for (let i = 0; i < units; i++) this.trie[i] = blob.readUInt32LE(4 + i * 4);
    this.normalized = blob.subarray(4 + trieBytes);
  }

  /** darts-clone: (unit >> 10) << ((unit & (1 << 9)) >> 6) */
  private static offsetOf(unit: number): number {
    return (unit >>> 10) * ((unit & 0x200) !== 0 ? 256 : 1);
  }

  /** Longest common-prefix entry starting at `start`; `null` when nothing matches. */
  private longestPrefix(bytes: Buffer, start: number): CharsMapMatch | null {
    let nodePos = 0;
    let unit = this.trie[0];
    nodePos ^= PrecompiledCharsMap.offsetOf(unit);

    let best: CharsMapMatch | null = null;
    for (let i = start; i < bytes.length; i++) {
      const byte = bytes[i];
      nodePos ^= byte;
      if (nodePos < 0 || nodePos >= this.trie.length) break;
      unit = this.trie[nodePos];
      // label(unit) = unit & (1 << 31 | 0xFF); a leaf unit can never match a byte.
      if ((unit & 0x800000ff) !== byte) break;
      nodePos ^= PrecompiledCharsMap.offsetOf(unit);
      if ((unit >>> 8) & 1) {
        const valueUnit = this.trie[nodePos];
        best = { length: i - start + 1, value: valueUnit & 0x7fffffff };
      }
    }
    return best;
  }

  /** Replacement bytes at `value`, up to the next NUL. */
  private replacementAt(value: number): Buffer {
    let end = value;
    while (end < this.normalized.length && this.normalized[end] !== 0) end++;
    return this.normalized.subarray(value, end);
  }

  apply(text: string): string {
    const bytes = Buffer.from(text, 'utf8');
    const chunks: Buffer[] = [];
    let i = 0;
    while (i < bytes.length) {
      const match = this.longestPrefix(bytes, i);
      if (match) {
        chunks.push(this.replacementAt(match.value));
        i += match.length;
      } else {
        const length = utf8LengthOfLeadByte(bytes[i]);
        chunks.push(bytes.subarray(i, i + length));
        i += length;
      }
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}

interface TokenizerJson {
  added_tokens?: { content: string; id: number }[];
  model: {
    vocab: [string, number][];
    unk_id?: number;
  };
  normalizer?:
    | { type?: string; normalizers?: TokenizerJson['normalizer'][] ; precompiled_charsmap?: string; pattern?: { Regex?: string }; content?: string }
    | null;
  pre_tokenizer?: { replacement?: string; add_prefix_space?: boolean };
}

export interface TokenizerEncoding {
  /** Token ids including `<s>` / `</s>` when requested. */
  inputIds: number[];
  /** Reconstructed token strings (diagnostics only). */
  tokens: string[];
}

export interface EncodeOptions {
  /** Total length budget including special tokens (default 64). */
  maxLength?: number;
  addSpecialTokens?: boolean;
}

/**
 * XLM-R SentencePiece Unigram tokenizer (pure JS).
 *
 * Only what the embedding model needs is implemented: normalize → metaspace →
 * Viterbi segmentation → wrap with BOS/EOS.
 */
export class XlmrTokenizer {
  private readonly vocab = new Map<string, number>();
  private readonly scores: Float64Array;
  private readonly maxPieceLength: number;
  private readonly unkId: number;
  private readonly unkScore: number;
  private readonly bosId: number;
  private readonly eosId: number;
  private readonly charsMap: PrecompiledCharsMap | null = null;
  private readonly replaceRules: { re: RegExp; content: string }[] = [];
  private readonly metaspaceReplacement: string;
  private readonly addPrefixSpace: boolean;
  private idToPieceCache: string[] | null = null;

  constructor(tokenizerJson: TokenizerJson) {
    const addedTokens = new Map<string, number>();
    for (const token of tokenizerJson.added_tokens ?? []) addedTokens.set(token.content, token.id);

    const vocab = tokenizerJson.model.vocab;
    this.scores = new Float64Array(vocab.length);
    let maxPieceLength = 1;
    let minScore = 0;
    for (let id = 0; id < vocab.length; id++) {
      const [piece, score] = vocab[id];
      this.vocab.set(piece, id);
      this.scores[id] = score;
      if (id > 0 && score < minScore) minScore = score;
      if (piece.length > maxPieceLength) maxPieceLength = piece.length;
    }
    this.maxPieceLength = Math.min(maxPieceLength, 32);
    this.unkId = tokenizerJson.model.unk_id ?? 3;
    this.unkScore = minScore - 10; // SentencePiece convention
    this.bosId = addedTokens.get('<s>') ?? 0;
    this.eosId = addedTokens.get('</s>') ?? 2;

    // Normalizer: Sequence [Precompiled, Replace] (or just Precompiled).
    const normalizer = tokenizerJson.normalizer;
    const sequence =
      normalizer?.type === 'Sequence' ? (normalizer.normalizers ?? []) : [normalizer];
    for (const step of sequence) {
      if (!step) continue;
      if (step.type === 'Precompiled' && step.precompiled_charsmap) {
        this.charsMap = new PrecompiledCharsMap(step.precompiled_charsmap);
      } else if (step.type === 'Replace' && step.pattern?.Regex) {
        this.replaceRules.push({ re: new RegExp(step.pattern.Regex, 'g'), content: step.content ?? '' });
      }
    }

    this.metaspaceReplacement = tokenizerJson.pre_tokenizer?.replacement ?? '▁';
    this.addPrefixSpace = tokenizerJson.pre_tokenizer?.add_prefix_space ?? true;
  }

  static fromJson(tokenizerJson: TokenizerJson): XlmrTokenizer {
    return new XlmrTokenizer(tokenizerJson);
  }

  static fromFile(tokenizerJsonPath: string): XlmrTokenizer {
    return new XlmrTokenizer(JSON.parse(fs.readFileSync(tokenizerJsonPath, 'utf-8')) as TokenizerJson);
  }

  static fromModelDir(modelDir: string): XlmrTokenizer {
    return XlmrTokenizer.fromFile(path.join(modelDir, 'tokenizer.json'));
  }

  private normalize(text: string): string {
    let out = text;
    if (this.charsMap) out = this.charsMap.apply(out);
    for (const rule of this.replaceRules) out = out.replace(rule.re, rule.content);
    return out;
  }

  /** Metaspace: spaces → "▁", plus the leading "▁" SentencePiece expects. */
  private applyMetaspace(normalized: string): string {
    let out = normalized.split(' ').join(this.metaspaceReplacement);
    if (this.addPrefixSpace && !out.startsWith(this.metaspaceReplacement)) {
      out = this.metaspaceReplacement + out;
    }
    return out;
  }

  /** Viterbi segmentation over the metaspace string. */
  private segment(pieces: string): number[] {
    const n = pieces.length;
    const best = new Float64Array(n + 1).fill(Number.NEGATIVE_INFINITY);
    const backStart = new Int32Array(n + 1).fill(-1);
    const backLen = new Uint8Array(n + 1);
    best[0] = 0;

    for (let start = 0; start < n; start++) {
      if (best[start] === Number.NEGATIVE_INFINITY) continue;
      let advanced = false;
      const maxLen = Math.min(this.maxPieceLength, n - start);
      for (let len = 1; len <= maxLen; len++) {
        const id = this.vocab.get(pieces.slice(start, start + len));
        if (id === undefined) continue;
        advanced = true;
        const score = best[start] + this.scores[id];
        if (score > best[start + len]) {
          best[start + len] = score;
          backStart[start + len] = start;
          backLen[start + len] = len;
        }
      }
      if (!advanced) {
        // Unknown character: consume one code unit as <unk>.
        const score = best[start] + this.unkScore;
        if (score > best[start + 1]) {
          best[start + 1] = score;
          backStart[start + 1] = start;
          backLen[start + 1] = 1;
        }
      }
    }

    const ids: number[] = [];
    let pos = n;
    while (pos > 0) {
      const start = backStart[pos];
      if (start < 0) break; // defensive: should not happen
      ids.push(this.vocab.get(pieces.slice(start, pos)) ?? this.unkId);
      pos = start;
    }
    ids.reverse();
    return ids;
  }

  /** Encode text into token ids (with `<s>`/`</s>` by default). */
  encode(text: string, options: EncodeOptions = {}): TokenizerEncoding {
    const maxLength = options.maxLength ?? 64;
    const addSpecialTokens = options.addSpecialTokens ?? true;
    const normalized = this.normalize(text ?? '');
    const metaspace = this.applyMetaspace(normalized);
    let inputIds = this.segment(metaspace);
    if (addSpecialTokens) {
      const budget = Math.max(0, maxLength - 2);
      inputIds = [this.bosId, ...inputIds.slice(0, budget), this.eosId];
    }

    if (!this.idToPieceCache) {
      const reverse = new Array<string>(this.scores.length);
      for (const [piece, id] of this.vocab) reverse[id] = piece;
      this.idToPieceCache = reverse;
    }
    const idToPiece = this.idToPieceCache;
    return { inputIds, tokens: inputIds.map((id) => idToPiece[id] ?? '<unk>') };
  }
}
