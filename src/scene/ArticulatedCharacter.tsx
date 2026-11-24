import React from 'react';
import { ArticulatedPose, SpriteLayer } from '../utils/castChromaKey';

export type CharacterRoleStyle = 'tunde' | 'zainab' | 'biscuit';

export function ArticulatedLayer({
  layer,
  width,
  height,
  rot = 0,
  offsetX = 0,
  offsetY = 0,
  opacity = 1,
  children,
}: {
  layer: SpriteLayer;
  width: number;
  height: number;
  rot?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  children?: React.ReactNode;
}) {
  const px = -width / 2 + layer.pivotX * width;
  const py = -height + layer.pivotY * height;

  return (
    <g
      transform={`translate(${offsetX}, ${offsetY}) translate(${px}, ${py}) rotate(${rot}) translate(${-px}, ${-py})`}
      opacity={opacity}
    >
      <image
        href={layer.url}
        x={-width / 2}
        y={-height}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMax meet"
      />
      {children}
    </g>
  );
}

export function ArticulatedCharacter({
  pose,
  targetHeight,
  roleStyle,
  torsoRot = 0,
  headRot = 0,
  hairLagRot = 0,
  armLRot = 0,
  armRRot = 0,
  armROffsetX = 0,
  armROffsetY = 0,
  legLRot = 0,
  legRRot = 0,
  blink = 0,
  isSpeakingTurn = false,
  mouthOpen = 0,
  mouthWide = 0.5,
  jawShift = 0,
  pupilOffsetX = 0,
  pupilOffsetY = 0,
  eyeBags = 0,
  opacity = 1,
}: {
  pose: ArticulatedPose;
  targetHeight: number;
  roleStyle: CharacterRoleStyle;
  torsoRot?: number;
  headRot?: number;
  hairLagRot?: number;
  armLRot?: number;
  armRRot?: number;
  armROffsetX?: number;
  armROffsetY?: number;
  legLRot?: number;
  legRRot?: number;
  blink?: number;
  isSpeakingTurn?: boolean;
  mouthOpen?: number;
  mouthWide?: number;
  jawShift?: number;
  pupilOffsetX?: number;
  pupilOffsetY?: number;
  eyeBags?: number;
  opacity?: number;
}) {
  const h = targetHeight;
  const w = h * pose.aspectRatio;
  const anchorShiftX = (0.5 - (pose.anchorX ?? 0.5)) * w;
  const skin = pose.skinColor ?? '#9A6446';
  const mouthPatchId = `mouthPatch-${roleStyle}-${pose.wideEyeMode ? 'panic' : 'base'}`;

  const renderReactiveEye = (
    feat: { x: number; y: number; r: number } | undefined,
    key: string
  ) => {
    if (!feat) return null;
    const cx = -w / 2 + feat.x * w;
    const cy = -h + feat.y * h;
    const r = feat.r * h;

    if (pose.wideEyeMode) {
      const px = cx + pupilOffsetX * Math.max(0.8, r * 0.36);
      const py = cy + pupilOffsetY * Math.max(0.6, r * 0.28);
      return (
        <g key={key} data-layer="panic-pupils">
          <ellipse
            cx={cx}
            cy={cy}
            rx={r * 1.05}
            ry={r * 0.96}
            fill="#F9FAFB"
            stroke="#111827"
            strokeWidth={Math.max(1.2, r * 0.14)}
          />
          <circle cx={px} cy={py} r={r * 0.38} fill={pose.irisColor ?? '#111827'} />
          <circle
            cx={px - r * 0.12}
            cy={py - r * 0.12}
            r={Math.max(0.7, r * 0.14)}
            fill="#FFFFFF"
          />
        </g>
      );
    }

    if (blink >= 0.25) {
      return (
        <g key={key} opacity={Math.min(1, blink * 1.2)}>
          <ellipse cx={cx} cy={cy} rx={r * 1.15} ry={r * 0.85} fill={skin} />
          <path
            d={`M${cx - r * 1.05} ${cy + r * 0.12} Q${cx} ${cy + r * 0.48} ${cx + r * 1.05} ${cy + r * 0.12}`}
            fill="none"
            stroke="#1A1412"
            strokeWidth={Math.max(1.5, r * 0.32)}
            strokeLinecap="round"
          />
        </g>
      );
    }

    const px = cx + pupilOffsetX * Math.max(0.65, r * 0.3);
    const py = cy + pupilOffsetY * Math.max(0.55, r * 0.26);

    return (
      <g key={key} data-layer="reactive-pupils">
        <ellipse cx={cx} cy={cy} rx={r * 0.72} ry={r * 0.64} fill="#FBF9F5" />
        <circle cx={px} cy={py} r={r * 0.5} fill={pose.irisColor ?? '#292524'} />
        <circle cx={px} cy={py} r={r * 0.26} fill="#111827" />
        <circle
          cx={px - r * 0.16}
          cy={py - r * 0.16}
          r={Math.max(0.6, r * 0.15)}
          fill="#FFFFFF"
        />
      </g>
    );
  };

  const renderEyeBags = () => {
    if (eyeBags <= 0.05) return null;
    const bagCenters =
      pose.eyeL && pose.eyeR
        ? [pose.eyeL, pose.eyeR]
        : [
            { x: 0.455, y: 0.322, r: 0.022 },
            { x: 0.566, y: 0.322, r: 0.022 },
          ];
    return (
      <g opacity={eyeBags * 0.85} data-layer="anime-eye-bags">
        {bagCenters.map((feat, idx) => {
          const cx = -w / 2 + feat.x * w;
          const cy = -h + feat.y * h + feat.r * h * 1.25;
          const rw = feat.r * h * 1.3;
          return (
            <g key={`bag-${idx}`}>
              <ellipse cx={cx} cy={cy} rx={rw} ry={rw * 0.42} fill="#2A1C33" opacity="0.48" />
              <path
                d={`M${cx - rw * 0.92} ${cy - 0.5} Q${cx} ${cy + rw * 0.52} ${cx + rw * 0.92} ${cy - 0.5}`}
                fill="none"
                stroke="#1F1228"
                strokeWidth={Math.max(1.4, rw * 0.15)}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </g>
    );
  };

  const renderMouth = () => {
    if (!pose.mouth || !isSpeakingTurn) return null;
    const mx = -w / 2 + pose.mouth.x * w;
    const my = -h + pose.mouth.y * h;
    const mr = pose.mouth.r * h;

    const patch = (
      <defs>
        <radialGradient id={mouthPatchId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={skin} stopOpacity="1" />
          <stop offset="72%" stopColor={skin} stopOpacity="0.98" />
          <stop offset="100%" stopColor={skin} stopOpacity="0" />
        </radialGradient>
      </defs>
    );

    // Wide feathered skin patch completely covers underlying static mouth/teeth during speaking phrases
    const cover = (
      <ellipse
        cx={mx}
        cy={my + mr * 0.06}
        rx={mr * 2.5}
        ry={mr * 1.38}
        fill={`url(#${mouthPatchId})`}
      />
    );

    if (mouthOpen < 0.14) {
      const curve = roleStyle === 'zainab' ? 0.0 : 0.24;
      const halfW = mr * (0.85 + mouthWide * 0.35);
      return (
        <g data-layer="lip-sync">
          {patch}
          {cover}
          <path
            d={`M${mx - halfW} ${my} Q${mx} ${my + mr * curve} ${mx + halfW} ${my}`}
            fill="none"
            stroke="#1E1311"
            strokeWidth={Math.max(1.2, mr * 0.2)}
            strokeLinecap="round"
          />
        </g>
      );
    }

    const rx = mr * (0.68 + mouthWide * 0.58);
    const ry = mr * (0.2 + mouthOpen * 0.65);
    const cy = my + jawShift * mr * 0.24;
    const cavityFill = roleStyle === 'zainab' ? '#7E2A30' : '#661F25';

    return (
      <g data-layer="lip-sync">
        {patch}
        {cover}
        <ellipse
          cx={mx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill={cavityFill}
          stroke="#1E1311"
          strokeWidth={Math.max(1.1, mr * 0.16)}
        />
        {mouthOpen > 0.2 && (
          <path
            d={`M${mx - rx * 0.72} ${cy - ry * 0.58} Q${mx} ${cy - ry * 0.38} ${mx + rx * 0.72} ${cy - ry * 0.58} L${mx + rx * 0.62} ${cy - ry * 0.18} Q${mx} ${cy - ry * 0.1} ${mx - rx * 0.62} ${cy - ry * 0.18} Z`}
            fill="#FAF7F2"
            opacity="0.94"
          />
        )}
        {mouthOpen > 0.42 && (
          <ellipse
            cx={mx}
            cy={cy + ry * 0.48}
            rx={rx * 0.58}
            ry={ry * 0.36}
            fill="#D46A6A"
            opacity="0.9"
          />
        )}
        <path
          d={`M${mx - rx * 0.42} ${cy + ry + mr * 0.2} Q${mx} ${cy + ry + mr * 0.32} ${mx + rx * 0.42} ${cy + ry + mr * 0.2}`}
          fill="none"
          stroke="#3E251A"
          strokeWidth={Math.max(0.8, mr * 0.11)}
          strokeLinecap="round"
          opacity="0.52"
        />
      </g>
    );
  };

  const headBlock = pose.head ? (
    <ArticulatedLayer layer={pose.head} width={w} height={h} rot={headRot}>
      {pose.hairTop && (
        <g data-layer="secondary-hair">
          <ArticulatedLayer
            layer={pose.hairTop}
            width={w}
            height={h}
            rot={hairLagRot * 0.45}
          />
        </g>
      )}
      {renderReactiveEye(pose.eyeL, 'eyeL')}
      {renderReactiveEye(pose.eyeR, 'eyeR')}
      {renderEyeBags()}
      {renderMouth()}
    </ArticulatedLayer>
  ) : (
    <>
      {renderReactiveEye(pose.eyeL, 'eyeL')}
      {renderReactiveEye(pose.eyeR, 'eyeR')}
      {renderEyeBags()}
      {renderMouth()}
    </>
  );

  const upperBody = (
    <>
      {pose.armL && (
        <ArticulatedLayer layer={pose.armL} width={w} height={h} rot={armLRot} />
      )}
      {headBlock}
      {pose.armR && (
        <ArticulatedLayer
          layer={pose.armR}
          width={w}
          height={h}
          rot={armRRot}
          offsetX={armROffsetX}
          offsetY={armROffsetY}
        />
      )}
    </>
  );

  return (
    <g
      opacity={opacity}
      transform={anchorShiftX !== 0 ? `translate(${anchorShiftX}, 0)` : undefined}
    >
      {pose.legL && (
        <ArticulatedLayer layer={pose.legL} width={w} height={h} rot={legLRot} />
      )}
      {pose.legR && (
        <ArticulatedLayer layer={pose.legR} width={w} height={h} rot={legRRot} />
      )}

      <image
        href={pose.bodyUrl}
        x={-w / 2}
        y={-h}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMax meet"
      />

      {pose.torso ? (
        <ArticulatedLayer layer={pose.torso} width={w} height={h} rot={torsoRot}>
          {upperBody}
        </ArticulatedLayer>
      ) : (
        upperBody
      )}
    </g>
  );
}
