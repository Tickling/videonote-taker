export enum VideoType {
  EDUCATIONAL = 'educational',
  INTERVIEW = 'interview',
  ENTERTAINMENT = 'entertainment',
  MOVIE = 'movie',
}

export const VIDEO_TYPES: readonly VideoType[] = [
  VideoType.EDUCATIONAL,
  VideoType.INTERVIEW,
  VideoType.ENTERTAINMENT,
  VideoType.MOVIE,
];

export function isVideoType(value: unknown): value is VideoType {
  return typeof value === 'string' && (VIDEO_TYPES as readonly string[]).includes(value);
}
