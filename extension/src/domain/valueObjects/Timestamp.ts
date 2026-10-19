import { formatTimecode, parseTimecode } from '@shared/timecode';

export class Timestamp {
  readonly seconds: number;

  constructor(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid timestamp: ${seconds}`);
    }
    this.seconds = seconds;
  }

  static zero(): Timestamp {
    return new Timestamp(0);
  }

  /** Безопасное создание: отрицательные и нечисловые значения превращаются в 0. */
  static of(seconds: number): Timestamp {
    return new Timestamp(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
  }

  static parse(value: string): Timestamp {
    const seconds = parseTimecode(value);
    if (seconds === null) throw new Error(`Invalid timecode: ${value}`);
    return new Timestamp(seconds);
  }

  /** «MM:SS», для видео длиннее часа — «H:MM:SS». */
  format(): string {
    return formatTimecode(this.seconds);
  }

  plus(seconds: number): Timestamp {
    return Timestamp.of(this.seconds + seconds);
  }

  equals(other: Timestamp): boolean {
    return Math.floor(this.seconds) === Math.floor(other.seconds);
  }
}
