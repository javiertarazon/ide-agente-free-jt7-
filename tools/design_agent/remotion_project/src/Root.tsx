import React from 'react';
import { Composition } from 'remotion';
import generatedProps from './generated-props.json';
import { calculateVideoMetadata, DEFAULT_PROPS, FreeJT7DesignVideo, type VideoProps } from './FreeJT7DesignVideo';

export const RemotionRoot: React.FC = () => {
  const props = {
    ...DEFAULT_PROPS,
    ...generatedProps,
  } as VideoProps;

  return (
    <Composition
      id="FreeJT7DesignVideo"
      component={FreeJT7DesignVideo}
      defaultProps={props}
      durationInFrames={props.durationInFrames}
      fps={props.fps}
      width={props.width}
      height={props.height}
      calculateMetadata={({ props: incomingProps }) => calculateVideoMetadata(incomingProps as Partial<VideoProps>)}
    />
  );
};
