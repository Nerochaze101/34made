export type ReelSceneId = 'scene1' | 'scene2' | 'scene3';

export interface ReelBeatMarker {
  id: ReelSceneId;
  time: number;
  label: string;
  shortLabel: string;
  summary: string;
}

export const REEL_DURATION = 35.0;

export const REEL_BEATS: ReelBeatMarker[] = [
  {
    id: 'scene1',
    time: 0.0,
    label: 'Scene 1 · The Confident Promise (00:00–00:09)',
    shortLabel: '00s Promise',
    summary: 'Smug late-night gamer confidence; quick whip-pan to Biscuit’s skeptical side-eye.',
  },
  {
    id: 'scene2',
    time: 9.0,
    label: 'Scene 2 · The Losing Streak Spiral (00:09–00:21)',
    shortLabel: '09s Spiral',
    summary: 'Speed lines, red/blue flashes, flying sweat drops, and frantic multi-limb panic.',
  },
  {
    id: 'scene3',
    time: 21.0,
    label: 'Scene 3 · Morning Reality Check (00:21–00:35)',
    shortLabel: '21s Morning',
    summary: 'Zainab walks into doorway deadpan, frozen Tunde stammer, and Biscuit’s final dry bark.',
  },
];

export interface ReelFrameState {
  t: number;
  sceneId: ReelSceneId;
  isMorning: boolean;
  camera: {
    x: number;
    y: number;
    zoom: number;
    rotateZ: number;
  };
  tunde: {
    visible: boolean;
    pose: 'smug' | 'panic';
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    targetHeight: number;
    torsoRot: number;
    headRot: number;
    hairLagRot: number;
    armRRot: number;
    armROffsetX: number;
    armROffsetY: number;
    blink: number;
    isSpeaking: boolean;
    mouthOpen: number;
    mouthWide: number;
    jawShift: number;
    pupilOffsetX: number;
    pupilOffsetY: number;
    eyeBags: number;
    sparklesOpacity: number;
    flyingSweatPhase: number;
    frozenSweatOpacity: number;
  };
  zainab: {
    visible: boolean;
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    targetHeight: number;
    torsoRot: number;
    headRot: number;
    hairLagRot: number;
    armRRot: number;
    armROffsetY: number;
    blink: number;
    isSpeaking: boolean;
    mouthOpen: number;
    mouthWide: number;
    jawShift: number;
    pupilOffsetX: number;
    pupilOffsetY: number;
    steamPhase: number;
  };
  biscuit: {
    visible: boolean;
    pose: 'sideEye' | 'sleep' | 'bark';
    x: number;
    y: number;
    rot: number;
    targetHeight: number;
    headRot: number;
    tailRot: number;
    scaleX: number;
    scaleY: number;
    barkMouthOpen: number;
    zzzOpacity: number;
    barkPop: number;
  };
  vfx: {
    phoneGlowOpacity: number;
    flashRedOpacity: number;
    flashBlueOpacity: number;
    speedLinesOpacity: number;
    speedLinesRot: number;
    morningSunOpacity: number;
    whipBlurPx: number;
    isFreezeFrame: boolean;
  };
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rangeT(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp((t - start) / (end - start), 0, 1);
}

function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  xTarget: number
): number {
  const x = clamp(xTarget, 0, 1);
  if (x === 0 || x === 1) return x;
  let u = x;
  for (let i = 0; i < 6; i++) {
    const om = 1 - u;
    const bx = 3 * om * om * u * x1 + 3 * om * u * u * x2 + u * u * u;
    const dbx = 3 * om * om * x1 + 6 * om * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(dbx) < 1e-6) break;
    u = clamp(u - (bx - x) / dbx, 0, 1);
  }
  const om = 1 - u;
  return 3 * om * om * u * y1 + 3 * om * u * u * y2 + u * u * u;
}

const easeCinema = (p: number) => cubicBezier(0.42, 0.0, 0.22, 1.0, p);
const easeOut = (p: number) => cubicBezier(0.16, 1.0, 0.3, 1.0, p);
const easeSnap = (p: number) => cubicBezier(0.85, 0.0, 0.15, 1.0, p);

function evalBlink(t: number, period: number, offset: number): number {
  const phase = (t + offset) % period;
  if (phase > 0.22) return 0;
  if (phase < 0.09) return phase / 0.09;
  return 1 - (phase - 0.09) / 0.13;
}

interface VisemePhrase {
  start: number;
  end: number;
  hz: number;
  stammer?: boolean;
}

