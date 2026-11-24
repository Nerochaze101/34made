import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  Share2,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ReelStage } from './scene/ReelStage';
import {
  evaluateReel,
  REEL_BEATS,
  REEL_DURATION,
  ReelSceneId,
} from './scene/reelTimeline';
import { useCastSprites } from './utils/castChromaKey';
import {
  exportReelVideo,
  REEL_SCENES,
  ReelExportResult,
} from './utils/exportReelVideo';
import { reelAudio, REEL_DIALOGUE_SCRIPT, ReelCueId } from './utils/soundFx';

interface CueTrigger {
  time: number;
  cue: ReelCueId;
}

const REEL_AUDIO_CUES: CueTrigger[] = [
  { time: 0.15, cue: 'lobby_open' },
  { time: 0.9, cue: 'tunde_promise' },
  { time: 9.05, cue: 'spiral_whoosh' },
  { time: 9.8, cue: 'tunde_camping' },
  { time: 15.8, cue: 'tunde_lag' },
  { time: 21.1, cue: 'morning_door' },
  { time: 22.8, cue: 'zainab_check' },
  { time: 29.0, cue: 'tunde_warmup' },
  { time: 33.0, cue: 'biscuit_arf' },
];

function formatTimecode(sec: number): string {
  const whole = Math.floor(Math.max(0, sec));
  const mins = Math.floor(whole / 60);
  const remSec = whole % 60;
  return `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function App() {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<0.5 | 1>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(reelAudio.unlocked);
  const [showCaptions, setShowCaptions] = useState<boolean>(true);
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [showCastStrip, setShowCastStrip] = useState<boolean>(false);

  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'save' | 'telegram'>('save');
  const [downloadScope, setDownloadScope] = useState<'all' | 'select'>('all');
  const [includeExportCaptions, setIncludeExportCaptions] = useState<boolean>(true);
  const [selectedSceneIds, setSelectedSceneIds] = useState<ReelSceneId[]>([
    'scene1',
    'scene2',
    'scene3',
  ]);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [readyDownload, setReadyDownload] = useState<ReelExportResult | null>(null);

  const [telegramStatus, setTelegramStatus] = useState<{
    checked: boolean;
    configured: boolean;
    botUsername?: string;
    defaultChatId?: string;
    error?: string;
  }>({ checked: false, configured: false });
  const [telegramChats, setTelegramChats] = useState<
    Array<{ id: string; title: string; type: string; username?: string }>
  >([]);
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramCaption, setTelegramCaption] = useState<string>(
    'One Last Match Before I Sleep (35s Reel)'
  );
  const [telegramBusy, setTelegramBusy] = useState<boolean>(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{
    kind: 'ok' | 'err';
    text: string;
  } | null>(null);

  const stageSvgRef = useRef<SVGSVGElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const readyBlobUrlRef = useRef<string | null>(null);

  const timeRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);
  const rateRef = useRef<0.5 | 1>(1);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const { sprites } = useCastSprites();

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    rateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    reelAudio.enabled = soundEnabled;
    if (!soundEnabled) {
      reelAudio.stopSpeech();
    } else if (playingRef.current) {
      reelAudio.unlock();
      reelAudio.syncActiveDialogue(timeRef.current, rateRef.current);
    }
  }, [soundEnabled]);

  useEffect(() => {
    const unsub = reelAudio.onUnlockChange(() => {
      setAudioUnlocked(reelAudio.unlocked);
    });
    const unlockOnGesture = () => {
      const wasUnlocked = reelAudio.unlocked;
      reelAudio.unlock();
      if (!wasUnlocked && playingRef.current && reelAudio.enabled) {
        reelAudio.syncActiveDialogue(timeRef.current, rateRef.current);
      }
    };
    window.addEventListener('pointerdown', unlockOnGesture, { passive: true });
    window.addEventListener('keydown', unlockOnGesture, { passive: true });
    return () => {
      unsub();
      window.removeEventListener('pointerdown', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
      reelAudio.stopSpeech();
      exportAbortRef.current?.abort();
      if (readyBlobUrlRef.current) {
        URL.revokeObjectURL(readyBlobUrlRef.current);
      }
    };
  }, []);

  const checkAudioCues = useCallback((prevT: number, nextT: number) => {
    if (!reelAudio.enabled || nextT <= prevT) return;
    for (const item of REEL_AUDIO_CUES) {
      if (prevT < item.time && nextT >= item.time) {
        reelAudio.playCue(item.cue, rateRef.current);
      }
    }
  }, []);

  useEffect(() => {
    const tick = (ts: number) => {
      if (lastTsRef.current === null) {
        lastTsRef.current = ts;
      }
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      if (playingRef.current) {
        const prevT = timeRef.current;
        let nextT = prevT + dt * rateRef.current;
        if (nextT >= REEL_DURATION) {
          nextT = REEL_DURATION;
          checkAudioCues(prevT, nextT);
          timeRef.current = nextT;
          setCurrentTime(nextT);
          setIsPlaying(false);
        } else {
          checkAudioCues(prevT, nextT);
          timeRef.current = nextT;
          setCurrentTime(nextT);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [checkAudioCues]);

  const handleTogglePlay = useCallback(() => {
    if (exportProgress !== null) return;
    reelAudio.unlock();
    if (timeRef.current >= REEL_DURATION - 0.02) {
      lastTsRef.current = null;
      timeRef.current = 0;
      setCurrentTime(0);
      setIsPlaying(true);
      if (reelAudio.enabled) {
        reelAudio.playCue('lobby_open', rateRef.current);
      }
    } else {
      setIsPlaying((prev) => {
        const next = !prev;
        if (!next) {
          reelAudio.stopSpeech();
        } else if (reelAudio.enabled) {
          reelAudio.syncActiveDialogue(timeRef.current, rateRef.current);
        }
        return next;
      });
    }
  }, [exportProgress]);

  const handleReplay = useCallback(() => {
    if (exportProgress !== null) return;
    reelAudio.unlock();
    reelAudio.stopSpeech();
    lastTsRef.current = null;
    timeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(true);
    if (reelAudio.enabled) {
      reelAudio.playCue('lobby_open', rateRef.current);
    }
  }, [exportProgress]);

  const handleScrub = useCallback(
    (nextVal: number) => {
      if (exportProgress !== null) return;
      const clamped = Math.max(0, Math.min(REEL_DURATION, nextVal));
      reelAudio.unlock();
      reelAudio.stopSpeech();
      setIsPlaying(false);
      timeRef.current = clamped;
      setCurrentTime(clamped);
    },
    [exportProgress]
  );

  const handleJumpBeat = useCallback(
    (beatTime: number) => {
      if (exportProgress !== null) return;
      reelAudio.unlock();
      reelAudio.stopSpeech();
      lastTsRef.current = null;
      timeRef.current = beatTime;
      setCurrentTime(beatTime);
      setIsPlaying(true);
      if (beatTime === 0 && reelAudio.enabled) {
        reelAudio.playCue('lobby_open', rateRef.current);
      } else if (beatTime === 9 && reelAudio.enabled) {
        reelAudio.playCue('spiral_whoosh', rateRef.current);
      } else if (beatTime === 21 && reelAudio.enabled) {
        reelAudio.playCue('morning_door', rateRef.current);
      }
    },
    [exportProgress]
  );

  const clearPreviousReadyDownload = useCallback(() => {
    if (readyBlobUrlRef.current) {
      URL.revokeObjectURL(readyBlobUrlRef.current);
      readyBlobUrlRef.current = null;
    }
    setReadyDownload(null);
    setTelegramFeedback(null);
  }, []);

  const refreshTelegramInfo = useCallback(async () => {
    try {
      const statusRes = await fetch('/api/telegram/status');
      const statusData = (await statusRes.json()) as {
        configured?: boolean;
        botUsername?: string;
        defaultChatId?: string;
        error?: string;
      };
      const configured = Boolean(statusData.configured);
      setTelegramStatus({
        checked: true,
        configured,
        botUsername: statusData.botUsername,
        defaultChatId: statusData.defaultChatId,
        error: statusData.error,
      });
      if (statusData.defaultChatId) {
        setTelegramChatId((prev) => prev || statusData.defaultChatId || '');
      }

      if (configured) {
        const chatsRes = await fetch('/api/telegram/chats');
        if (chatsRes.ok) {
          const chatsData = (await chatsRes.json()) as {
            chats?: Array<{
              id: string;
              title: string;
              type: string;
              username?: string;
            }>;
          };
          const list = chatsData.chats ?? [];
          setTelegramChats(list);
          if (list.length > 0) {
            setTelegramChatId((prev) => prev || list[0].id);
          }
        }
      }
    } catch {
      setTelegramStatus({
        checked: true,
        configured: false,
      });
    }
  }, []);

  const handleOpenSaveDialog = useCallback(
    (mode: 'save' | 'telegram' = 'save') => {
      setModalMode(mode);
      setExportError(null);
      setTelegramFeedback(null);
      setShowSaveModal(true);
      void refreshTelegramInfo();
    },
    [refreshTelegramInfo]
  );

  const toggleSceneSelection = useCallback((sceneId: ReelSceneId) => {
    setSelectedSceneIds((prev) =>
      prev.includes(sceneId)
        ? prev.length > 1
          ? prev.filter((id) => id !== sceneId)
          : prev
        : [...prev, sceneId]
    );
  }, []);

  const handleConfirmSaveVideo = useCallback(async () => {
    const idsToExport =
      downloadScope === 'all'
        ? REEL_SCENES.map((s) => s.id)
        : selectedSceneIds;

    if (idsToExport.length === 0) return;

    clearPreviousReadyDownload();
    reelAudio.unlock();
    reelAudio.stopSpeech();
    setIsPlaying(false);
    setExportError(null);
    setExportProgress(0);

    const prevTime = timeRef.current;
    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const result = await exportReelVideo({
        sceneIds: idsToExport,
        isFullReel: downloadScope === 'all',
        includeCaptions: includeExportCaptions,
        autoDownload: modalMode === 'save',
        setStageTime: (t) => {
          timeRef.current = t;
          setCurrentTime(t);
        },
        getStageSvg: () => stageSvgRef.current,
        onProgress: (pct) => setExportProgress(pct),
        signal: controller.signal,
      });

      if (result) {
        readyBlobUrlRef.current = result.blobUrl;
        setReadyDownload(result);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setExportError(
          err instanceof Error
            ? err.message
            : 'Unable to prepare video file in this browser.'
        );
      }
    } finally {
      setExportProgress(null);
      exportAbortRef.current = null;
      timeRef.current = prevTime;
      setCurrentTime(prevTime);
    }
  }, [
    clearPreviousReadyDownload,
    downloadScope,
    includeExportCaptions,
    modalMode,
    selectedSceneIds,
  ]);

  const handleShareViaDeviceSheet = useCallback(async () => {
    if (!readyDownload) return;
    setTelegramFeedback(null);

    try {
      const file = new File([readyDownload.blob], readyDownload.filename, {
        type: readyDownload.mimeType,
      });
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: 'One Last Match Before I Sleep',
          text: telegramCaption.trim() || 'One Last Match Before I Sleep',
        });
        setTelegramFeedback({
          kind: 'ok',
          text: 'Opened device share sheet — select Telegram to send to any chat.',
        });
        return;
      }
      setTelegramFeedback({
        kind: 'err',
        text: 'This preview frame blocks native file share. Use Direct Telegram Bot send below or download the .mp4 and drop it into Telegram.',
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setTelegramFeedback({
        kind: 'err',
        text: 'Device share was unavailable here. Use Direct Telegram Bot send below or save the .mp4 file first.',
      });
    }
  }, [readyDownload, telegramCaption]);

  const handleSendToTelegramChat = useCallback(async () => {
    if (!readyDownload) return;
    const trimmedChat = telegramChatId.trim();
    if (!trimmedChat) {
      setTelegramFeedback({
        kind: 'err',
        text: 'Enter a Telegram Chat ID or @channelusername first.',
      });
      return;
    }

    setTelegramBusy(true);
    setTelegramFeedback(null);
    try {
      const form = new FormData();
      form.append('chatId', trimmedChat);
      form.append('caption', telegramCaption.trim());
      form.append('width', String(readyDownload.width));
      form.append('height', String(readyDownload.height));
      form.append('video', readyDownload.blob, readyDownload.filename);

      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        chatTitle?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setTelegramFeedback({
          kind: 'err',
          text: data.error || 'Could not send video to Telegram chat.',
        });
        return;
      }

      setTelegramFeedback({
        kind: 'ok',
        text: `Sent ${readyDownload.filename} to ${data.chatTitle || trimmedChat}.`,
      });
    } catch {
      setTelegramFeedback({
        kind: 'err',
        text: 'Network error while sending video to Telegram.',
      });
    } finally {
      setTelegramBusy(false);
    }
  }, [readyDownload, telegramCaption, telegramChatId]);

  const handleCancelExport = useCallback(() => {
    exportAbortRef.current?.abort();
    setExportProgress(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'Escape' && showSaveModal && exportProgress === null) {
        e.preventDefault();
        setShowSaveModal(false);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReplay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleScrub(timeRef.current - 1.0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleScrub(timeRef.current + 1.0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportProgress, handleReplay, handleScrub, handleTogglePlay, showSaveModal]);

  const frame = useMemo(() => evaluateReel(currentTime), [currentTime]);
  const activeBeat = useMemo(
    () => REEL_BEATS.find((b) => b.id === frame.sceneId) ?? REEL_BEATS[0],
    [frame.sceneId]
  );

  const activeCaption = useMemo(() => {
    const line = REEL_DIALOGUE_SCRIPT.find(
      (d) => currentTime >= d.start && currentTime <= d.end
    );
    if (line) {
      return { speaker: line.speaker, text: line.text };
    }
    if (currentTime >= 33.0 && currentTime <= 34.4) {
      return { speaker: 'Biscuit', text: 'Arf.' };
    }
    return null;
  }, [currentTime]);

  const showStartPrompt = !isPlaying && currentTime < 0.15 && exportProgress === null;

  const progressPct = (currentTime / REEL_DURATION) * 100;

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F7FA] flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="w-full border-b border-white/[0.08] bg-[#050505]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            One Last Match Before I Sleep
          </span>

          <nav
            aria-label="Reel scenes"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            {REEL_BEATS.map((beat) => {
              const isActive = beat.id === activeBeat.id;
              return (
                <button
                  key={beat.id}
                  type="button"
                  onClick={() => handleJumpBeat(beat.time)}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] rounded-sm ${
                    isActive
                      ? 'text-white border-[#E11D48]'
                      : 'border-transparent hover:text-white'
                  }`}
                >
                  {beat.shortLabel}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenSaveDialog('telegram')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold bg-[#229ED9]/15 hover:bg-[#229ED9]/25 text-[#5CC4F5] border border-[#229ED9]/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5CC4F5]"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Send to Telegram</span>
              <span className="sm:hidden">Telegram</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenSaveDialog('save')}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white tabular-nums"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>
                {exportProgress !== null
                  ? `Saving ${exportProgress}%`
                  : readyDownload
                    ? 'Save / Share'
                    : 'Save Video'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main 9:16 Theater Split */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Vertical 9:16 TikTok Reel Stage */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <ReelStage
              frame={frame}
              isPlaying={isPlaying}
              onTogglePlay={handleTogglePlay}
              showSafeZones={showSafeZones}
              showCaptions={showCaptions}
              activeCaption={activeCaption}
              showStartPrompt={showStartPrompt}
              stageSvgRef={stageSvgRef}
            />
            {!audioUnlocked && isPlaying && soundEnabled && exportProgress === null && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  reelAudio.unlock();
                  reelAudio.syncActiveDialogue(timeRef.current, rateRef.current);
                }}
                className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-[#141720] hover:bg-[#1E2230] text-white border border-white/20 shadow-lg cursor-pointer transition-colors"
              >
                <Volume2 className="w-4 h-4 text-[#F2B705]" aria-hidden="true" />
                <span>Tap to enable voice &amp; sound</span>
              </button>
            )}
          </div>

          {/* Right: Timeline Scrubber, Controls & Beat Sheet */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <section
              aria-label="Reel timeline controls"
              className="bg-[#12141C] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">
                    9:16 Vertical Reel · Tunde, Zainab &amp; Biscuit
                  </div>
                  <h1 className="font-display text-lg sm:text-xl font-bold text-white mt-1 truncate">
                    {activeBeat.label}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    {activeBeat.summary}
                  </p>
                </div>
                <div className="font-mono tabular-nums text-xs sm:text-sm text-slate-200 whitespace-nowrap shrink-0 pt-1">
                  {formatTimecode(currentTime)} / {formatTimecode(REEL_DURATION)}
                </div>
              </div>

              {/* Timeline Scrubber */}
              <div className="relative pt-2 pb-5">
                <div className="relative h-3 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-[#E11D48]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <input
                  type="range"
                  min={0}
                  max={REEL_DURATION}
                  step={0.05}
                  value={currentTime}
                  aria-label="Scrub 35-second TikTok Reel timeline"
                  onChange={(e) => handleScrub(parseFloat(e.target.value))}
                  className="absolute top-0 left-0 w-full h-7 opacity-0 cursor-pointer z-20"
                />

                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[5px] -translate-x-1/2 w-5 h-5 rounded-full bg-white border-[3px] border-[#E11D48] shadow-md z-10"
                  style={{ left: `${progressPct}%` }}
                />

                <div className="relative w-full h-4 mt-1.5">
                  {REEL_BEATS.map((beat) => {
                    const leftPct = (beat.time / REEL_DURATION) * 100;
                    const isCurrent = beat.id === activeBeat.id;
                    return (
                      <button
                        key={beat.id}
                        type="button"
                        onClick={() => handleJumpBeat(beat.time)}
                        style={{
                          left: `${leftPct}%`,
                          transform:
                            leftPct === 0 ? 'translateX(0%)' : 'translateX(-50%)',
                        }}
                        className={`absolute top-0 text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:underline ${
                          isCurrent
                            ? 'text-[#F2B705] font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {beat.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Playback Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-4 h-4" aria-hidden="true" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {currentTime >= REEL_DURATION - 0.05
                            ? 'Play Again'
                            : 'Play'}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleReplay}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-slate-100 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    <span>Replay</span>
                  </button>

                  <div
                    role="group"
                    aria-label="Playback speed"
                    className="flex items-center p-1 rounded-xl bg-white/[0.05] border border-white/[0.06]"
                  >
                    {([0.5, 1] as const).map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          playbackRate === rate
                            ? 'bg-white text-[#050505]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      reelAudio.unlock();
                      setSoundEnabled((s) => !s);
                    }}
                    aria-label={soundEnabled ? 'Mute voice and SFX' : 'Unmute voice and SFX'}
                    className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-4 h-4 text-[#F2B705]" aria-hidden="true" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">
                      {soundEnabled ? 'Sound On' : 'Muted'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowCaptions((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      showCaptions
                        ? 'bg-[#E11D48]/15 border-[#E11D48]/60 text-white'
                        : 'bg-white/[0.05] hover:bg-white/[0.11] text-slate-200 border-white/[0.08]'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Captions</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowSafeZones((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {showSafeZones ? (
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>Safe Guides</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCastStrip((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Cast</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Live Active Spoken Line */}
            {activeCaption && (
              <div
                aria-live="polite"
                className="rounded-xl bg-[#12141C] border border-white/[0.08] px-4 py-3 flex items-center gap-3"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#F2B705] whitespace-nowrap shrink-0">
                  {activeCaption.speaker}
                </span>
                <p className="text-xs sm:text-sm text-slate-100 truncate">
                  {activeCaption.text}
                </p>
              </div>
            )}

            {/* Quick Scene Cue List */}
            <section
              aria-label="Scene timestamps"
              className="border-t border-white/[0.08] pt-4 flex flex-col gap-2"
            >
              {REEL_SCENES.map((sc) => {
                const isCurrent = sc.id === activeBeat.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleJumpBeat(sc.start)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-4 ${
                      isCurrent
                        ? 'bg-[#E11D48]/10 border-[#E11D48] text-white'
                        : 'bg-[#12141C] border-white/[0.06] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold truncate">
                        {sc.title}
                      </div>
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {sc.subtitle}
                      </div>
                    </div>
                    <span className="font-mono tabular-nums text-xs text-slate-400 whitespace-nowrap shrink-0">
                      {formatTimecode(sc.start)}–{formatTimecode(sc.end)}
                    </span>
                  </button>
                );
              })}
            </section>

            {/* Collapsible Cast Sheet */}
            {showCastStrip && sprites && (
              <section
                aria-label="Reel cast profiles"
                className="bg-[#12141C] border border-white/[0.08] rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3"
              >
                {[
                  {
                    name: 'Tunde',
                    role: 'Lead · Black Hoodie',
                    img: sprites.tundeSmug.fullUrl,
                  },
                  {
                    name: 'Zainab',
                    role: 'Co-Lead · Yellow Hairclip',
                    img: sprites.zainab.fullUrl,
                  },
                  {
                    name: 'Biscuit',
                    role: 'Sidekick · Red Collar',
                    img: sprites.biscuitSideEye.fullUrl,
                  },
                ].map((c) => (
                  <div
                    key={c.name}
                    className="rounded-xl bg-[#0A0B10] border border-white/[0.06] p-3 flex items-center gap-3"
                  >
                    <img
                      src={c.img}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 object-contain shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {c.name}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{c.role}</p>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Save & Send to Telegram Dialog */}
      {showSaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs overflow-y-auto"
          onClick={() => {
            if (exportProgress === null && !telegramBusy) setShowSaveModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-video-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-[#12141C] border border-white/[0.12] p-6 shadow-2xl flex flex-col gap-5 my-auto max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="save-video-title"
                  className="text-base font-bold text-white"
                >
                  {modalMode === 'telegram'
                    ? 'Send Reel to Telegram Chat'
                    : 'Save & Share Reel Video'}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Encodes playable 9:16 H.264 MP4 with sound effects for offline players and Telegram inline video.
                </p>
              </div>
              {exportProgress === null && !telegramBusy && (
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  aria-label="Close dialog"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {exportError && (
              <p
                className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2"
                role="alert"
              >
                {exportError}
              </p>
            )}

            {exportProgress !== null ? (
              <div className="flex flex-col gap-3 py-2">
                <div className="flex items-center justify-between text-xs font-medium text-slate-200">
                  <span>Encoding playable 9:16 MP4 video...</span>
                  <span className="font-mono tabular-nums text-[#F2B705]">
                    {exportProgress}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-[#E11D48] transition-all duration-150"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Rendering animation frames, captions, and audio track into MP4.
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleCancelExport}
                    className="px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] cursor-pointer transition-colors"
                  >
                    Cancel Export
                  </button>
                </div>
              </div>
            ) : readyDownload ? (
              <div className="flex flex-col gap-4 py-1">
                {/* Inline Video Verification Player */}
                <div className="rounded-xl bg-[#07080D] border border-white/[0.1] p-3 flex flex-col sm:flex-row items-center gap-4">
                  <video
                    src={readyDownload.blobUrl}
                    controls
                    playsInline
                    className="w-28 aspect-[9/16] rounded-lg bg-black object-contain shrink-0 border border-white/10"
                  />
                  <div className="min-w-0 flex-1 w-full">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        Playable Video Ready
                      </span>
                    </div>
                    <div className="text-xs font-medium text-white truncate mt-1.5 flex items-center gap-1.5">
                      <FileVideo className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="truncate">{readyDownload.filename}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {formatFileSize(readyDownload.sizeBytes)} ·{' '}
                      {formatTimecode(readyDownload.durationSec)} ·{' '}
                      {readyDownload.width} × {readyDownload.height}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <a
                        href={readyDownload.blobUrl}
                        download={readyDownload.filename}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download File</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleShareViaDeviceSheet}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Device Share</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Send to Telegram Chat */}
                <div className="rounded-xl bg-[#0A0C13] border border-[#229ED9]/30 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-[#5CC4F5]" aria-hidden="true" />
                      <span className="text-sm font-semibold text-white">
                        Send Directly to Telegram Chat
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshTelegramInfo()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-300 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden="true" />
                      <span>Refresh Chats</span>
                    </button>
                  </div>

                  {telegramStatus.configured ? (
                    <>
                      {telegramStatus.botUsername && (
                        <p className="text-[11px] text-slate-400">
                          Connected bot:{' '}
                          <span className="text-slate-200 font-mono">
                            @{telegramStatus.botUsername}
                          </span>
                        </p>
                      )}

                      {telegramChats.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[11px] text-slate-400">
                            Recent bot chats (tap to select):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {telegramChats.map((c) => {
                              const selected = telegramChatId.trim() === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setTelegramChatId(c.id)}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                    selected
                                      ? 'bg-[#229ED9]/20 border-[#5CC4F5] text-white'
                                      : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:border-white/20'
                                  }`}
                                >
                                  {c.title}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2.5">
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-slate-300">
                            Telegram Chat ID or @channelusername
                          </span>
                          <input
                            type="text"
                            value={telegramChatId}
                            onChange={(e) => setTelegramChatId(e.target.value)}
                            placeholder="e.g. 123456789 or @mychannel"
                            className="w-full px-3 py-2 rounded-lg bg-[#12141C] border border-white/[0.12] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#5CC4F5]"
                          />
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] font-medium text-slate-300">
                            Message Caption
                          </span>
                          <input
                            type="text"
                            value={telegramCaption}
                            onChange={(e) => setTelegramCaption(e.target.value)}
                            maxLength={1024}
                            placeholder="Caption shown under the video in Telegram"
                            className="w-full px-3 py-2 rounded-lg bg-[#12141C] border border-white/[0.12] text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#5CC4F5]"
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        disabled={telegramBusy}
                        onClick={() => void handleSendToTelegramChat()}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl text-xs sm:text-sm font-semibold bg-[#229ED9] hover:bg-[#1C8BC0] disabled:opacity-60 text-white transition-colors cursor-pointer"
                      >
                        <Send className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {telegramBusy
                            ? 'Uploading Reel to Telegram...'
                            : 'Send Video to Telegram Chat'}
                        </span>
                      </button>
                    </>
                  ) : (
                    <div className="text-xs text-slate-300 leading-relaxed space-y-1.5">
                      <p>
                        To send directly from this app into any Telegram chat:
                      </p>
                      <ol className="list-decimal list-inside text-[11px] text-slate-400 space-y-1">
                        <li>
                          Create a bot with <span className="text-slate-200 font-mono">@BotFather</span> on Telegram.
                        </li>
                        <li>
                          Add <span className="text-slate-200 font-mono">TELEGRAM_BOT_TOKEN</span> in AI Studio{' '}
                          <span className="text-slate-200">Settings → Secrets</span>.
                        </li>
                        <li>
                          Send <span className="text-slate-200 font-mono">/start</span> to your bot in Telegram, then click{' '}
                          <span className="text-slate-200">Refresh Chats</span>.
                        </li>
                      </ol>
                    </div>
                  )}

                  {telegramFeedback && (
                    <p
                      role={telegramFeedback.kind === 'err' ? 'alert' : 'status'}
                      className={`text-xs rounded-lg px-3 py-2 border ${
                        telegramFeedback.kind === 'ok'
                          ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                          : 'text-rose-300 bg-rose-500/10 border-rose-500/30'
                      }`}
                    >
                      {telegramFeedback.text}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={clearPreviousReadyDownload}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
                  >
                    Export Different Scenes
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-white/[0.08] hover:bg-white/[0.14] cursor-pointer transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="flex flex-col gap-2.5"
                  role="radiogroup"
                  aria-label="Export scope"
                >
                  <button
                    type="button"
                    onClick={() => setDownloadScope('all')}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      downloadScope === 'all'
                        ? 'bg-[#E11D48]/12 border-[#E11D48] text-white'
                        : 'bg-[#0A0B10] border-white/[0.08] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">Full 35s TikTok Reel</div>
                      <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                        All 3 scenes · {formatTimecode(REEL_DURATION)}
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        downloadScope === 'all'
                          ? 'bg-[#E11D48] border-[#E11D48] text-white'
                          : 'border-white/30'
                      }`}
                    >
                      {downloadScope === 'all' && <Check className="w-3 h-3" />}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDownloadScope('select')}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      downloadScope === 'select'
                        ? 'bg-[#E11D48]/12 border-[#E11D48] text-white'
                        : 'bg-[#0A0B10] border-white/[0.08] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        Select Specific Scenes
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Export only chosen beats from the reel
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        downloadScope === 'select'
                          ? 'bg-[#E11D48] border-[#E11D48] text-white'
                          : 'border-white/30'
                      }`}
                    >
                      {downloadScope === 'select' && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                </div>

                {downloadScope === 'select' && (
                  <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.08]">
                    {REEL_SCENES.map((scene) => {
                      const checked = selectedSceneIds.includes(scene.id);
                      return (
                        <button
                          key={scene.id}
                          type="button"
                          onClick={() => toggleSceneSelection(scene.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                            checked
                              ? 'bg-white/[0.06] border-white/30 text-white'
                              : 'bg-[#0A0B10] border-white/[0.06] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">
                              {scene.title}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {formatTimecode(scene.start)}–{formatTimecode(scene.end)}
                            </div>
                          </div>
                          <span
                            aria-hidden="true"
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-[#E11D48] border-[#E11D48] text-white'
                                : 'border-white/30'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIncludeExportCaptions((v) => !v)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#0A0B10] border border-white/[0.08] hover:border-white/20 transition-colors cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">
                      Include Spoken Dialogue Captions
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Burns readable TikTok subtitles directly into the MP4 video
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      includeExportCaptions
                        ? 'bg-[#E11D48] border-[#E11D48] text-white'
                        : 'border-white/30'
                    }`}
                  >
                    {includeExportCaptions && <Check className="w-3 h-3" />}
                  </span>
                </button>

                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    className="px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] cursor-pointer transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSaveVideo}
                    className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold bg-[#E11D48] hover:bg-[#BE123C] text-white cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {modalMode === 'telegram' ? (
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {modalMode === 'telegram'
                        ? 'Prepare Video for Telegram'
                        : downloadScope === 'all'
                          ? 'Render Full Reel (.mp4)'
                          : 'Render Selected (.mp4)'}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
