import type { FC } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export type SceneSpec = {
  headline: string;
  body: string;
  bullets: string[];
  background: string;
  accent?: string;
  durationInFrames: number;
  imagePath?: string | null;
};

export type VideoProps = {
  compositionId: string;
  title: string;
  subtitle: string;
  callToAction: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  audioPath?: string | null;
  outputName: string;
  scenes: SceneSpec[];
};

type SceneCardProps = {
  scene: SceneSpec;
  title: string;
  subtitle: string;
  callToAction: string;
};

export const DEFAULT_PROPS: VideoProps = {
  compositionId: 'FreeJT7DesignVideo',
  title: 'Free JT7',
  subtitle: 'Canva + Remotion + mcp-video',
  callToAction: 'Render listo',
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 360,
  audioPath: null,
  outputName: 'freejt7-demo',
  scenes: [],
};

export const calculateVideoMetadata = (props: Partial<VideoProps>) => {
  const merged = {
    ...DEFAULT_PROPS,
    ...props,
    scenes: props.scenes ?? DEFAULT_PROPS.scenes,
  } satisfies VideoProps;

  const durationInFrames = merged.scenes.length > 0
    ? merged.scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0)
    : merged.durationInFrames;

  return {
    width: merged.width,
    height: merged.height,
    fps: merged.fps,
    durationInFrames,
  };
};

const SceneCard: FC<SceneCardProps> = ({ scene, title, subtitle, callToAction }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ fps, frame, config: { damping: 18, stiffness: 120 } });
  const translateY = interpolate(entrance, [0, 1], [48, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const imageSrc = scene.imagePath ? staticFile(scene.imagePath) : null;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at top left, ${scene.accent ?? '#ffffff'}22, transparent 38%), ${scene.background}`,
        color: '#f7f4ea',
        padding: 72,
        fontFamily: 'Georgia, Cambria, "Times New Roman", serif',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: imageSrc ? '1.2fr 0.9fr' : '1fr',
          gap: 36,
          height: '100%',
          alignItems: 'stretch',
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 28,
            padding: 36,
            background: 'rgba(4, 6, 10, 0.34)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <div>
            <div style={{ textTransform: 'uppercase', letterSpacing: '0.24em', fontSize: 18, color: scene.accent ?? '#ffffff' }}>
              {title}
            </div>
            <h1 style={{ fontSize: 62, margin: '18px 0 14px', lineHeight: 1.02 }}>{scene.headline}</h1>
            <p style={{ fontSize: 25, lineHeight: 1.35, margin: 0, color: 'rgba(247,244,234,0.9)' }}>{scene.body}</p>
            {scene.bullets.length > 0 ? (
              <ul style={{ marginTop: 28, paddingLeft: 24, fontSize: 22, lineHeight: 1.45 }}>
                {scene.bullets.map((bullet: string) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 20, opacity: 0.82 }}>{subtitle}</div>
            <div style={{ fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.16em', color: scene.accent ?? '#ffffff' }}>
              {callToAction}
            </div>
          </div>
        </div>
        {imageSrc ? (
          <div
            style={{
              borderRadius: 28,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.06)',
            }}
          >
            <Img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export const FreeJT7DesignVideo: FC<VideoProps> = (props) => {
  let currentOffset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {props.audioPath ? <Audio src={staticFile(props.audioPath)} /> : null}
      {props.scenes.map((scene: SceneSpec) => {
        const from = currentOffset;
        currentOffset += scene.durationInFrames;
        return (
          <Sequence key={`${scene.headline}-${from}`} from={from} durationInFrames={scene.durationInFrames}>
            <SceneCard scene={scene} title={props.title} subtitle={props.subtitle} callToAction={props.callToAction} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
