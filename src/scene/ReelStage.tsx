import React, { useState } from 'react';
import { useCastSprites } from '../utils/castChromaKey';
import { ArticulatedCharacter } from './ArticulatedCharacter';
import { ReelFrameState } from './reelTimeline';

interface ReelStageProps {
  frame: ReelFrameState;
  isPlaying: boolean;
  onTogglePlay: () => void;
  showSafeZones: boolean;
  showCaptions?: boolean;
  activeCaption?: { speaker: string; text: string } | null;
  showStartPrompt?: boolean;
  stageSvgRef?: React.RefObject<SVGSVGElement | null>;
}

export const NIGHT_BG_URL =
  '/src/assets/images/bedroom_night_bg_1795560269206.jpg';
export const MORNING_BG_URL =
  '/src/assets/images/bedroom_morning_bg_1795560269394.jpg';

const SPEED_RAY_ANGLES = Array.from({ length: 28 }, (_, i) => i * (360 / 28));

const MORNING_MOTES = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: -200 + ((i * 67) % 400),
  y: -360 + ((i * 89) % 700),
  vx: 3 + (i % 3) * 1.4,
  vy: -2.2 - (i % 4) * 0.9,
  r: i % 4 === 0 ? 2.4 : 1.1 + (i % 3) * 0.45,
}));

