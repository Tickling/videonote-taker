// Структура конспекта для каждого типа видео — единая для экрана расширения, Word и Markdown.
import type { RawCharacter, RawReading, RawSummary, RawTimedItem, VideoTypeId } from './summaryContract.js';

export type SummarySection =
  | { kind: 'text'; title: string; text: string }
  | { kind: 'list'; title: string; items: string[] }
  | { kind: 'timecodes'; title: string; items: RawTimedItem[] }
  | { kind: 'quotes'; title: string; items: RawTimedItem[] }
  | { kind: 'characters'; title: string; items: RawCharacter[] }
  | { kind: 'reading'; title: string; items: RawReading[] }
  | { kind: 'markdown'; title: string; text: string }
  | { kind: 'rating'; title: string; score: number; comment: string };

type SectionBuilder = (s: RawSummary) => SummarySection | null;

const ideas = (title: string): SectionBuilder => (s) => (s.ideas.length ? { kind: 'list', title, items: s.ideas } : null);
const resume = (title: string): SectionBuilder => (s) => (s.shortResume ? { kind: 'text', title, text: s.shortResume } : null);
const timecodes: SectionBuilder = (s) => (s.keyPoints.length ? { kind: 'timecodes', title: 'Таймкоды', items: s.keyPoints } : null);
const quotes: SectionBuilder = (s) => (s.quotes.length ? { kind: 'quotes', title: 'Главные цитаты', items: s.quotes } : null);
const conclusions: SectionBuilder = (s) => (s.conclusions.length ? { kind: 'list', title: 'Выводы', items: s.conclusions } : null);
const characters: SectionBuilder = (s) => (s.characters.length ? { kind: 'characters', title: 'Герои', items: s.characters } : null);
const rating: SectionBuilder = (s) => (s.rating ? { kind: 'rating', title: 'Оценка ИИ', score: s.rating.score, comment: s.rating.comment } : null);
const reading: SectionBuilder = (s) => (s.furtherReading.length ? { kind: 'reading', title: 'Помощь от ИИ: что почитать по теме', items: s.furtherReading } : null);
const example: SectionBuilder = (s) => (s.example ? { kind: 'markdown', title: 'Помощь от ИИ: пример', text: s.example } : null);
// Конспекты, созданные до разделения по типам видео
const legacy: SectionBuilder = (s) => (s.detailedNotes ? { kind: 'markdown', title: 'Подробный конспект', text: s.detailedNotes } : null);

const LAYOUTS: Record<VideoTypeId, SectionBuilder[]> = {
  interview: [ideas('Основные идеи'), quotes, conclusions, timecodes, legacy],
  educational: [ideas('Главные мысли и идеи'), resume('О чём видео'), timecodes, reading, example, legacy],
  entertainment: [resume('Краткая суть'), timecodes, legacy],
  movie: [ideas('Мысли и идеи'), resume('О чём фильм'), characters, timecodes, rating, legacy],
};

export function buildSummarySections(summary: RawSummary, videoType: VideoTypeId): SummarySection[] {
  const sections = LAYOUTS[videoType].map((build) => build(summary)).filter((s): s is SummarySection => s !== null);
  // Интервью без идей (старый конспект) — показываем хотя бы краткое содержание
  if (videoType === 'interview' && summary.shortResume && !summary.ideas.length) {
    sections.unshift({ kind: 'text', title: 'Кратко', text: summary.shortResume });
  }
  return sections;
}
