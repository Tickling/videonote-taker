import { describe, expect, it } from 'vitest';
import { Timestamp } from '../valueObjects/Timestamp';
import type { Segment } from './Segment';
import { appendSegments, emptyTranscript, findSegmentAt, transcriptToPlainText } from './Transcript';

const seg = (id: string, start: number, end: number, text = id): Segment => ({
  id,
  text,
  start: new Timestamp(start),
  end: new Timestamp(end),
  confidence: 1,
});

describe('Transcript helpers', () => {
  const transcript = { ...emptyTranscript(), segments: [seg('a', 0, 5), seg('b', 5, 10), seg('c', 10, 15)], totalDuration: 15 };

  it('finds the segment playing at a given time', () => {
    expect(findSegmentAt(transcript, new Timestamp(7))?.id).toBe('b');
    expect(findSegmentAt(transcript, new Timestamp(100))?.id).toBe('c');
    expect(findSegmentAt(emptyTranscript(), new Timestamp(1))).toBeNull();
  });

  it('appends segments in time order and extends duration', () => {
    const result = appendSegments(transcript, [seg('d', 20, 25), seg('x', 2, 3)]);
    expect(result.segments.map((s) => s.id)).toEqual(['a', 'x', 'b', 'c', 'd']);
    expect(result.totalDuration).toBe(25);
  });

  it('renders plain text with timecodes', () => {
    expect(transcriptToPlainText(transcript).split('\n')[1]).toBe('[00:05] b');
  });
});