const TUNDE_SCENE1_PHRASES: VisemePhrase[] = [
  { start: 0.9, end: 2.4, hz: 5.0 },
  { start: 2.5, end: 4.6, hz: 5.4 },
  { start: 4.7, end: 6.4, hz: 5.1 },
];

const TUNDE_SCENE2_PHRASES: VisemePhrase[] = [
  { start: 9.8, end: 12.3, hz: 6.4 },
  { start: 12.4, end: 15.2, hz: 6.9 },
  { start: 15.8, end: 18.2, hz: 7.0 },
  { start: 18.3, end: 20.6, hz: 7.2 },
];

const ZAINAB_SCENE3_PHRASES: VisemePhrase[] = [
  { start: 22.8, end: 24.5, hz: 3.8 },
  { start: 24.7, end: 28.0, hz: 4.2 },
];

const TUNDE_SCENE3_PHRASES: VisemePhrase[] = [
  { start: 29.0, end: 29.9, hz: 4.6, stammer: true },
  { start: 30.0, end: 32.4, hz: 5.6, stammer: true },
];

function evalVisemes(
  t: number,
  phrases: VisemePhrase[],
  seed: number
): { open: number; wide: number; jaw: number; speaking: boolean } {
  for (const ph of phrases) {
    if (t >= ph.start && t <= ph.end) {
      const lt = t - ph.start;
      const dur = ph.end - ph.start;
      const env = Math.min(1, lt / 0.09) * Math.min(1, (dur - lt) / 0.11);
      const omega = ph.hz * Math.PI * 2;
      const s1 = Math.max(0, Math.sin(lt * omega + seed));
      const s2 = Math.max(0, Math.sin(lt * (omega * 0.57) + 0.9));
      const trem = ph.stammer ? 0.78 + 0.22 * Math.sin(lt * 26) : 1;
      const open = clamp(
        env * (0.38 + 0.62 * (0.68 * s1 + 0.32 * s2)) * trem,
        0.08,
        0.96
      );
      const wide = clamp(0.45 + 0.45 * Math.cos(lt * omega * 0.7), 0.2, 0.95);
      return { open, wide, jaw: open * 0.88, speaking: true };
    }
  }
  return { open: 0, wide: 0.5, jaw: 0, speaking: false };
}

