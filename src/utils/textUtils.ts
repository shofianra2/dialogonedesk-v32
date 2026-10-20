/**
 * DialogOneDesk V3.2 - Text Utilities
 * Jurnalistik & Format Redaksi DIALOGSATU.COM
 */

// Helper to count words accurately in Indonesian text
export function countWords(text: string): number {
  if (!text) return 0;
  // Strip HTML tags if any
  const clean = text.replace(/<[^>]*>/g, ' ').trim();
  if (!clean) return 0;
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

export function countCharacters(text: string): number {
  if (!text) return 0;
  return text.length;
}

/**
 * Aturan "AHAD":
 * Nama hari "Minggu" selalu ditulis "Ahad" (contoh: "Minggu (19/10/2026)" -> "Ahad (19/10/2026)",
 * "hari Minggu" -> "hari Ahad").
 * Kata "minggu" sebagai satuan waktu (minggu depan, mingguan, beberapa minggu) TIDAK diubah.
 */
export function applyAhadRule(text: string): string {
  if (!text) return '';

  let processed = text;

  // 1. "hari Minggu" / "Hari Minggu" -> "hari Ahad" / "Hari Ahad"
  processed = processed.replace(/\b(hari)\s+Minggu\b/gi, (_match, prefix) => {
    return `${prefix} Ahad`;
  });

  // 2. "Minggu (" -> "Ahad ("
  processed = processed.replace(/\bMinggu\s*(?=\()/g, 'Ahad ');

  // 3. "Minggu," -> "Ahad,"
  processed = processed.replace(/\bMinggu,\b/g, 'Ahad,');

  // 4. "Minggu" followed by time of day: pagi, siang, sore, malam, dini hari
  processed = processed.replace(
    /\bMinggu\s+(pagi|siang|sore|malam|dini hari)\b/gi,
    (_match, timeStr) => `Ahad ${timeStr}`
  );

  // 5. "Minggu" followed by date like "Minggu 19", "Minggu, 19"
  processed = processed.replace(
    /\bMinggu\s+(?=\d{1,2}(?:\s+|\/|\-))/g,
    'Ahad '
  );

  // 6. "pada Minggu", "sejak Minggu", "hingga Minggu", "sampai Minggu", "tiap Minggu", "setiap Minggu"
  processed = processed.replace(
    /\b(pada|sejak|hingga|sampai|tiap|setiap)\s+Minggu\b/gi,
    (_match, prep) => `${prep} Ahad`
  );

  // 7. Standalone "Minggu" capitalized when beginning of a sentence followed by verb or date
  // e.g. "Minggu ini kami..." vs "Minggu kemarin, ..."
  processed = processed.replace(
    /(?:^|[\.\?\!\n]\s*)Minggu\s+(kemarin|lalu)/gi,
    (match) => match.replace(/Minggu/i, 'Ahad')
  );

  return processed;
}

/**
 * Smart Sentence Splitter:
 * Memisahkan teks menjadi kalimat tanpa memotong:
 * - Gelar/Singkatan: Dr., H., Hj., Prof., Ir., Drs., Dra., Ny., Tn., No., Rp., dkk., dll., dsb., dst., tsb., alm., St., S.Pd., M.Pd., dll.
 * - Angka desimal (1.5, 3.14)
 * - Format jam (14.30 WIB)
 * - Format tanggal (19.10.2026)
 * - Tanda kutip langsung ("..." atau “...”)
 */
export function smartSentenceSplitter(text: string): string[] {
  if (!text) return [];

  // Protect quotes by replacing their content temporarily with placeholders
  const quotePlaceholders: string[] = [];
  let masked = text.replace(/(["“][^"“”\n]+["”])/g, (match) => {
    const placeholder = `___QUOTE_${quotePlaceholders.length}___`;
    quotePlaceholders.push(match);
    return placeholder;
  });

  // Protect common Indonesian abbreviations and titles
  const ABBR_MAP: { [key: string]: string } = {
    'Dr.': '___ABBR_DR___',
    'dr.': '___ABBR_DR_LOWER___',
    'H.': '___ABBR_H___',
    'Hj.': '___ABBR_HJ___',
    'Prof.': '___ABBR_PROF___',
    'Ir.': '___ABBR_IR___',
    'Drs.': '___ABBR_DRS___',
    'Dra.': '___ABBR_DRA___',
    'Ny.': '___ABBR_NY___',
    'Tn.': '___ABBR_TN___',
    'No.': '___ABBR_NO___',
    'no.': '___ABBR_NO_LOWER___',
    'Rp.': '___ABBR_RP___',
    'rp.': '___ABBR_RP_LOWER___',
    'dkk.': '___ABBR_DKK___',
    'dll.': '___ABBR_DLL___',
    'dsb.': '___ABBR_DSB___',
    'dst.': '___ABBR_DST___',
    'tsb.': '___ABBR_TSB___',
    'alm.': '___ABBR_ALM___',
    'St.': '___ABBR_ST___',
    'S.Pd.': '___ABBR_SPD___',
    'M.Pd.': '___ABBR_MPD___',
    'S.Kom.': '___ABBR_SKOM___',
    'M.M.': '___ABBR_MM___',
    'S.E.': '___ABBR_SE___',
    'S.H.': '___ABBR_SH___',
    'S.Ag.': '___ABBR_SAG___',
    'K.H.': '___ABBR_KH___',
    'Ust.': '___ABBR_UST___',
  };

  for (const [abbr, repl] of Object.entries(ABBR_MAP)) {
    const escaped = abbr.replace(/\./g, '\\.');
    const regex = new RegExp(`\\b${escaped}`, 'g');
    masked = masked.replace(regex, repl);
  }

  // Protect decimals & times & dates: e.g. 14.30, 1.5, 19.10.2026
  masked = masked.replace(/(\d+)\.(\d+)/g, '$1___DECIMAL_DOT___$2');

  // Split by sentence terminators: (. ! ?) followed by whitespace or end of line
  const rawSentences = masked.split(/(?<=[.?!])(?:\s+|\n+)/);

  const sentences: string[] = [];

  for (let s of rawSentences) {
    let restored = s.trim();
    if (!restored) continue;

    // Restore decimals
    restored = restored.replace(/___DECIMAL_DOT___/g, '.');

    // Restore abbreviations
    for (const [abbr, repl] of Object.entries(ABBR_MAP)) {
      restored = restored.replaceAll(repl, abbr);
    }

    // Restore quotes
    restored = restored.replace(/___QUOTE_(\d+)___/g, (_m, idx) => {
      return quotePlaceholders[Number(idx)] || '';
    });

    if (restored.length > 0) {
      sentences.push(restored);
    }
  }

  return sentences;
}

/**
 * Format Isi Berita:
 * - Hapus duplikasi "DIALOGSATU.COM - " jika sudah ada di awal
 * - Setiap 2 kalimat digabungkan menjadi 1 paragraf
 * - Diawali "DIALOGSATU.COM - "
 */
export function formatNewsBody(rawBody: string): {
  paragraphs: string[];
  fullFormattedText: string;
} {
  if (!rawBody) return { paragraphs: [], fullFormattedText: '' };

  // Strip initial DIALOGSATU.COM - or DIALOGSATU - prefix if model already included it
  let cleaned = rawBody.trim();
  cleaned = cleaned.replace(/^(\*{1,2})?DIALOGSATU(\.COM)?(\*{1,2})?\s*[-–—]\s*/i, '');
  cleaned = applyAhadRule(cleaned);

  const sentences = smartSentenceSplitter(cleaned);
  if (sentences.length === 0) {
    return {
      paragraphs: ['DIALOGSATU.COM - ' + cleaned],
      fullFormattedText: 'DIALOGSATU.COM - ' + cleaned,
    };
  }

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence1 = sentences[i];
    const sentence2 = sentences[i + 1];
    const pText = sentence2 ? `${sentence1} ${sentence2}` : sentence1;
    paragraphs.push(pText.trim());
  }

  // Prepend DIALOGSATU.COM - to the first paragraph
  if (paragraphs.length > 0) {
    paragraphs[0] = `DIALOGSATU.COM - ${paragraphs[0]}`;
  }

  const fullFormattedText = paragraphs.join('\n\n');
  return { paragraphs, fullFormattedText };
}

/**
 * Clean & Trim Description to max 140 chars at word boundary
 */
export function cleanDescription(desc: string, maxLen = 140): string {
  if (!desc) return '';
  let clean = desc.replace(/\s+/g, ' ').trim();
  clean = applyAhadRule(clean);

  if (clean.length <= maxLen) return clean;

  // Trim to maxLen and step back to last word boundary
  const sub = clean.slice(0, maxLen);
  const lastSpace = sub.lastIndexOf(' ');
  if (lastSpace > 30) {
    return sub.slice(0, lastSpace).trim() + '...';
  }
  return sub.slice(0, maxLen - 3).trim() + '...';
}

/**
 * Convert title to clean filename slug (e.g. "judul-berita-anda")
 */
export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '') // remove non-alphanumeric except hyphen/space
    .replace(/\s+/g, '-') // spaces to hyphen
    .replace(/-+/g, '-') // collapse hyphens
    .slice(0, 70) // reasonable slug length
    .replace(/^-+|-+$/g, '') || 'dialogsatu-berita';
}
