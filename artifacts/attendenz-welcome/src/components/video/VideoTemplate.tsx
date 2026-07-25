import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence } from 'framer-motion';

import { Background } from './video_scenes/Background';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';

export const SCENE_DURATIONS: Record<string, number> = {
  scene1: 3500,
  scene2: 6000,
  scene3: 2000,
  scene4: 3000,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, ms] of Object.entries(SCENE_DURATIONS)) {
    out[key] = cumulativeMs / 1000;
    cumulativeMs += ms;
  }
  return out;
})();

const AUDIO_SEEK_EPSILON_SEC = 0.18;

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
  onVideoEnd,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
  onVideoEnd?: () => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop, onVideoEnd });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
    if (Math.abs(audio.currentTime - targetTime) > AUDIO_SEEK_EPSILON_SEC) {
      audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted]);

  // Map _r1/_r2 suffix keys back to base scene index for persistent layers
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);

  return (
    <>
      <div className="w-full h-screen overflow-hidden relative bg-black font-body text-white">
        <Background scene={sceneIndex} />

        <AnimatePresence mode="sync">
          {baseSceneKey === 'scene1' && <Scene1 key={currentSceneKey} />}
          {baseSceneKey === 'scene2' && <Scene2 key={currentSceneKey} />}
          {baseSceneKey === 'scene3' && <Scene3 key={currentSceneKey} />}
          {baseSceneKey === 'scene4' && <Scene4 key={currentSceneKey} />}
        </AnimatePresence>
      </div>
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </>
  );
}