export const ReelStage: React.FC<ReelStageProps> = ({
  frame,
  onTogglePlay,
  showSafeZones,
  showCaptions = false,
  activeCaption = null,
  showStartPrompt = false,
  stageSvgRef,
}) => {
  const { isMorning, camera, tunde, zainab, biscuit, vfx, t } = frame;
  const [nightBgErr, setNightBgErr] = useState(false);
  const [morningBgErr, setMorningBgErr] = useState(false);
  const { sprites } = useCastSprites();

  const txPct = ((-camera.x / 450) * 100).toFixed(3);
  const tyPct = ((-camera.y / 800) * 100).toFixed(3);
  const camTransform = `scale(${camera.zoom.toFixed(4)}) rotateZ(${camera.rotateZ.toFixed(2)}deg) translate3d(${txPct}%, ${tyPct}%, 0px)`;

  const bgFailed = isMorning ? morningBgErr : nightBgErr;
  const bgSrc = isMorning ? MORNING_BG_URL : NIGHT_BG_URL;

  const activeTundePose = sprites
    ? tunde.pose === 'smug'
      ? sprites.tundeSmug
      : sprites.tundePanic
    : null;

  const activeBiscuitPose = sprites
    ? biscuit.pose === 'sideEye'
      ? sprites.biscuitSideEye
      : biscuit.pose === 'sleep'
        ? sprites.biscuitSleep
        : sprites.biscuitBark
    : null;

  return (
    <div
      onClick={onTogglePlay}
      role="button"
      tabIndex={0}
      aria-label="9:16 Vertical TikTok Reel stage. Click to play or pause."
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTogglePlay();
        }
      }}
      className="relative w-full max-w-[380px] aspect-[9/16] overflow-hidden rounded-2xl border border-white/15 bg-[#08090E] shadow-2xl cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]"
    >
      {/* Camera Transform Layer */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: camTransform,
          transformOrigin: '50% 50%',
          filter: vfx.whipBlurPx > 0.2 ? `blur(${vfx.whipBlurPx.toFixed(1)}px)` : undefined,
        }}
      >
        {/* LAYER 1: 9:16 Ground-Locked Bedroom Backdrop (1.24x Overscan Bleed) */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '-12%',
            top: '-12%',
            width: '124%',
            height: '124%',
          }}
        >
          {!bgFailed ? (
            <img
              src={bgSrc}
              alt={
                isMorning
                  ? 'Bright morning bedroom flooded with sunlight through open door'
                  : 'Dimly lit midnight bedroom with warm desk lamp'
              }
              referrerPolicy="no-referrer"
              onError={() =>
                isMorning ? setMorningBgErr(true) : setNightBgErr(true)
              }
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: isMorning
                  ? 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 55%, #D97706 100%)'
                  : 'linear-gradient(180deg, #0F172A 0%, #1E1B4B 60%, #111827 100%)',
              }}
            />
          )}
        </div>

        {/* LAYER 2: Animated Multi-Limb Cast, Screen Flashes, Speed Lines & Comic VFX */}
        <svg
          ref={stageSvgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="-225 -400 450 800"
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
        >
          <defs>
            <radialGradient id="phoneGlowGrad" cx="50%" cy="62%" r="45%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.46" />
              <stop offset="55%" stopColor="#0EA5E9" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="bedShadow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#09070B" stopOpacity="0.62" />
              <stop offset="68%" stopColor="#09070B" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#09070B" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="morningRayBeam" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FEF9C3" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#FDE047" stopOpacity="0.11" />
              <stop offset="100%" stopColor="#FDE047" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Dramatic Anime Speed Lines (Scene 2 Losing Streak Spiral) */}
          {vfx.speedLinesOpacity > 0.02 && (
            <g
              transform={`translate(0, 120) rotate(${vfx.speedLinesRot})`}
              opacity={vfx.speedLinesOpacity}
            >
              {SPEED_RAY_ANGLES.map((deg, idx) => {
                const rad = (deg * Math.PI) / 180;
                const rInner = 115 + (idx % 3) * 24;
                const rOuter = 540;
                const width = idx % 2 === 0 ? 5.5 : 2.5;
                const x1 = Math.cos(rad) * rInner;
                const y1 = Math.sin(rad) * rInner;
                const x2 = Math.cos(rad) * rOuter;
                const y2 = Math.sin(rad) * rOuter;
                return (
                  <line
                    key={deg}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={idx % 3 === 0 ? '#93C5FD' : '#FFFFFF'}
                    strokeWidth={width}
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          )}

          {/* BISCUIT (Tail wag, head tilt, belly sleep, hop + jaw-snap bark) */}
          {sprites && biscuit.visible && activeBiscuitPose && (
            <g
              transform={`translate(${biscuit.x}, ${biscuit.y}) rotate(${biscuit.rot}) scale(${biscuit.scaleX}, ${biscuit.scaleY})`}
            >
              <ellipse cx="0" cy="-2" rx="68" ry="14" fill="url(#bedShadow)" />
              <ArticulatedCharacter
                pose={activeBiscuitPose}
                targetHeight={biscuit.targetHeight}
                roleStyle="biscuit"
                headRot={biscuit.headRot}
                armLRot={biscuit.tailRot}
              />

              {/* Animated jaw snap line on Biscuit during "ARF." bark */}
              {biscuit.barkMouthOpen > 0.1 && (
                <ellipse
                  cx="-24"
                  cy={-biscuit.targetHeight * 0.57}
                  rx={6 + biscuit.barkMouthOpen * 4}
                  ry={4 + biscuit.barkMouthOpen * 6}
                  fill="#7F1D1D"
                  stroke="#111827"
                  strokeWidth="1.4"
                />
              )}

              {/* Sleeping "Zzz" floating in Scene 2 */}
              {biscuit.zzzOpacity > 0.05 && (
                <g opacity={biscuit.zzzOpacity}>
                  {[0, 1, 2].map((i) => {
                    const phase = (t * 0.7 + i * 0.33) % 1;
                    const zx = -15 + i * 16 + Math.sin(phase * Math.PI * 2) * 5;
                    const zy = -85 - phase * 42;
                    return (
                      <text
                        key={`z-${i}`}
                        x={zx}
                        y={zy}
                        fill="#E0F2FE"
                        fontSize={16 - i * 2}
                        fontWeight="800"
                        opacity={1 - phase * 0.75}
                      >
                        Z
                      </text>
                    );
                  })}
                </g>
              )}

              {/* Biscuit Dry "ARF." Comic Pop at Scene 3 Punchline (33s) */}
              {biscuit.barkPop > 0.05 && (
                <g
                  transform={`translate(-48, -148) scale(${0.8 + biscuit.barkPop * 0.25})`}
                  opacity={biscuit.barkPop}
                >
                  <polygon
                    points="-38,-14 -14,-22 0,-34 16,-20 40,-16 26,2 34,20 10,14 -8,28 -20,12 -42,14 -28,-2"
                    fill="#FEF08A"
                    stroke="#111827"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#111827"
                    fontSize="14"
                    fontWeight="900"
                  >
                    ARF.
                  </text>
                </g>
              )}
            </g>
          )}

          {/* ZAINAB (Walks into doorway, raises mug, deadpan blinks & speaks) */}
          {sprites && zainab.visible && (
            <g
              transform={`translate(${zainab.x}, ${zainab.y}) scale(${zainab.scaleX}, ${zainab.scaleY})`}
            >
              <ellipse cx="0" cy="-2" rx="95" ry="18" fill="url(#bedShadow)" />
              <ArticulatedCharacter
                pose={sprites.zainab}
                targetHeight={zainab.targetHeight}
                roleStyle="zainab"
                torsoRot={zainab.torsoRot}
                headRot={zainab.headRot}
                hairLagRot={zainab.hairLagRot}
                armRRot={zainab.armRRot}
                armROffsetY={zainab.armROffsetY}
                blink={zainab.blink}
                isSpeakingTurn={zainab.isSpeaking}
                mouthOpen={zainab.mouthOpen}
                mouthWide={zainab.mouthWide}
                jawShift={zainab.jawShift}
                pupilOffsetX={zainab.pupilOffsetX}
                pupilOffsetY={zainab.pupilOffsetY}
              />
              {/* Rising warm coffee mug steam wisps */}
              <g opacity="0.65">
                {[0, 1].map((w) => {
                  const p = (zainab.steamPhase * 0.55 + w * 0.5) % 1;
                  const sx = -58 + w * 14 + Math.sin(p * Math.PI * 2) * 5;
                  const sy = -226 - p * 36 + zainab.armROffsetY;
                  return (
                    <path
                      key={`steam-${w}`}
                      d={`M${sx} ${sy} q-4 -8 2 -16 q5 -8 -1 -14`}
                      fill="none"
                      stroke="#FFFBEB"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      opacity={(1 - p) * 0.8}
                    />
                  );
                })}
              </g>
            </g>
          )}

          {/* TUNDE (Multi-limb gamer rig: torso sway, phone-hand mash, hair bounce, darting eyes & jaw lip-sync) */}
          {sprites && tunde.visible && activeTundePose && (
            <g
              transform={`translate(${tunde.x}, ${tunde.y}) scale(${tunde.scaleX}, ${tunde.scaleY})`}
            >
              <ArticulatedCharacter
                pose={activeTundePose}
                targetHeight={tunde.targetHeight}
                roleStyle="tunde"
                torsoRot={tunde.torsoRot}
                headRot={tunde.headRot}
                hairLagRot={tunde.hairLagRot}
                armRRot={tunde.armRRot}
                armROffsetX={tunde.armROffsetX}
                armROffsetY={tunde.armROffsetY}
                blink={tunde.blink}
                isSpeakingTurn={tunde.isSpeaking}
                mouthOpen={tunde.mouthOpen}
                mouthWide={tunde.mouthWide}
                jawShift={tunde.jawShift}
                pupilOffsetX={tunde.pupilOffsetX}
                pupilOffsetY={tunde.pupilOffsetY}
                eyeBags={tunde.eyeBags}
              />

              {/* Scene 1: Smug Anime Eye Sparkles */}
              {tunde.sparklesOpacity > 0.05 && (
                <g opacity={tunde.sparklesOpacity}>
                  {[
                    { x: -64, y: -372, s: 12 },
                    { x: 74, y: -362, s: 14 },
                    { x: 52, y: -412, s: 8 },
                  ].map((sp, idx) => {
                    const pulse = 0.78 + 0.32 * Math.sin(t * 7 + idx * 1.6);
                    const s = sp.s * pulse;
                    return (
                      <path
                        key={`spark-${idx}`}
                        d={`M${sp.x} ${sp.y - s} Q${sp.x} ${sp.y} ${sp.x + s} ${sp.y} Q${sp.x} ${sp.y} ${sp.x} ${sp.y + s} Q${sp.x} ${sp.y} ${sp.x - s} ${sp.y} Q${sp.x} ${sp.y} ${sp.x} ${sp.y - s} Z`}
                        fill="#FEF08A"
                        stroke="#F59E0B"
                        strokeWidth="1"
                      />
                    );
                  })}
                </g>
              )}

              {/* Scene 2: Flying Anime Sweat Drops */}
              {tunde.flyingSweatPhase > 0 && (
                <g>
                  {[0, 1, 2].map((d) => {
                    const p = (tunde.flyingSweatPhase * 1.4 + d * 0.33) % 1;
                    const side = d % 2 === 0 ? -1 : 1;
                    const dx = side * (62 + p * 68);
                    const dy = -345 - p * 44 + p * p * 35;
                    return (
                      <path
                        key={`drop-${d}`}
                        d={`M${dx} ${dy - 10} C${dx + 6} ${dy - 1} ${dx + 6} ${dy + 6} ${dx} ${dy + 8} C${dx - 6} ${dy + 6} ${dx - 6} ${dy - 1} ${dx} ${dy - 10} Z`}
                        fill="#60A5FA"
                        stroke="#EFF6FF"
                        strokeWidth="1.4"
                        opacity={1 - p * 0.7}
                      />
                    );
                  })}
                </g>
              )}

              {/* Scene 3: Frozen Anime Sweat Drop Beaded on Temple */}
              {tunde.frozenSweatOpacity > 0.05 && (
                <path
                  d="M66 -356 C74 -340 74 -326 66 -324 C58 -326 58 -340 66 -356 Z"
                  fill="#60A5FA"
                  stroke="#EFF6FF"
                  strokeWidth="1.8"
                  opacity={tunde.frozenSweatOpacity}
                />
              )}
            </g>
          )}

          {/* Scene 1 Soft Glowing Phone Screen Wash */}
          {vfx.phoneGlowOpacity > 0.02 && (
            <rect
              x="-225"
              y="-400"
              width="450"
              height="800"
              fill="url(#phoneGlowGrad)"
              opacity={vfx.phoneGlowOpacity}
            />
          )}

          {/* Scene 2 Alternating Intense Red / Blue Screen Flashes */}
          {vfx.flashRedOpacity > 0.01 && (
            <rect
              x="-225"
              y="-400"
              width="450"
              height="800"
              fill="#EF4444"
              opacity={vfx.flashRedOpacity}
            />
          )}
          {vfx.flashBlueOpacity > 0.01 && (
            <rect
              x="-225"
              y="-400"
              width="450"
              height="800"
              fill="#3B82F6"
              opacity={vfx.flashBlueOpacity}
            />
          )}

          {/* Scene 3 Morning Sunlight Flooding the Room + Floating Sun Motes */}
          {vfx.morningSunOpacity > 0.02 && (
            <g opacity={vfx.morningSunOpacity}>
              <polygon
                points="-225,-400 -20,-400 225,240 20,400"
                fill="url(#morningRayBeam)"
              />
              <polygon
                points="-140,-400 80,-400 225,60 110,400"
                fill="url(#morningRayBeam)"
                opacity="0.65"
              />
              {MORNING_MOTES.map((m) => {
                const mx = ((m.x + t * m.vx + 225) % 450) - 225;
                const my = ((m.y + t * m.vy + 400) % 800) - 400;
                return (
                  <circle
                    key={m.id}
                    cx={mx}
                    cy={my}
                    r={m.r}
                    fill="#FEF9C3"
                    opacity="0.45"
                  />
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Optional TikTok Pop Dialogue Captions */}
      {showCaptions && activeCaption && (
        <div className="absolute bottom-[18%] inset-x-4 flex justify-center pointer-events-none">
          <div className="bg-black/80 backdrop-blur-xs border border-white/15 rounded-xl px-3.5 py-2 text-center shadow-xl max-w-[92%]">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#F2B705]">
              {activeCaption.speaker}
            </span>
            <p className="text-xs sm:text-sm font-semibold text-white leading-snug mt-0.5">
              {activeCaption.text}
            </p>
          </div>
        </div>
      )}

      {/* Clean Start-with-Sound Play Button at 00:00 so browser voice starts unlocked immediately */}
      {showStartPrompt && sprites && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none">
          <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-[#E11D48] text-white text-sm font-semibold shadow-2xl">
            <span>Tap to Play with Voice &amp; Sound</span>
          </div>
        </div>
      )}

      {/* Optional TikTok UI Safe-Zone Guides (Preview only) */}
      {showSafeZones && (
        <div
          aria-label="TikTok UI safe-zone guides"
          className="absolute inset-0 pointer-events-none"
        >
          <div className="absolute top-0 inset-x-0 h-[11%] border-b border-dashed border-white/25 flex items-end justify-center pb-1 text-[10px] font-mono text-white/60">
            Top Nav Safe Margin
          </div>
          <div className="absolute top-[44%] right-0 w-[17%] h-[32%] border-y border-l border-dashed border-white/25 flex items-center justify-center text-[10px] font-mono text-white/60">
            <span className="-rotate-90 whitespace-nowrap">Actions</span>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-[20%] border-t border-dashed border-white/25 flex items-start justify-start p-2 text-[10px] font-mono text-white/60">
            Caption &amp; Sound Safe Zone
          </div>
        </div>
      )}

      {/* Sprite Loading Overlay */}
      {!sprites && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#08090E]/75 backdrop-blur-xs pointer-events-none">
          <span className="text-xs font-medium text-slate-200">
            Preparing reel cast sprites...
          </span>
        </div>
      )}

      {/* Subtle Cinema Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 70px rgba(0, 0, 0, 0.36)',
        }}
      />
    </div>
  );
};
