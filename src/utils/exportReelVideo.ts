import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { MORNING_BG_URL, NIGHT_BG_URL } from '../scene/ReelStage';
import { evaluateReel, REEL_DURATION, ReelSceneId } from '../scene/reelTimeline';
import { loadCastSprites } from './castChromaKey';
import { REEL_DIALOGUE_SCRIPT } from './soundFx';

export interface ReelSceneMeta {
  id: ReelSceneId;
  title: string;
  subtitle: string;
  start: number;
  end: number;
  filenameSlug: string;
}

export const REEL_SCENES: ReelSceneMeta[] = [
  {
    id: 'scene1',
    title: 'Scene 1 · The Confident Promise',
    subtitle: 'Night lamp, smug Tunde, Biscuit side-eye whip-pan',
    start: 0.0,
    end: 9.0,
    filenameSlug: 'scene-1-confident-promise',
  },
  {
    id: 'scene2',
    title: 'Scene 2 · The Losing Streak Spiral',
    subtitle: 'Blue/red flashes, speed lines, panic & sleeping pup',
    start: 9.0,
    end: 21.0,
    filenameSlug: 'scene-2-losing-spiral',
  },
  {
    id: 'scene3',
    title: 'Scene 3 · Morning Reality Check',
    subtitle: 'Zainab doorway deadpan, frozen Tunde, Biscuit dry bark',
    start: 21.0,
    end: REEL_DURATION,
    filenameSlug: 'scene-3-morning-punchline',
  },
];

export interface ExportReelOptions {
  sceneIds: ReelSceneId[];
  isFullReel: boolean;
  includeCaptions?: boolean;
  autoDownload?: boolean;
  setStageTime: (t: number) => void;
  getStageSvg: () => SVGSVGElement | null;
  onProgress: (pct: number) => void;
  signal: AbortSignal;
}

export interface ReelExportResult {
  blob: Blob;
  blobUrl: string;
  filename: string;
  sizeBytes: number;
  durationSec: number;
  mimeType: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitReactPaint(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

export function triggerFileDownload(blobUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function getCaptionAtTime(
  t: number
): { speaker: string; text: string } | null {
  const line = REEL_DIALOGUE_SCRIPT.find((d) => t >= d.start && t <= d.end);
  if (line) {
    return { speaker: line.speaker, text: line.text };
  }
  if (t >= 33.0 && t <= 34.4) {
    return { speaker: 'Biscuit', text: 'Arf.' };
  }
  return null;
}

function drawExportCaptionOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  caption: { speaker: string; text: string }
): void {
  const scale = width / 450;
  const maxBoxW = width * 0.88;
  const padX = 16 * scale;
  const padY = 10 * scale;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bodyFontSize = Math.round(14 * scale);
  const speakerFontSize = Math.round(10 * scale);
  ctx.font = `600 ${bodyFontSize}px "Plus Jakarta Sans", system-ui, -apple-system, sans-serif`;

  const words = caption.text.split(' ');
  const lines: string[] = [];
  let current = '';
  const maxTextW = maxBoxW - padX * 2;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxTextW || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const lineH = bodyFontSize * 1.32;
  const speakerH = speakerFontSize * 1.3;
  const boxH = padY * 2 + speakerH + 4 * scale + lines.length * lineH;
  const boxW = Math.min(
    maxBoxW,
    Math.max(
      140 * scale,
      ...lines.map((l) => ctx.measureText(l).width + padX * 2)
    )
  );
  const boxX = (width - boxW) / 2;
  const boxY = height * 0.82 - boxH;
  const r = 12 * scale;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = Math.max(1, 1.2 * scale);
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, r);
  ctx.fill();
  ctx.stroke();

  ctx.font = `800 ${speakerFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillStyle = '#F2B705';
  ctx.fillText(
    caption.speaker.toUpperCase(),
    width / 2,
    boxY + padY + speakerH * 0.5
  );

  ctx.font = `600 ${bodyFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  lines.forEach((line, idx) => {
    const ly = boxY + padY + speakerH + 4 * scale + (idx + 0.5) * lineH;
    ctx.fillText(line, width / 2, ly);
  });
  ctx.restore();
}

function scheduleSfxOnContext(
  ctx: BaseAudioContext,
  selectedScenes: ReelSceneMeta[],
  outputNode?: AudioNode
): void {
  const target = outputNode ?? ctx.destination;
  let offset = outputNode ? ctx.currentTime : 0;

  for (const sc of selectedScenes) {
    const inRange = (absT: number) =>
      absT >= sc.start && absT <= sc.end ? offset + (absT - sc.start) : null;

    // 1. Scene 1 soft lobby chime (0.15s)
    const lobbyAt = inRange(0.15);
    if (lobbyAt !== null) {
      [587.33, 880.0, 1174.66].forEach((freq, i) => {
        const t0 = lobbyAt + i * 0.085;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.44);
        osc.connect(g);
        g.connect(target);
        osc.start(t0);
        osc.stop(t0 + 0.46);
      });
    }

    // 2. Scene 2 anime spiral whoosh + rapid thumb clicks (9.05s)
    const whooshAt = inRange(9.05);
    if (whooshAt !== null) {
      const dur = 0.45;
      const bufLen = Math.floor(ctx.sampleRate * dur);
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.sin((i / bufLen) * Math.PI);
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(320, whooshAt);
      filter.frequency.exponentialRampToValueAtTime(1400, whooshAt + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, whooshAt);
      g.gain.exponentialRampToValueAtTime(0.0001, whooshAt + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(target);
      src.start(whooshAt);

      for (let k = 0; k < 6; k++) {
        const tc = whooshAt + 0.28 + k * 0.09;
        const osc = ctx.createOscillator();
        const cg = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1100 + (k % 2) * 260, tc);
        cg.gain.setValueAtTime(0.06, tc);
        cg.gain.exponentialRampToValueAtTime(0.0001, tc + 0.035);
        osc.connect(cg);
        cg.connect(target);
        osc.start(tc);
        osc.stop(tc + 0.045);
      }
    }

    // 3. Scene 3 morning birdsong (21.1s)
    const birdsAt = inRange(21.1);
    if (birdsAt !== null) {
      [0.12, 0.38, 0.72].forEach((d, idx) => {
        const t0 = birdsAt + d;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const base = 1850 + idx * 140;
        osc.frequency.setValueAtTime(base, t0);
        osc.frequency.exponentialRampToValueAtTime(base * 1.38, t0 + 0.07);
        osc.frequency.exponentialRampToValueAtTime(base * 0.92, t0 + 0.14);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        osc.connect(g);
        g.connect(target);
        osc.start(t0);
        osc.stop(t0 + 0.18);
      });
    }

    // 4. Scene 3 Biscuit crisp dry bark "Arf." (33.0s)
    const arfAt = inRange(33.0);
    if (arfAt !== null) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420, arfAt);
      osc.frequency.exponentialRampToValueAtTime(175, arfAt + 0.13);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520, arfAt);
      filter.Q.setValueAtTime(1.8, arfAt);
      g.gain.setValueAtTime(0.001, arfAt);
      g.gain.exponentialRampToValueAtTime(0.32, arfAt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, arfAt + 0.17);
      osc.connect(filter);
      filter.connect(g);
      g.connect(target);
      osc.start(arfAt);
      osc.stop(arfAt + 0.19);
    }

    offset += sc.end - sc.start;
  }
}