export function evaluateReel(rawTime: number): ReelFrameState {
  const t = clamp(rawTime, 0, REEL_DURATION);

  let sceneId: ReelSceneId = 'scene1';
  if (t >= 21.0) sceneId = 'scene3';
  else if (t >= 9.0) sceneId = 'scene2';

  const isMorning = t >= 21.0;

  // Camera choreography
  let camX = 0;
  let camY = 95;
  let camZoom = 1.24;
  let camRot = 0;
  let whipBlurPx = 0;

  if (sceneId === 'scene1') {
    if (t < 6.6) {
      const p = easeOut(rangeT(t, 0.0, 6.6));
      camX = lerp(0, 6, p);
      camY = lerp(115, 76, p);
      camZoom = lerp(1.16, 1.38, p);
      camRot = lerp(0, -0.5, p);
    } else if (t < 7.3) {
      const p = easeSnap(rangeT(t, 6.6, 7.3));
      camX = lerp(6, -112, p);
      camY = lerp(76, 8, p);
      camZoom = lerp(1.38, 1.82, p);
      camRot = lerp(-0.5, 2.2, Math.sin(p * Math.PI));
      whipBlurPx = Math.sin(p * Math.PI) * 5.5;
    } else {
      const p = easeCinema(rangeT(t, 7.3, 9.0));
      camX = -112;
      camY = lerp(8, 2, p);
      camZoom = lerp(1.82, 1.94, p);
      camRot = lerp(0.5, -0.4, p);
    }
  } else if (sceneId === 'scene2') {
    const zoomP = easeCinema(rangeT(t, 9.0, 20.5));
    camX = 0;
    camY = lerp(78, 52, zoomP);
    camZoom = lerp(1.36, 1.66, zoomP);

    const shakeAmp = t < 15.5 ? 2.6 : 3.8;
    camRot =
      Math.sin(t * 21.0) * shakeAmp * 0.65 +
      Math.cos(t * 34.0) * shakeAmp * 0.35;
    camX += Math.sin(t * 31.0) * (t < 15.5 ? 3.5 : 5.5);
    camY += Math.cos(t * 27.0) * (t < 15.5 ? 2.6 : 4.4);
  } else {
    if (t < 28.2) {
      const p = easeOut(rangeT(t, 21.0, 28.0));
      camX = lerp(-28, -16, p);
      camY = lerp(-4, -14, p);
      camZoom = lerp(1.16, 1.28, p);
      camRot = 0;
    } else if (t < 32.5) {
      const snap = easeSnap(rangeT(t, 28.2, 28.6));
      camX = lerp(-16, 0, snap);
      camY = lerp(-14, 62, snap);
      camZoom = lerp(1.28, 1.54, snap);
      camRot = lerp(0, -1.4, snap);
    } else {
      const pull = easeOut(rangeT(t, 32.5, 33.35));
      camX = lerp(0, 34, pull);
      camY = lerp(62, 52, pull);
      camZoom = lerp(1.54, 1.18, pull);
      camRot = lerp(-1.4, 0, pull);
    }
  }

  // Visemes
  const tundeV1 = evalVisemes(t, TUNDE_SCENE1_PHRASES, 0.4);
  const tundeV2 = evalVisemes(t, TUNDE_SCENE2_PHRASES, 1.1);
  const tundeV3 = evalVisemes(t, TUNDE_SCENE3_PHRASES, 2.3);
  const zainabV = evalVisemes(t, ZAINAB_SCENE3_PHRASES, 0.8);

  const isFreezeFrame = t >= 34.1;
  const activeTundeViseme =
    sceneId === 'scene1' ? tundeV1 : sceneId === 'scene2' ? tundeV2 : tundeV3;

  // TUNDE MULTI-LIMB MOTION
  const tundeVisible = sceneId !== 'scene3' || t >= 28.2;
  const tundePose: 'smug' | 'panic' = sceneId === 'scene1' ? 'smug' : 'panic';

  let tundeX = 0;
  let tundeY = 398;
  let tundeScaleX = 1;
  let tundeScaleY = 1;
  let tundeTorsoRot = 0;
  let tundeHeadRot = 0;
  let tundeHairLag = 0;
  let tundeArmRot = 0;
  let tundeArmOffsetX = 0;
  let tundeArmOffsetY = 0;
  let tundePupilX = 0;
  let tundePupilY = 0;

  if (sceneId === 'scene1') {
    const groove = Math.sin(t * 3.1);
    const sway = Math.cos(t * 2.1);
    tundeY = 398 + Math.abs(Math.sin(t * 3.1)) * -6;
    tundeTorsoRot = sway * 3.8 + (tundeV1.speaking ? Math.sin(t * 5.2) * 1.6 : 0);
    tundeHeadRot = groove * 3.2 + (tundeV1.speaking ? Math.sin(t * 7.5) * 2.1 : -1.5);
    tundeHairLag = -tundeHeadRot * 0.9;
    tundeArmRot = Math.sin(t * 4.2) * 5.5;
    tundeArmOffsetY = -Math.abs(Math.cos(t * 3.1)) * 7;
    tundePupilX = Math.sin(t * 1.4) * 0.65;
    tundePupilY = Math.cos(t * 1.8) * 0.25;
  } else if (sceneId === 'scene2') {
    const panicSpd = t > 15.5 ? 24.0 : 17.0;
    const tapBurst = Math.sin(t * 42.0);
    tundeX = Math.sin(t * 32.0) * 3.5;
    tundeY = 398 + Math.sin(t * panicSpd) * 5;
    tundeScaleY = 1 + Math.sin(t * panicSpd) * 0.025;
    tundeScaleX = 1 - Math.sin(t * panicSpd) * 0.018;
    tundeTorsoRot = Math.sin(t * 14.0) * 6.5;
    tundeHeadRot = Math.cos(t * 19.0) * 4.8;
    tundeHairLag = -Math.sin(t * 24.0) * 9.5;
    tundeArmRot = Math.sin(t * 35.0) * 9.5;
    tundeArmOffsetX = tapBurst * 4.2;
    tundeArmOffsetY = -Math.abs(Math.cos(t * 38.0)) * 12;
    tundePupilX = Math.sin(t * 13.0) * 1.1;
    tundePupilY = Math.cos(t * 16.0) * 0.55;
  } else {
    // Scene 3: Snap jump in horror at 28.2s -> frozen mid-tap statue shivering nervously
    const shockP = rangeT(t, 28.2, 28.65);
    const jumpArc = shockP < 1 ? -Math.sin(shockP * Math.PI) * 28 : 0;
    const landSquash = shockP >= 0.7 && shockP < 1 ? 0.05 * Math.sin(((shockP - 0.7) / 0.3) * Math.PI) : 0;
    const shiver = isFreezeFrame ? 0 : Math.sin(t * 46.0) * 1.6;
    tundeX = shiver;
    tundeY = 398 + jumpArc;
    tundeScaleY = 1 - landSquash;
    tundeScaleX = 1 + landSquash;
    tundeTorsoRot = shockP < 0.8 ? -6 * (1 - shockP) : 0;
    tundeHeadRot = tundeV3.speaking && !isFreezeFrame ? Math.sin(t * 22.0) * 1.6 : 0;
    tundeHairLag = shockP < 0.9 ? 8 * Math.sin(shockP * Math.PI) : 0;
    tundeArmRot = isFreezeFrame ? 0 : -1.5;
    tundeArmOffsetY = -8; // frozen mid-tap raised hands
    tundePupilX = isFreezeFrame ? -0.7 : lerp(-0.9, 0.2, rangeT(t, 28.5, 32.0));
    tundePupilY = -0.25;
  }

  // ZAINAB WALK-IN & GESTURE ANIMATION (Scene 3)
  const zainabVisible = sceneId === 'scene3' && t < 28.2;
  const walkP = easeOut(rangeT(t, 21.0, 22.55));
  const walkSteps = rangeT(t, 21.0, 22.55) * Math.PI * 3;
  const zainabWalkBob = t < 22.55 ? -Math.abs(Math.sin(walkSteps)) * 12 : 0;
  const zainabX = lerp(-145, -18, walkP);
  const zainabY = 365 + zainabWalkBob;
  const zainabTorsoRot =
    t < 22.55
      ? Math.sin(walkSteps) * 2.6
      : Math.sin(t * 1.5) * 0.7 + (zainabV.speaking ? -1.1 : 0);
  const zainabHeadRot =
    t < 22.55
      ? -Math.sin(walkSteps) * 1.4
      : (zainabV.speaking ? Math.sin(t * 2.4) * 1.8 - 2.5 : -2.0);
  const zainabArmRot =
    t < 22.55
      ? 9 * (1 - walkP)
      : zainabV.speaking
        ? -4 + Math.sin(t * 2.6) * 3.5
        : -2;

  // BISCUIT ANIMATIONS (Side-eye tail wag -> upside-down belly sleep -> hop upright + dry bark)
  const biscuitVisible =
    sceneId === 'scene1' ||
    sceneId === 'scene2' ||
    (sceneId === 'scene3' && t >= 28.2);

  const biscuitPose: 'sideEye' | 'sleep' | 'bark' =
    sceneId === 'scene1'
      ? 'sideEye'
      : sceneId === 'scene2'
        ? 'sleep'
        : 'bark';

  const biscuitX = sceneId === 'scene1' ? -118 : sceneId === 'scene2' ? 105 : 108;
  let biscuitY = sceneId === 'scene1' ? 88 : sceneId === 'scene2' ? 92 : 95;
  let biscuitRot = 0;
  let biscuitScaleX = 1;
  let biscuitScaleY = 1;
  let biscuitHeadRot = 0;
  let biscuitTailRot = 0;
  let barkMouthOpen = 0;

  if (sceneId === 'scene1') {
    const tiltP = easeCinema(rangeT(t, 3.6, 7.6));
    biscuitHeadRot = lerp(0, -18, tiltP) + Math.sin(t * 2.8) * 1.4;
    biscuitTailRot = Math.sin(t * 4.8) * 11;
    biscuitScaleY = 1 + Math.sin(t * 2.4) * 0.015;
  } else if (sceneId === 'scene2') {
    const sleepBreath = Math.sin(t * 2.3);
    biscuitScaleY = 1 + sleepBreath * 0.055;
    biscuitScaleX = 1 - sleepBreath * 0.025;
    biscuitRot = Math.sin(t * 1.5) * 2.2;
  } else {
    // Hop upright at 32.5..33.1, tail wag, crisp jaw snap on "Arf." at 33.0..33.6
    const hopP = rangeT(t, 32.5, 33.05);
    const hopArc = hopP > 0 && hopP < 1 ? -Math.sin(hopP * Math.PI) * 30 : 0;
    const landSquash =
      hopP >= 0.85 && hopP < 1 ? 0.08 * Math.sin(((hopP - 0.85) / 0.15) * Math.PI) : 0;
    biscuitY = 95 + hopArc;
    biscuitScaleY = 1 - landSquash;
    biscuitScaleX = 1 + landSquash;

    const barkCurve =
      t >= 33.0 && t <= 33.65 ? Math.sin(rangeT(t, 33.0, 33.65) * Math.PI) : 0;
    biscuitHeadRot = -11 * barkCurve - 4;
    biscuitTailRot = isFreezeFrame ? 6 : Math.sin(t * 14.0) * 16;
    barkMouthOpen = barkCurve;
  }

  const barkPop =
    sceneId === 'scene3' && t >= 33.0 && t <= 34.4
      ? easeOut(rangeT(t, 33.0, 33.25)) * (1 - rangeT(t, 34.0, 34.4) * 0.2)
      : sceneId === 'scene3' && t > 34.4
        ? 0.8
        : 0;

  // Screen flashes & speed lines
  const speedLinesOpacity =
    sceneId === 'scene2'
      ? 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 14.0))
      : 0;
  const flashWave = sceneId === 'scene2' ? Math.sin(t * 11.5) : 0;
  const flashRedOpacity =
    sceneId === 'scene2' && flashWave > 0.2 ? (flashWave - 0.2) * 0.36 : 0;
  const flashBlueOpacity =
    sceneId === 'scene2' && flashWave < -0.2 ? (-flashWave - 0.2) * 0.36 : 0;

  return {
    t,
    sceneId,
    isMorning,
    camera: {
      x: camX,
      y: camY,
      zoom: camZoom,
      rotateZ: camRot,
    },
    tunde: {
      visible: tundeVisible,
      pose: tundePose,
      x: tundeX,
      y: tundeY,
      scaleX: tundeScaleX,
      scaleY: tundeScaleY,
      targetHeight: 490,
      torsoRot: tundeTorsoRot,
      headRot: tundeHeadRot,
      hairLagRot: tundeHairLag,
      armRRot: tundeArmRot,
      armROffsetX: tundeArmOffsetX,
      armROffsetY: tundeArmOffsetY,
      blink: sceneId === 'scene1' ? evalBlink(t, 3.8, 0.5) : 0,
      isSpeaking: activeTundeViseme.speaking && !isFreezeFrame,
      mouthOpen: isFreezeFrame ? 0.24 : activeTundeViseme.open,
      mouthWide: activeTundeViseme.wide,
      jawShift: activeTundeViseme.jaw,
      pupilOffsetX: tundePupilX,
      pupilOffsetY: tundePupilY,
      eyeBags:
        sceneId === 'scene3'
          ? 1.0
          : sceneId === 'scene2'
            ? clamp(rangeT(t, 14.0, 20.5)) * 0.55
            : 0,
      sparklesOpacity:
        sceneId === 'scene1' && t < 6.8 ? 0.65 + 0.35 * Math.sin(t * 6.0) : 0,
      flyingSweatPhase: sceneId === 'scene2' ? t : 0,
      frozenSweatOpacity: sceneId === 'scene3' ? 0.95 : 0,
    },
    zainab: {
      visible: zainabVisible,
      x: zainabX,
      y: zainabY,
      scaleX: 1,
      scaleY: 1,
      targetHeight: 520,
      torsoRot: zainabTorsoRot,
      headRot: zainabHeadRot,
      hairLagRot: -zainabTorsoRot * 0.8 - zainabHeadRot * 0.5,
      armRRot: zainabArmRot,
      armROffsetY: zainabV.speaking ? Math.sin(t * 2.5) * -4 : 0,
      blink: evalBlink(t, 4.6, 1.4),
      isSpeaking: zainabV.speaking,
      mouthOpen: zainabV.open,
      mouthWide: zainabV.wide,
      jawShift: zainabV.jaw,
      pupilOffsetX: 0.25,
      pupilOffsetY: 0.05,
      steamPhase: t,
    },
    biscuit: {
      visible: biscuitVisible,
      pose: biscuitPose,
      x: biscuitX,
      y: biscuitY,
      rot: biscuitRot,
      targetHeight:
        biscuitPose === 'sleep' ? 110 : biscuitPose === 'sideEye' ? 175 : 172,
      headRot: biscuitHeadRot,
      tailRot: biscuitTailRot,
      scaleX: biscuitScaleX,
      scaleY: biscuitScaleY,
      barkMouthOpen,
      zzzOpacity: sceneId === 'scene2' ? 0.85 : 0,
      barkPop,
    },
    vfx: {
      phoneGlowOpacity: sceneId === 'scene1' ? 0.7 + 0.2 * Math.sin(t * 3.1) : 0,
      flashRedOpacity,
      flashBlueOpacity,
      speedLinesOpacity,
      speedLinesRot: (t * 52) % 360,
      morningSunOpacity: isMorning ? 0.88 : 0,
      whipBlurPx,
      isFreezeFrame,
    },
  };
}
