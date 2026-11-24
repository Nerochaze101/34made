export type VoiceGenderHint = 'female' | 'male_young';

export type ReelCueId =
  | 'lobby_open'
  | 'tunde_promise'
  | 'spiral_whoosh'
  | 'tunde_camping'
  | 'tunde_lag'
  | 'morning_door'
  | 'zainab_check'
  | 'tunde_warmup'
  | 'biscuit_arf';

export interface ReelDialogueEntry {
  cue: ReelCueId;
  speaker: 'Tunde' | 'Zainab';
  start: number;
  end: number;
  text: string;
  sentences: string[];
  pitch: number;
  fallbackPitch: number;
  baseRate: number;
  genderHint: VoiceGenderHint;
}

export const REEL_DIALOGUE_SCRIPT: ReelDialogueEntry[] = [
  {
    cue: 'tunde_promise',
    speaker: 'Tunde',
    start: 0.9,
    end: 6.4,
    text: '11:55 PM. Just one quick 1v1 match, win cleanly, and I am asleep by midnight.',
    sentences: [
      '11:55 PM.',
      'Just one quick 1v1 match, win cleanly, and I am asleep by midnight.',
    ],
    pitch: 1.0,
    fallbackPitch: 0.9,
    baseRate: 1.04,
    genderHint: 'male_young',
  },
  {
    cue: 'tunde_camping',
    speaker: 'Tunde',
    start: 9.8,
    end: 15.2,
    text: 'He is camping! Does not count, run it back!',
    sentences: ['He is camping!', 'Does not count, run it back!'],
    pitch: 1.15,
    fallbackPitch: 1.05,
    baseRate: 1.16,
    genderHint: 'male_young',
  },
  {
    cue: 'tunde_lag',
    speaker: 'Tunde',
    start: 15.8,
    end: 20.6,
    text: 'Okay, THAT was lag! One real rematch, no excuses!',
    sentences: ['Okay, THAT was lag!', 'One real rematch, no excuses!'],
    pitch: 1.24,
    fallbackPitch: 1.12,
    baseRate: 1.18,
    genderHint: 'male_young',
  },
  {
    cue: 'zainab_check',
    speaker: 'Zainab',
    start: 22.8,
    end: 28.0,
    text: 'Good morning. Did you win your midnight match?',
    sentences: ['Good morning.', 'Did you win your midnight match?'],
    pitch: 0.96,
    fallbackPitch: 1.15,
    baseRate: 0.86,
    genderHint: 'female',
  },
  {
    cue: 'tunde_warmup',
    speaker: 'Tunde',
    start: 29.0,
    end: 32.4,
    text: 'I... I am warming up for today!',
    sentences: ['I, I am warming up for today!'],
    pitch: 1.08,
    fallbackPitch: 0.96,
    baseRate: 0.94,
    genderHint: 'male_young',
  },
];

const FEMALE_NAME_HINTS = [
  'samantha',
  'victoria',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'zira',
  'hazel',
  'susan',
  'aria',
  'jenny',
  'michelle',
  'ava',
  'allison',
  'emma',
  'amy',
  'joanna',
  'salli',
  'kimberly',
  'kendra',
  'shelley',
  'sandy',
  'flo',
  'kathy',
  'claire',
  'kate',
  'serena',
  'google us english',
  'google uk english female',
  'woman',
  'girl',
];

const MALE_NAME_HINTS = [
  'google uk english male',
  'daniel',
  'david',
  'mark',
  'george',
  'ryan',
  'guy',
  'christopher',
  'eric',
  'alex',
  'fred',
  'aaron',
  'arthur',
  'oliver',
  'liam',
  'matthew',
  'joey',
  'justin',
  'brian',
  'reed',
  'rocko',
  'eddy',
  'grandpa',
  'jacob',
  'andrew',
  'davis',
  'jason',
  'tony',
];