async function synthesizeOfflineAudio(
  selectedScenes: ReelSceneMeta[],
  totalDuration: number
): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  try {
    const sampleRate = 44100;
    const totalSamples = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const offline = new OfflineAudioContext(2, totalSamples, sampleRate);
    scheduleSfxOnContext(offline, selectedScenes);
    return await offline.startRendering();
  } catch {
    return null;
  }
}

async function pickWebCodecsVideoConfig(): Promise<{
  codec: string;
  width: number;
  height: number;
  bitrate: number;
} | null> {
  if (typeof VideoEncoder === 'undefined') return null;

  const candidates = [
    { codec: 'avc1.4d002a', width: 1080, height: 1920, bitrate: 4_800_000 },
    { codec: 'avc1.64002a', width: 1080, height: 1920, bitrate: 4_800_000 },
    { codec: 'avc1.42002a', width: 1080, height: 1920, bitrate: 4_800_000 },
    { codec: 'avc1.42001f', width: 720, height: 1280, bitrate: 3_000_000 },
    { codec: 'avc1.4d001f', width: 720, height: 1280, bitrate: 3_000_000 },
    { codec: 'avc1.42E01E', width: 720, height: 1280, bitrate: 3_000_000 },
  ];

  for (const cand of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: cand.codec,
        width: cand.width,
        height: cand.height,
        bitrate: cand.bitrate,
        framerate: 24,
      });
      if (support.supported) {
        return cand;
      }
    } catch {
      // try next profile
    }
  }
  return null;
}

async function isAacAudioEncoderSupported(): Promise<boolean> {
  if (
    typeof AudioEncoder === 'undefined' ||
    typeof AudioData === 'undefined'
  ) {
    return false;
  }
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      numberOfChannels: 2,
      sampleRate: 44100,
      bitrate: 128_000,
    });
    return Boolean(support.supported);
  } catch {
    return false;
  }
}

