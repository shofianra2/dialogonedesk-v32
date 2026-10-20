/**
 * DialogOneDesk V3.2 - Gemini REST API Client
 * 100% Client-Side Direct Fetch (No Backend Proxy)
 */

import { NewsResult, SocialCaptions, CategoryType, CATEGORIES } from '../types';
import { countWords, applyAhadRule, cleanDescription } from './textUtils';

const STORAGE_KEY_API_KEY = 'dialogonedesk_gemini_key';
const STORAGE_KEY_MODEL = 'dialogonedesk_gemini_model';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

export function getStoredApiKey(): string {
  return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
}

export function setStoredApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
}

export function clearStoredApiKey(): void {
  localStorage.removeItem(STORAGE_KEY_API_KEY);
}

export function getStoredModel(): string {
  const stored = localStorage.getItem(STORAGE_KEY_MODEL);
  if (!stored) return DEFAULT_MODEL;
  // Jika localStorage masih menyimpan nama model lama (seri 2.5 atau 1.5), otomatis timpa dengan default baru
  if (stored.includes('2.5') || stored.includes('1.5')) {
    localStorage.setItem(STORAGE_KEY_MODEL, DEFAULT_MODEL);
    return DEFAULT_MODEL;
  }
  return stored.trim().replace(/^models\//i, '');
}

export function setStoredModel(model: string): void {
  const cleaned = model.trim().replace(/^models\//i, '') || DEFAULT_MODEL;
  localStorage.setItem(STORAGE_KEY_MODEL, cleaned);
}

// Request Counter Tracker
let sessionRequestCount = 0;

export function getSessionRequestCount(): number {
  return sessionRequestCount;
}

export function getDailyRequestCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const key = `dialogonedesk_daily_count_${today}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
}

export function incrementRequestCounters(): { session: number; daily: number } {
  sessionRequestCount += 1;
  const today = new Date().toISOString().slice(0, 10);
  const key = `dialogonedesk_daily_count_${today}`;
  const current = getDailyRequestCount();
  const next = current + 1;
  localStorage.setItem(key, next.toString());

  // Clean old daily keys from localStorage (older than 7 days)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && storageKey.startsWith('dialogonedesk_daily_count_')) {
        const dateStr = storageKey.replace('dialogonedesk_daily_count_', '');
        if (dateStr !== today) {
          const keyDate = new Date(dateStr).getTime();
          const nowDate = new Date(today).getTime();
          if (isNaN(keyDate) || nowDate - keyDate > 7 * 86400000) {
            localStorage.removeItem(storageKey);
          }
        }
      }
    }
  } catch (_e) {
    // Ignore storage cleanup errors
  }

  return { session: sessionRequestCount, daily: next };
}

/**
 * Robust JSON Parser for Model Outputs
 * Bersihkan ```json wrapper atau coba ekstrak objek {} jika teks terpotong
 */
function parseModelJson(rawText: string): any {
  if (!rawText || !rawText.trim()) {
    throw new Error('Teks respons dari model kosong.');
  }

  const trimmed = rawText.trim();

  // 1. Coba parse langsung
  try {
    return JSON.parse(trimmed);
  } catch (_e) {}

  // 2. Bersihkan pembungkus markdown ```json ... ```
  let cleaned = trimmed
    .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
    .replace(/```[\s\S]*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_e) {}

  // 3. Ekstrak substring dari kurung kurawal pertama '{' ke kurung kurawal terakhir '}'
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = trimmed.slice(firstBrace, lastBrace + 1).trim();
    try {
      return JSON.parse(extracted);
    } catch (_e) {}
  }

  // Jika tetap gagal, tampilkan cuplikan teks respons
  throw new Error(
    `Format JSON tidak valid. Cuplikan teks respons: "${trimmed.slice(0, 200)}..."`
  );
}

/**
 * Common REST Fetch wrapper
 * - Kirim key via header "x-goog-api-key"
 * - Hapus prefix models/ dan trim spasi
 * - Baca response.text() dulu baru JSON.parse
 * - Tampilkan status HTTP & 200 karakter pertama respons jika gagal
 */
async function callGeminiRest(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number
): Promise<string> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Isi API key Gemini (gratis) di Pengaturan.');
  }

  const cleanModel = model.trim().replace(/^models\//i, '') || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent`;

  const makeBody = () => ({
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: maxTokens,
    },
  });

  incrementRequestCounters();

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
      },
      body: JSON.stringify(makeBody()),
    });
  } catch (netErr: any) {
    throw new Error(
      `Gagal terhubung ke Google Gemini. Periksa koneksi internet Anda (${netErr?.message || 'Network error'}).`
    );
  }

  // Baca respons sebagai teks dulu
  let rawText = '';
  try {
    rawText = await response.text();
  } catch (readErr: any) {
    throw new Error(`Gagal membaca respons dari server (${readErr?.message || 'Error'}).`);
  }

  const snippet = rawText.slice(0, 200).trim();

  // Handle HTTP status errors
  if (!response.ok) {
    const status = response.status;
    let detailMessage = '';

    try {
      const errJson = JSON.parse(rawText);
      if (errJson?.error?.message) {
        detailMessage = errJson.error.message;
      }
    } catch (_e) {
      // bukan JSON
    }

    // Jika API menolak parameter thinking (error 400), kirim ulang tanpa parameter itu sekali saja
    if (status === 400 && (detailMessage.toLowerCase().includes('thinking') || snippet.toLowerCase().includes('thinking'))) {
      try {
        const retryResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey,
          },
          body: JSON.stringify(makeBody()),
        });
        if (retryResponse.ok) {
          rawText = await retryResponse.text();
          response = retryResponse;
        }
      } catch (_retryErr) {
        // Fall back ke penanganan error
      }
    }

    if (!response.ok) {
      if (status === 400) {
        throw new Error(
          `Permintaan tidak valid (HTTP 400): ${detailMessage || snippet}`
        );
      } else if (status === 403) {
        throw new Error(
          `Akses ditolak (HTTP 403): API key tidak valid atau tidak memiliki izin akses. [${detailMessage || snippet}]`
        );
      } else if (status === 404) {
        throw new Error(
          `Model tidak tersedia. Buka Pengaturan dan pilih model lain dari pilihan cepat. [HTTP 404: ${detailMessage || snippet}]`
        );
      } else if (status === 429) {
        throw new Error(
          `Kuota gratis habis (HTTP 429): Silakan tunggu sejenak atau ganti dengan API key lain di Pengaturan. [${detailMessage || snippet}]`
        );
      } else if (status >= 500 && status < 600) {
        throw new Error(
          `Terjadi gangguan pada server Google Gemini (HTTP ${status}): ${detailMessage || snippet}`
        );
      } else {
        throw new Error(
          `Gagal memproses permintaan (HTTP ${status}): ${detailMessage || snippet}`
        );
      }
    }
  }

  // Parse JSON respons
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch (_e) {
    throw new Error(
      `Server mengirim respons tidak valid (HTTP ${response.status}): ${snippet}`
    );
  }

  // Evaluasi candidates & promptFeedback.blockReason
  const candidates = data?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(
      `Model tidak mengembalikan hasil.${
        blockReason ? ` Alasan pemblokiran (blockReason): ${blockReason}` : ` [Respons: ${snippet}]`
      }`
    );
  }

  const candidate = candidates[0];
  const parts = candidate?.content?.parts;
  let candidateText = '';

  if (Array.isArray(parts)) {
    // Gabungkan semua part yang punya field text
    candidateText = parts
      .filter((p: any) => p && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('\n')
      .trim();
  }

  if (!candidateText) {
    const finishReason = candidate?.finishReason;
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(
      `Teks hasil kosong dari model.${finishReason ? ` Finish reason: ${finishReason}.` : ''}${
        blockReason ? ` Block reason: ${blockReason}.` : ''
      } [Respons: ${snippet}]`
    );
  }

  return candidateText;
}

