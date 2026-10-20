export type CategoryType = 
  | 'Berita Umum'
  | 'Opini'
  | 'Olahraga'
  | 'Pendidikan'
  | 'Agama'
  | 'Ekonomi'
  | 'Gaya Hidup'
  | 'Lainnya';

export const CATEGORIES: CategoryType[] = [
  'Berita Umum',
  'Opini',
  'Olahraga',
  'Pendidikan',
  'Agama',
  'Ekonomi',
  'Gaya Hidup',
  'Lainnya',
];

export interface BacaJugaSlot {
  id: string;
  afterParagraphIndex: number;
  title: string;
  url: string;
}

export interface NewsResult {
  judul: string;
  isi: string;
  tag: string[]; // exactly 4 tags
  deskripsi: string; // max 140 chars
  kategori: CategoryType;
}

export interface SocialCaptions {
  facebook: string;
  instagram: string;
  tiktok: string;
  youtubeTitle: string;
  youtubeDescription: string;
  threads: string;
  x: string;
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  rawText: string;
  result: NewsResult;
  bacaJugaSlots: BacaJugaSlot[];
  includeBacaJugaInCopy: boolean;
  captions?: SocialCaptions;
}

export interface AppSettings {
  apiKey: string;
  model: string;
}

export interface RequestStats {
  sessionCount: number;
  dailyCount: number;
  lastDate: string;
}