async function renderFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  nightBgImg: HTMLImageElement | null,
  morningBgImg: HTMLImageElement | null,
  getStageSvg: () => SVGSVGElement | null,
  serializer: XMLSerializer,
  includeCaptions: boolean
): Promise<void> {
  const frame = evaluateReel(t);
  const { camera, isMorning, vfx } = frame;
  const bgImg = isMorning ? morningBgImg : nightBgImg;

  ctx.save();
  ctx.fillStyle = isMorning ? '#FEF3C7' : '#08090E';
  ctx.fillRect(0, 0, width, height);

  const camScaleX = width / 450;
  const camScaleY = height / 800;

  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.rotate((camera.rotateZ * Math.PI) / 180);
  ctx.translate(-camera.x * camScaleX, -camera.y * camScaleY);
  ctx.translate(-width / 2, -height / 2);

  if (vfx.whipBlurPx > 0.2) {
    ctx.filter = `blur(${(vfx.whipBlurPx * 1.4).toFixed(1)}px)`;
  } else {
    ctx.filter = 'none';
  }

  if (bgImg) {
    const padW = width * 1.24;
    const padH = height * 1.24;
    ctx.drawImage(bgImg, -width * 0.12, -height * 0.12, padW, padH);
  }

  const svgEl = getStageSvg();
  if (svgEl) {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    const svgStr = serializer.serializeToString(clone);
    const svgBlob = new Blob([svgStr], {
      type: 'image/svg+xml;charset=utf-8',
    });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const svgImg = await loadImage(svgUrl);
      ctx.drawImage(svgImg, 0, 0, width, height);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }
  ctx.restore();

  if (includeCaptions) {
    const caption = getCaptionAtTime(t);
    if (caption) {
      drawExportCaptionOverlay(ctx, width, height, caption);
    }
  }
}

export function pickFallbackVideoMime(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    if (
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(c.mimeType)
    ) {
      return c;
    }
  }
  return { mimeType: 'video/webm', ext: 'webm' };
}