/**
 * Tes Koneksi API key dengan permintaan kecil
 */
export async function testConnection(
  apiKey: string,
  model: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      return { success: false, message: 'API key belum diisi.' };
    }

    const cleanModel = model.trim().replace(/^models\//i, '') || DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cleanModel
    )}:generateContent`;

    const prompt = 'Jawab hanya dengan satu kata: "OK"';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 50,
          temperature: 0.1,
        },
      }),
    });

    let rawText = '';
    try {
      rawText = await response.text();
    } catch (readErr: any) {
      return {
        success: false,
        message: `Gagal membaca respons: ${readErr?.message || 'Error'}`,
      };
    }

    const snippet = rawText.slice(0, 200).trim();

    if (!response.ok) {
      const status = response.status;
      let detail = '';
      try {
        const errJson = JSON.parse(rawText);
        if (errJson?.error?.message) detail = errJson.error.message;
      } catch (_e) {}

      if (status === 400) {
        return { success: false, message: `Permintaan tidak valid (HTTP 400): ${detail || snippet}` };
      } else if (status === 403) {
        return { success: false, message: `Akses ditolak (HTTP 403): API key tidak valid. [${detail || snippet}]` };
      } else if (status === 404) {
        return {
          success: false,
          message: `Model tidak tersedia. Buka Pengaturan dan pilih model lain dari pilihan cepat. [HTTP 404: ${detail || snippet}]`,
        };
      } else if (status === 429) {
        return { success: false, message: `Kuota gratis habis (HTTP 429): ${detail || snippet}` };
      } else {
        return {
          success: false,
          message: `Gagal (HTTP ${status}): ${detail || snippet}`,
        };
      }
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (_e) {
      return {
        success: false,
        message: `Server mengirim respons tidak valid (HTTP ${response.status}): ${snippet}`,
      };
    }

    const parts = data?.candidates?.[0]?.content?.parts;
    let reply = '';
    if (Array.isArray(parts)) {
      reply = parts
        .filter((p: any) => p && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join(' ')
        .trim();
    }

    return {
      success: true,
      message: `Koneksi sukses! Model "${cleanModel}" merespons: "${reply || 'OK'}" (HTTP ${response.status}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Gagal menghubungi server Google Gemini.',
    };
  }
}

