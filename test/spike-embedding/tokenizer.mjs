// P0-5 spike: pure-JS XLM-R (SentencePiece Unigram) tokenizer.
//
// Implements exactly what `tokenizer.json` of multilingual-e5-small describes:
//   1. normalizer: Precompiled(charsmap) → Replace(" {2,}" → " ")
//   2. pre_tokenizer: Metaspace(replacement "▁", add_prefix_space)
//   3. model: Unigram (Viterbi)
//   4. post_processor: <s> … </s>
//
// No native/WASM dependency, ~250 lines. The Precompiled charsmap is a
// Darts-clone double-array trie whose values are offsets into a NUL-separated
// replacement blob — both are decoded here directly from the base64 payload.

import fs from 'node:fs';
import path from 'node:path';

const utf8LengthOfLeadByte = (byte) => {
  if (byte < 0x80) return 1;
  if (byte >= 0xf0) return 4;
  if (byte >= 0xe0) return 3;
  if (byte >= 0xc0) return 2;
  return 1; // invalid lead byte: consume as-is
};

class PrecompiledCharsMap {
  constructor(base64) {
    const blob = Buffer.from(base64, 'base64');
    const trieBytes = blob.readUInt32LE(0);
    if (4 + trieBytes > blob.length) throw new Error('precompiled charsmap: bad trie size');

    const units = Math.floor(trieBytes / 4);
    this.trie = new Uint32Array(units);
    for (let i = 0; i < units; i++) this.trie[i] = blob.readUInt32LE(4 + i * 4);
    this.normalized = blob.subarray(4 + trieBytes);
  }

  static offsetOf(unit) {
    // dart-clone: (unit >> 10) << ((unit & (1 << 9)) >> 6)
    return (unit >>> 10) * ((unit & 0x200) !== 0 ? 256 : 1);
  }

  /** Longest common-prefix entry starting at `start`; returns {length, value} or null. */
  longestPrefix(bytes, start) {
    let nodePos = 0;
    let unit = this.trie[0];
    nodePos ^= PrecompiledCharsMap.offsetOf(unit);

    let best = null;
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
  replacementAt(value) {
    let end = value;
    while (end < this.normalized.length && this.normalized[end] !== 0) end++;
    return this.normalized.subarray(value, end);
  }

  apply(text) {
    const bytes = Buffer.from(text, 'utf8');
    const chunks = [];
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

export class XlmrTokenizer {
  constructor(tokenizerJson) {
    this.addedTokens = new Map();
    for (const token of tokenizerJson.added_tokens ?? []) this.addedTokens.set(token.content, token.id);

    const vocab = tokenizerJson.model.vocab;
    this.vocab = new Map(); // piece → id
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
    this.bosId = this.addedTokens.get('<s>') ?? 0;
    this.eosId = this.addedTokens.get('</s>') ?? 2;

    // Normalizer: Sequence [Precompiled, Replace] (or just Precompiled).
    const sequence = tokenizerJson.normalizer?.type === 'Sequence'
      ? tokenizerJson.normalizer.normalizers
      : [tokenizerJson.normalizer];
    this.charsMap = null;
    this.replaceRules = [];
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

  static fromFile(tokenizerJsonPath) {
    return new XlmrTokenizer(JSON.parse(fs.readFileSync(tokenizerJsonPath, 'utf-8')));
  }

  static fromModelDir(modelDir) {
    return XlmrTokenizer.fromFile(path.join(modelDir, 'tokenizer.json'));
  }

  normalize(text) {
    let out = text;
    if (this.charsMap) out = this.charsMap.apply(out);
    for (const rule of this.replaceRules) out = out.replace(rule.re, rule.content);
    return out;
  }

  /** Metaspace: spaces → "▁", plus the leading "▁" SentencePiece expects. */
  applyMetaspace(normalized) {
    let out = normalized.split(' ').join(this.metaspaceReplacement);
    if (this.addPrefixSpace && !out.startsWith(this.metaspaceReplacement)) {
      out = this.metaspaceReplacement + out;
    }
    return out;
  }

  /** Viterbi segmentation over the metaspace string. */
  segment(pieces) {
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

    const ids = [];
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

  /**
   * Encode text.
   * @returns {{ inputIds: number[], tokens: string[], normalized: string }}
   */
  encode(text, { maxLength = 64, addSpecialTokens = true } = {}) {
    const normalized = this.normalize(text ?? '');
    const metaspace = this.applyMetaspace(normalized);
    let inputIds = this.segment(metaspace);
    if (addSpecialTokens) {
      const budget = Math.max(0, maxLength - 2);
      inputIds = [this.bosId, ...inputIds.slice(0, budget), this.eosId];
    }
    // Reconstructing tokens is only used for diagnostics.
    const idToPiece = this.idToPiece ??= (() => {
      const reverse = new Array(this.scores.length);
      for (const [piece, id] of this.vocab) reverse[id] = piece;
      return reverse;
    })();
    return { inputIds, tokens: inputIds.map((id) => idToPiece[id] ?? '<unk>'), normalized };
  }
}