export async function exportReelVideo(
  options: ExportReelOptions
): Promise<ReelExportResult | null> {
  const {
    sceneIds,
    isFullReel,
    includeCaptions = true,
    autoDownload = false,
    setStageTime,
    getStageSvg,
    onProgress,
    signal,
  } = options;

  const selectedScenes = REEL_SCENES.filter((s) => sceneIds.includes(s.id));
  if (selectedScenes.length === 0) {
    throw new Error('Select at least one scene to export.');
  }

  const FPS = 24;
  const totalDuration = selectedScenes.reduce(
    (sum, s) => sum + (s.end - s.start),
    0
  );

  let nightBgImg: HTMLImageElement | null = null;
  let morningBgImg: HTMLImageElement | null = null;
  try {
    [nightBgImg, morningBgImg] = await Promise.all([
      loadImage(NIGHT_BG_URL),
      loadImage(MORNING_BG_URL),
      loadCastSprites(),
    ]);
  } catch {
    // Graceful fallback if backdrop fails
  }

  const fileSlug = isFullReel
    ? 'one-last-match-tiktok-reel'
    : selectedScenes.length === 1
      ? selectedScenes[0].filenameSlug
      : 'selected-reel-scenes';

  const serializer = new XMLSerializer();

  // PRIMARY PATH: Hardware/WebCodecs H.264 + AAC -> Universal Playable MP4 (fastStart)
  const webCodecsCfg = await pickWebCodecsVideoConfig();
  if (webCodecsCfg) {
    const { width, height, codec, bitrate } = webCodecsCfg;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const audioBuffer = await synthesizeOfflineAudio(
      selectedScenes,
      totalDuration
    );
    const useAudio = Boolean(
      audioBuffer && (await isAacAudioEncoderSupported())
    );

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
      },
      audio: useAudio
        ? {
            codec: 'aac',
            numberOfChannels: 2,
            sampleRate: 44100,
          }
        : undefined,
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    let encoderFailure: Error | null = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => {
        encoderFailure = new Error(err.message || 'Video encoder failed.');
      },
    });

    videoEncoder.configure({
      codec,
      width,
      height,
      bitrate,
      framerate: FPS,
    });

    let audioEncoder: AudioEncoder | null = null;
    if (useAudio && audioBuffer) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (err) => {
          encoderFailure = new Error(err.message || 'Audio encoder failed.');
        },
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: 44100,
        bitrate: 128_000,
      });

      const left = audioBuffer.getChannelData(0);
      const right =
        audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
      const chunkFrames = 1024;
      for (let pos = 0; pos < audioBuffer.length; pos += chunkFrames) {
        const count = Math.min(chunkFrames, audioBuffer.length - pos);
        const planar = new Float32Array(count * 2);
        planar.set(left.subarray(pos, pos + count), 0);
        planar.set(right.subarray(pos, pos + count), count);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: 44100,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((pos / 44100) * 1_000_000),
          data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
    }

    const totalFrames = Math.max(1, Math.round(totalDuration * FPS));
    const frameDurUs = Math.round(1_000_000 / FPS);
    let globalFrameIdx = 0;

    try {
      for (const sceneMeta of selectedScenes) {
        const sceneDur = sceneMeta.end - sceneMeta.start;
        const sceneFrames = Math.round(sceneDur * FPS);

        for (let i = 0; i < sceneFrames; i++) {
          if (signal.aborted) {
            return null;
          }
          if (encoderFailure) {
            throw encoderFailure;
          }

          const t = Math.min(sceneMeta.end, sceneMeta.start + i / FPS);
          setStageTime(t);
          await waitReactPaint();

          await renderFrameToCanvas(
            ctx,
            width,
            height,
            t,
            nightBgImg,
            morningBgImg,
            getStageSvg,
            serializer,
            includeCaptions
          );

          const timestampUs = globalFrameIdx * frameDurUs;
          const vf = new VideoFrame(canvas, {
            timestamp: timestampUs,
            duration: frameDurUs,
          });
          videoEncoder.encode(vf, { keyFrame: globalFrameIdx % (FPS * 2) === 0 });
          vf.close();

          if (videoEncoder.encodeQueueSize > 8) {
            await videoEncoder.flush();
          }

          globalFrameIdx++;
          onProgress(
            Math.min(96, Math.round((globalFrameIdx / totalFrames) * 96))
          );
        }
      }

      if (signal.aborted) return null;

      await videoEncoder.flush();
      if (audioEncoder) {
        await audioEncoder.flush();
      }
      muxer.finalize();
    } finally {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    }

    if (signal.aborted) return null;

    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    if (blob.size === 0) {
      throw new Error('Encoded MP4 video file was empty.');
    }

    onProgress(100);
    const filename = `${fileSlug}.mp4`;
    const blobUrl = URL.createObjectURL(blob);
    if (autoDownload) {
      triggerFileDownload(blobUrl, filename);
    }

    return {
      blob,
      blobUrl,
      filename,
      sizeBytes: blob.size,
      durationSec: totalDuration,
      mimeType: 'video/mp4',
      width,
      height,
    };
  }

  // FALLBACK PATH: MediaRecorder for environments without WebCodecs H.264
  const WIDTH = 720;
  const HEIGHT = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const stream = canvas.captureStream(FPS);
  let audioCtx: AudioContext | null = null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AC) {
      audioCtx = new AC();
      const dest = audioCtx.createMediaStreamDestination();
      scheduleSfxOnContext(audioCtx, selectedScenes, dest);
      for (const track of dest.stream.getAudioTracks()) {
        stream.addTrack(track);
      }
    }
  } catch {
    // Video-only fallback if AudioContext fails
  }

  const { mimeType, ext } = pickFallbackVideoMime();
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 3_200_000,
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () =>
      reject(new Error('Browser video recorder encountered an encoding error.'));
  });

  const totalFrames = Math.max(1, Math.round(totalDuration * FPS));
  let renderedFrames = 0;

  recorder.start(250);

  try {
    const frameIntervalMs = 1000 / FPS;
    const recordStartMs = performance.now();

    for (const sceneMeta of selectedScenes) {
      const sceneDur = sceneMeta.end - sceneMeta.start;
      const sceneFrames = Math.round(sceneDur * FPS);

      for (let i = 0; i < sceneFrames; i++) {
        if (signal.aborted) {
          recorder.stop();
          return null;
        }

        const t = Math.min(sceneMeta.end, sceneMeta.start + i / FPS);
        setStageTime(t);
        await waitReactPaint();

        await renderFrameToCanvas(
          ctx,
          WIDTH,
          HEIGHT,
          t,
          nightBgImg,
          morningBgImg,
          getStageSvg,
          serializer,
          includeCaptions
        );

        renderedFrames++;
        onProgress(Math.min(99, Math.round((renderedFrames / totalFrames) * 100)));

        const targetMs = recordStartMs + renderedFrames * frameIntervalMs;
        const remainingMs = targetMs - performance.now();
        if (remainingMs > 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
        }
      }
    }
  } finally {
    if (recorder.state !== 'inactive') {
      recorder.stop();
    }
  }

  const videoBlob = await stopped;
  for (const track of stream.getTracks()) {
    track.stop();
  }
  if (audioCtx) {
    void audioCtx.close();
  }

  if (signal.aborted) return null;
  if (videoBlob.size === 0) {
    throw new Error('Recorded video file was empty.');
  }

  onProgress(100);
  const filename = `${fileSlug}.${ext}`;
  const blobUrl = URL.createObjectURL(videoBlob);
  if (autoDownload) {
    triggerFileDownload(blobUrl, filename);
  }

  return {
    blob: videoBlob,
    blobUrl,
    filename,
    sizeBytes: videoBlob.size,
    durationSec: totalDuration,
    mimeType,
    width: WIDTH,
    height: HEIGHT,
  };
}