/**
 * Generate Berita: 1 permintaan -> JSON NewsResult
 * maxOutputTokens: 4096 (karena model seri 3 bisa memakai token untuk thinking)
 */
export async function generateNews(
  rawText: string,
  apiKey: string,
  model: string,
  targetWordAdjustment?: 'longer' | 'shorter'
): Promise<NewsResult> {
  let lengthInstruction =
    'Target panjang total (judul + isi berita) adalah antara 350 hingga 430 kata.';
  if (targetWordAdjustment === 'longer') {
    lengthInstruction =
      'PERBAIKAN PANJANG: Naskah sebelumnya kurang panjang. Tuliskan naskah dengan uraian konteks, latar belakang kronologi, dan penjelasan naratif yang lebih mendalam TANPA menambah fakta baru atau nama fiktif, agar total kata mencapai 370-430 kata.';
  } else if (targetWordAdjustment === 'shorter') {
    lengthInstruction =
      'PERBAIKAN PANJANG: Naskah sebelumnya terlalu panjang. Padatkan kalimat narasi dengan lebih lugas dan efisien, buang pengulangan, agar total kata berada di kisaran 360-420 kata.';
  }

  const prompt = `Anda adalah editor senior portal berita DIALOGSATU.COM.
Tugas Anda: Mengubah naskah berita mentah berikut menjadi berita parafrase lengkap dengan standar jurnalistik tinggi.

ATURAN WAJIB REDAKSI DIALOGSATU.COM:
1. PARAFRASE PENUH: Ubah struktur kalimat dan pilihan kata secara signifikan. Gaya bahasa harus baku, objektif, netral, dan mengalir lancar khas jurnalisme investigatif/berita terkini.
2. AKURASI FAKTA: Semua fakta (nama narasumber, jabatan, angka, statistik, tanggal, lokasi kejadian) harus 100% akurat sesuai sumber. DILARANG KERAS menambah fakta baru, spekulasi, atau nama fiktif.
3. KUTIPAN LANGSUNG: Pernyataan narasumber di dalam tanda kutip ("...") WAJIB dipertahankan persis kata demi kata. Hanya narasi pengantar/penutup di luar kutipan yang diparafrase.
4. HAPUS PROMOSI: Buang semua kalimat promosi, ajakan komersial, atau jargon klise siaran pers yang tidak bernilai berita.
5. ATURAN HARI "AHAD": Nama hari "Minggu" WAJIB selalu ditulis "Ahad" (contoh: "Ahad (19/10/2026)", "hari Ahad"). Namun kata "minggu" sebagai satuan waktu ("minggu depan", "dua minggu lalu", "mingguan") TIDAK diubah.
6. TARGET KATA: ${lengthInstruction}
7. KATEGORI: Pilih tepat satu dari: "Berita Umum", "Opini", "Olahraga", "Pendidikan", "Agama", "Ekonomi", "Gaya Hidup", "Lainnya".
8. TAG: Sediakan tepat 4 tag topik paling relevan.
9. DESKRIPSI: Rangkuman 1 kalimat padat untuk meta SEO, maksimal 140 karakter.
10. JANGAN masukkan kata pembuka atau penutup markdown di luar JSON. Berikan output murni format JSON.

Format JSON yang harus dihasilkan:
{
  "judul": "Judul berita menarik, akurat, jurnalistik tanpa sensasi murahan",
  "kategori": "Berita Umum",
  "deskripsi": "Ringkasan padat maksimal 140 karakter",
  "tag": ["Tag1", "Tag2", "Tag3", "Tag4"],
  "isi": "Seluruh narasi isi berita lengkap dari awal sampai akhir..."
}

Naskah Mentah Sumber:
"""
${rawText}
"""`;

  const rawJson = await callGeminiRest(apiKey, model, prompt, 4096);
  const parsed = parseModelJson(rawJson);

  const judul = applyAhadRule(parsed.judul || 'Berita Terkini');
  const isi = applyAhadRule(parsed.isi || '');
  const deskripsi = cleanDescription(parsed.deskripsi || '');
  
  let tagList = Array.isArray(parsed.tag) ? parsed.tag.slice(0, 4) : [];
  while (tagList.length < 4) {
    tagList.push(`Topik ${tagList.length + 1}`);
  }

  let kategori: CategoryType = 'Berita Umum';
  if (CATEGORIES.includes(parsed.kategori)) {
    kategori = parsed.kategori as CategoryType;
  }

  const result: NewsResult = {
    judul,
    isi,
    tag: tagList,
    deskripsi,
    kategori,
  };

  return result;
}

