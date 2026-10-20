/**
 * DialogOneDesk V3.2
 * Portal Redaksi DIALOGSATU.COM
 * 100% Frontend Statis (React + Vite, REST Browser Fetch ke Google Gemini)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SectionNews } from './components/SectionNews';
import { SectionCoverImage } from './components/SectionCoverImage';
import { SectionSocial } from './components/SectionSocial';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { ConfirmResetModal } from './components/ConfirmResetModal';
import { Footer } from './components/Footer';
import { NewsResult, BacaJugaSlot, SocialCaptions, HistoryItem } from './types';
import {
  getSessionRequestCount,
  getDailyRequestCount,
  getStoredApiKey,
  getStoredModel,
} from './utils/geminiApi';
import { getHistory } from './utils/historyStorage';
import { DecodedSource } from './utils/canvasUtils';
import { Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'news' | 'cover' | 'social'>('news');
  const [rawText, setRawText] = useState<string>('');
  const [newsResult, setNewsResult] = useState<NewsResult | null>(null);
  const [bacaJugaSlots, setBacaJugaSlots] = useState<BacaJugaSlot[]>([]);
  const [includeBacaJugaInCopy, setIncludeBacaJugaInCopy] = useState<boolean>(true);
  const [savedCaptions, setSavedCaptions] = useState<SocialCaptions | undefined>(undefined);

  // Shared cover image between Bagian 2 and Bagian 3
  const [sharedCoverImage, setSharedCoverImage] = useState<DecodedSource | null>(null);

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);

  // Reset remount key to force pristine render of all child components and refs
  const [resetKey, setResetKey] = useState<number>(0);

  // Toast notification for user actions
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cooldown timer (4 seconds minimum between AI requests)
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);

  // Request counter tracking (preserved across resets)
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [dailyCount, setDailyCount] = useState<number>(0);

  const refreshStats = useCallback(() => {
    setSessionCount(getSessionRequestCount());
    setDailyCount(getDailyRequestCount());
  }, []);

  const refreshHistory = useCallback(() => {
    setHistoryList(getHistory());
  }, []);

  useEffect(() => {
    // Automatically overwrite legacy 2.5 or 1.5 models in localStorage with gemini-3.5-flash-lite
    getStoredModel();
    refreshStats();
    refreshHistory();
  }, [refreshStats, refreshHistory]);

  // Handle Cooldown Timer tick
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const triggerCooldown = () => {
    setCooldownRemaining(4);
    refreshStats();
  };

  /**
   * Reset Semua State Sesi:
   * Mengosongkan seluruh teks, metadata, gambar cover, gambar medsos, caption, dan timer
   * API key, model, riwayat, dan counter kuota tetap AMAN dan tidak dihapus.
   */
  const resetSemua = () => {
    setRawText('');
    setNewsResult(null);
    setBacaJugaSlots([]);
    setIncludeBacaJugaInCopy(true);
    setSavedCaptions(undefined);
    setSharedCoverImage(null);
    setCooldownRemaining(0);

    // Increment resetKey to force fresh re-mount of child components & wipe internal canvas/refs/inputs
    setResetKey((prev) => prev + 1);

    // Switch back to "1. Berita"
    setActiveTab('news');

    // Scroll to top
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Focus to raw news textarea
    setTimeout(() => {
      const textarea = document.getElementById('raw-news-textarea') as HTMLTextAreaElement | null;
      textarea?.focus();
    }, 150);

    // Show brief toast notification for 2 seconds
    setToastMessage('Lembar kerja dikosongkan.');
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  // Load an item from History into workspace (0 AI calls!)
  const handleSelectHistory = (item: HistoryItem) => {
    setRawText(item.rawText || '');
    setNewsResult(item.result);
    setBacaJugaSlots(item.bacaJugaSlots || []);
    setIncludeBacaJugaInCopy(
      item.includeBacaJugaInCopy !== undefined ? item.includeBacaJugaInCopy : true
    );
    if (item.captions) {
      setSavedCaptions(item.captions);
    }
    setActiveTab('news');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Top Bar Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => {
          refreshHistory();
          setHistoryOpen(true);
        }}
        onReset={() => setResetModalOpen(true)}
        hasNewsResult={!!newsResult}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'news' && (
          <SectionNews
            key={`news-${resetKey}`}
            rawText={rawText}
            setRawText={setRawText}
            newsResult={newsResult}
            setNewsResult={setNewsResult}
            bacaJugaSlots={bacaJugaSlots}
            setBacaJugaSlots={setBacaJugaSlots}
            includeBacaJugaInCopy={includeBacaJugaInCopy}
            setIncludeBacaJugaInCopy={setIncludeBacaJugaInCopy}
            onOpenSettings={() => setSettingsOpen(true)}
            onNavigateToCover={() => setActiveTab('cover')}
            onNavigateToSocial={() => setActiveTab('social')}
            cooldownRemaining={cooldownRemaining}
            triggerCooldown={triggerCooldown}
            onHistoryUpdated={() => {
              refreshHistory();
              refreshStats();
            }}
          />
        )}

        {activeTab === 'cover' && (
          <SectionCoverImage
            key={`cover-${resetKey}`}
            newsTitle={newsResult?.judul}
            onShareImageToSocial={(decodedSource) => {
              setSharedCoverImage(decodedSource);
            }}
          />
        )}

        {activeTab === 'social' && (
          <SectionSocial
            key={`social-${resetKey}`}
            newsResult={newsResult}
            sharedCoverImage={sharedCoverImage}
            onOpenSettings={() => setSettingsOpen(true)}
            cooldownRemaining={cooldownRemaining}
            triggerCooldown={triggerCooldown}
            savedCaptions={savedCaptions}
            onCaptionsUpdated={(caps) => {
              setSavedCaptions(caps);
              refreshStats();
            }}
          />
        )}
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSettingsChanged={() => {
          refreshStats();
        }}
      />

      <HistoryModal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        historyList={historyList}
        onSelectHistory={handleSelectHistory}
        onRefreshHistory={refreshHistory}
      />

      {/* Custom Confirmation Modal for Reset (No window.confirm) */}
      <ConfirmResetModal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        onConfirm={resetSemua}
      />

      {/* Brief Floating Toast Notification (2s duration) */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-4 h-4 text-[#EDBC1B] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Footer with Quota Indicators */}
      <Footer sessionCount={sessionCount} dailyCount={dailyCount} />
    </div>
  );
}