function isFemaleVoiceName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\bfemale\b|\bwoman\b|\bgirl\b/.test(lower)) return true;
  return FEMALE_NAME_HINTS.some((hint) => lower.includes(hint));
}

function isMaleVoiceName(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\bfemale\b|\bwoman\b|\bgirl\b/.test(lower)) return false;
  if (/\bmale\b|\bman\b|\bboy\b/.test(lower)) return true;
  return MALE_NAME_HINTS.some((hint) => lower.includes(hint));
}

class ReelAudioEngine {
  private ctx: AudioContext | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private activeTimer: number | null = null;
  private speechSessionId = 0;
  private speechWarmedUp = false;
  private currentActiveCue: ReelCueId | null = null;
  private unlockListeners = new Set<() => void>();
  public enabled = true;
  public unlocked = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.refreshVoices();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => {
        this.refreshVoices();
      });
    }
  }

  private refreshVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    this.voices = window.speechSynthesis.getVoices() || [];
  }

  public onUnlockChange(cb: () => void): () => void {
    this.unlockListeners.add(cb);
    return () => {
      this.unlockListeners.delete(cb);
    };
  }

  private notifyUnlock(): void {
    for (const cb of this.unlockListeners) {
      cb();
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => {
        if (this.ctx?.state === 'running' && !this.unlocked) {
          this.unlocked = true;
          this.notifyUnlock();
        }
      });
    } else if (this.ctx && this.ctx.state === 'running' && !this.unlocked) {
      this.unlocked = true;
      this.notifyUnlock();
    }
    return this.ctx;
  }

  public unlock(): boolean {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
    if (ctx) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.00001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.02);
        this.unlocked = true;
        this.notifyUnlock();
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.refreshVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      if (
        !this.speechWarmedUp &&
        !window.speechSynthesis.speaking &&
        !window.speechSynthesis.pending
      ) {
        this.speechWarmedUp = true;
        try {
          const warm = new SpeechSynthesisUtterance(' ');
          warm.volume = 0;
          warm.rate = 2;
          window.speechSynthesis.speak(warm);
        } catch {
          // ignore
        }
      }
    }
    return this.unlocked;
  }

  public stopSpeech(): void {
    this.speechSessionId++;
    if (this.activeTimer !== null) {
      window.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.currentActiveCue = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    }
  }

  private pickVoice(
    hint: VoiceGenderHint
  ): { voice: SpeechSynthesisVoice | null; matchedGender: boolean } {
    if (!this.voices.length) this.refreshVoices();
    const enVoices = this.voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    const pool = enVoices.length > 0 ? enVoices : this.voices;
    if (!pool.length) return { voice: null, matchedGender: false };

    const females = pool.filter((v) => isFemaleVoiceName(v.name));
    const males = pool.filter((v) => isMaleVoiceName(v.name));

    if (hint === 'female') {
      const picked =
        females.find((v) => v.localService) ??
        females[0] ??
        pool.find((v) => !isMaleVoiceName(v.name)) ??
        pool[0];
      return { voice: picked, matchedGender: females.includes(picked) };
    }

    const picked =
      males.find((v) => v.localService) ??
      males[0] ??
      pool.find((v) => !isFemaleVoiceName(v.name)) ??
      pool[0];
    return { voice: picked, matchedGender: males.includes(picked) };
  }

  private playLobbyChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [587.33, 880.0, 1174.66];
    notes.forEach((freq, i) => {
      const t0 = ctx.currentTime + i * 0.085;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    });
  }

  private playSpiralWhoosh(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Anime whoosh bandpass noise + rapid thumb tap clicks
    const bufLen = Math.floor(ctx.sampleRate * 0.45);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.sin((i / bufLen) * Math.PI);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(now);

    for (let k = 0; k < 5; k++) {
      const tc = now + 0.3 + k * 0.09;
      const osc = ctx.createOscillator();
      const cg = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1100 + (k % 2) * 260, tc);
      cg.gain.setValueAtTime(0.04, tc);
      cg.gain.exponentialRampToValueAtTime(0.0001, tc + 0.03);
      osc.connect(cg);
      cg.connect(ctx.destination);
      osc.start(tc);
      osc.stop(tc + 0.04);
    }
  }

  private playMorningBirds(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    // Soft door open & cheerful 2-chirp birdsong
    [0.12, 0.38, 0.72].forEach((offset, idx) => {
      const t0 = ctx.currentTime + offset;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const base = 1850 + idx * 140;
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(base * 1.38, t0 + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 0.92, t0 + 0.14);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.038, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.18);
    });
  }

  private playBiscuitArf(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Short dry pup bark ("Arf."): punchy pitch drop + crisp mouth burst
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.13);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.Q.setValueAtTime(1.8, now);
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  private speakSentenceList(
    entry: ReelDialogueEntry,
    sentences: string[],
    speedMult: number
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (sentences.length === 0) return;

    const wasBusy = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    this.stopSpeech();
    this.currentActiveCue = entry.cue;
    const sessionId = this.speechSessionId;

    const runQueue = (idx: number) => {
      if (!this.enabled || sessionId !== this.speechSessionId || idx >= sentences.length) {
        return;
      }
      const line = sentences[idx].trim();
      if (!line) {
        runQueue(idx + 1);
        return;
      }

      this.refreshVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const { voice, matchedGender } = this.pickVoice(entry.genderHint);
      const utter = new SpeechSynthesisUtterance(line);
      if (voice) {
        utter.voice = voice;
      }
      utter.lang = voice?.lang || 'en-US';
      utter.pitch = matchedGender ? entry.pitch : entry.fallbackPitch;
      utter.rate = Math.min(1.5, Math.max(0.68, entry.baseRate * speedMult));
      utter.volume = 1.0;

      utter.onend = () => {
        if (sessionId === this.speechSessionId && idx + 1 < sentences.length) {
          runQueue(idx + 1);
        }
      };

      window.speechSynthesis.speak(utter);
    };

    if (wasBusy) {
      this.activeTimer = window.setTimeout(() => {
        runQueue(0);
      }, 60);
    } else {
      runQueue(0);
    }
  }

  public playCue(cue: ReelCueId, speedMult = 1): void {
    if (!this.enabled) return;

    if (cue === 'lobby_open') {
      this.playLobbyChime();
      return;
    }
    if (cue === 'spiral_whoosh') {
      this.playSpiralWhoosh();
      return;
    }
    if (cue === 'morning_door') {
      this.playMorningBirds();
      return;
    }
    if (cue === 'biscuit_arf') {
      this.playBiscuitArf();
      return;
    }

    const entry = REEL_DIALOGUE_SCRIPT.find((d) => d.cue === cue);
    if (entry) {
      this.speakSentenceList(entry, entry.sentences, speedMult);
    }
  }

  public syncActiveDialogue(currentTime: number, speedMult = 1): void {
    if (!this.enabled) return;
    if (currentTime < 0.8) {
      this.playLobbyChime();
      return;
    }

    const active = REEL_DIALOGUE_SCRIPT.find(
      (d) => currentTime >= d.start && currentTime < d.end - 0.5
    );
    if (!active) return;
    if (
      this.currentActiveCue === active.cue &&
      typeof window !== 'undefined' &&
      window.speechSynthesis?.speaking
    ) {
      return;
    }

    const pct = Math.max(
      0,
      Math.min(0.85, (currentTime - active.start) / (active.end - active.start))
    );
    if (pct < 0.25) {
      this.speakSentenceList(active, active.sentences, speedMult);
      return;
    }

    const words = active.text.split(/\s+/);
    const startIdx = Math.floor(pct * words.length);
    const remainingText = words.slice(startIdx).join(' ');
    if (remainingText.trim()) {
      this.speakSentenceList(active, [remainingText], speedMult);
    }
  }
}

export const reelAudio = new ReelAudioEngine();