/**
 * Generate Caption Medsos: 1 permintaan -> JSON 6 platforms
 * maxOutputTokens: 3000 (karena model seri 3 bisa memakai token untuk thinking)
 * Didasarkan pada hasil parafrase berita (bukan naskah mentah)
 */
export async function generateSocialCaptions(
  news: NewsResult,
  apiKey: string,
  model: string
): Promise<SocialCaptions> {
  const prompt = `Anda adalah Social Media Specialist DIALOGSATU.COM.
Buat caption media sosial profesional untuk berita berikut ke dalam 6 platform berbeda.

DATA BERITA (HASIL PARAFRASE):
Judul: ${news.judul}
Kategori: ${news.kategori}
Ringkasan: ${news.deskripsi}
Isi Cuplikan: ${news.isi.slice(0, 1000)}...

ATURAN KHUSUS TIAP PLATFORM:
1. Facebook: Informatif, rangkum inti masalah secara berbobot, ajak pembaca menyimak ulasan selengkapnya.
2. Instagram: Hook kuat di baris pertama, gunakan emoji secukupnya dan elegan, sertakan 3-5 hashtag relevan di akhir.
3. TikTok: Singkat, santai, bahasa luwes, hook memancing perhatian penonton video pendek.
4. YouTube: Sediakan "youtubeTitle" yang memikat & SEO friendly, serta "youtubeDescription" yang mendalam dan informatif.
5. Threads: Gaya percakapan santai, tajam, memancing opini/diskusi pembaca.
6. X (Twitter): Ringkas dan to-the-point, maksimal 260 karakter (karena nanti akan ditambah awalan), sertakan 1-2 hashtag.

ATURAN NAMA HARI:
Nama hari "Minggu" WAJIB ditulis "Ahad". Kata "minggu" sebagai durasi waktu tidak diubah.

Format JSON yang harus dikembalikan:
{
  "facebook": "teks caption facebook...",
  "instagram": "teks caption instagram...",
  "tiktok": "teks caption tiktok...",
  "youtubeTitle": "Judul Video YouTube SEO",
  "youtubeDescription": "Deskripsi lengkap video YouTube...",
  "threads": "teks caption threads...",
  "x": "teks tweet X maksimal 260 karakter..."
}`;

  const rawJson = await callGeminiRest(apiKey, model, prompt, 3000);
  const parsed = parseModelJson(rawJson);

  // Prepend "DIALOGSATU - " to FB, IG, TikTok, Threads, and YouTube description
  // (NOT YouTube title, NOT X) without duplicate prefix
  function prependPrefix(text: string): string {
    if (!text) return 'DIALOGSATU - ';
    const clean = text.replace(/^DIALOGSATU\s*[-–—]\s*/i, '').trim();
    return `DIALOGSATU - ${clean}`;
  }

  function cleanX(text: string): string {
    if (!text) return '';
    return text.replace(/^DIALOGSATU\s*[-–—]\s*/i, '').trim();
  }

  return {
    facebook: applyAhadRule(prependPrefix(parsed.facebook || '')),
    instagram: applyAhadRule(prependPrefix(parsed.instagram || '')),
    tiktok: applyAhadRule(prependPrefix(parsed.tiktok || '')),
    youtubeTitle: applyAhadRule((parsed.youtubeTitle || news.judul).trim()),
    youtubeDescription: applyAhadRule(prependPrefix(parsed.youtubeDescription || '')),
    threads: applyAhadRule(prependPrefix(parsed.threads || '')),
    x: applyAhadRule(cleanX(parsed.x || '')),
  };
}
