const MASK_32 = 0xffff_ffff;
const MASK_64 = 0xffff_ffff_ffff_ffffn;
const PCG_MULTIPLIER = 6_364_136_223_846_793_005n;
const PCG_INCREMENT = 11_634_580_027_462_260_723n;
const TWO_POW_53 = 9_007_199_254_740_992;

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function quarterRound(state: Uint32Array, a: number, b: number, c: number, d: number): void {
  state[a] = ((state[a]! + state[b]!) & MASK_32) >>> 0;
  state[d] = rotateLeft((state[d]! ^ state[a]) >>> 0, 16);
  state[c] = ((state[c]! + state[d]) & MASK_32) >>> 0;
  state[b] = rotateLeft((state[b]! ^ state[c]) >>> 0, 12);
  state[a] = ((state[a] + state[b]) & MASK_32) >>> 0;
  state[d] = rotateLeft((state[d] ^ state[a]) >>> 0, 8);
  state[c] = ((state[c] + state[d]) & MASK_32) >>> 0;
  state[b] = rotateLeft((state[b] ^ state[c]) >>> 0, 7);
}

function seedWords(seed: number | bigint): Uint32Array {
  let state = BigInt(seed) & MASK_64;
  const words = new Uint32Array(8);
  for (let index = 0; index < words.length; index += 1) {
    state = (state * PCG_MULTIPLIER + PCG_INCREMENT) & MASK_64;
    const xorshifted = Number((((state >> 18n) ^ state) >> 27n) & 0xffff_ffffn) >>> 0;
    const rotation = Number(state >> 59n);
    words[index] = ((xorshifted >>> rotation) | (xorshifted << ((32 - rotation) & 31))) >>> 0;
  }
  return words;
}

/**
 * Byte-for-byte port of rand_chacha 0.3 ChaCha8Rng seeded through
 * rand_core 0.6 SeedableRng::seed_from_u64.
 */
export class ChaCha8Rng {
  private readonly key: Uint32Array;
  private counter = 0n;
  private buffer: Uint32Array<ArrayBufferLike> = new Uint32Array(0);
  private index = 0;

  constructor(seed: number | bigint) {
    this.key = seedWords(seed);
  }

  nextU32(): number {
    if (this.index >= this.buffer.length) {
      this.buffer = this.generateBlock();
      this.index = 0;
    }
    return this.buffer[this.index++]!;
  }

  nextU64(): bigint {
    const low = BigInt(this.nextU32());
    const high = BigInt(this.nextU32());
    return (high << 32n) | low;
  }

  /** Matches rand 0.8 `rng.gen::<f64>()`: the most significant 53 bits in [0, 1). */
  nextFloat64(): number {
    return Number(this.nextU64() >> 11n) / TWO_POW_53;
  }

  private generateBlock(): Uint32Array {
    const original = new Uint32Array(16);
    original.set([0x6170_7865, 0x3320_646e, 0x7962_2d32, 0x6b20_6574]);
    original.set(this.key, 4);
    original[12] = Number(this.counter & 0xffff_ffffn);
    original[13] = Number((this.counter >> 32n) & 0xffff_ffffn);
    this.counter = (this.counter + 1n) & MASK_64;

    const working = new Uint32Array(original);
    for (let round = 0; round < 4; round += 1) {
      quarterRound(working, 0, 4, 8, 12);
      quarterRound(working, 1, 5, 9, 13);
      quarterRound(working, 2, 6, 10, 14);
      quarterRound(working, 3, 7, 11, 15);
      quarterRound(working, 0, 5, 10, 15);
      quarterRound(working, 1, 6, 11, 12);
      quarterRound(working, 2, 7, 8, 13);
      quarterRound(working, 3, 4, 9, 14);
    }
    for (let index = 0; index < working.length; index += 1) {
      working[index] = ((working[index]! + original[index]!) & MASK_32) >>> 0;
    }
    return working;
  }
}
