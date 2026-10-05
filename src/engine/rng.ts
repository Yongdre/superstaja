/** 새 커리어의 기본값만 무작위 생성합니다. 저장 복원·시즌 진행은 저장된 seed를 사용합니다. */
export function newCareerSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
}

export class SeededRng {
  state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    this.state >>>= 0;
    return value;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    return values[Math.floor(this.next() * values.length)];
  }
}
