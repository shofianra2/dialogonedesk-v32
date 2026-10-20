/**
 * DialogOneDesk V3.2 - History Storage Utility
 * Menyimpan hingga 20 berita terakhir di localStorage tanpa gambar
 */

import { HistoryItem } from '../types';

const STORAGE_KEY_HISTORY = 'dialogonedesk_history_items';
const MAX_HISTORY = 20;

export function getHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to parse history:', err);
    return [];
  }
}

export function saveHistoryItem(item: HistoryItem): HistoryItem[] {
  try {
    const current = getHistory();
    // Filter out if duplicate ID exists
    const filtered = current.filter((h) => h.id !== item.id);
    const updated = [item, ...filtered].slice(0, MAX_HISTORY);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save history item:', err);
    return getHistory();
  }
}

export function deleteHistoryItem(id: string): HistoryItem[] {
  try {
    const current = getHistory();
    const updated = current.filter((h) => h.id !== id);
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to delete history item:', err);
    return getHistory();
  }
}

export function clearAllHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_HISTORY);
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}
