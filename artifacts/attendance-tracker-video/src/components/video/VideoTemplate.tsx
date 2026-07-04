import { useEffect, useRef } from 'react';
import { useVideoPlayer } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';

import { Scene0Intro } from './video_scenes/Scene0Intro';
import { Scene1Problem } from './video_scenes/Scene1Problem';
import { Scene2Home } from './video_scenes/Scene2Home';
import { Scene3Subjects } from './video_scenes/Scene3Subjects';
import { Scene4Ward } from './video_scenes/Scene4Ward';
import { Scene5Offline } from './video_scenes/Scene5Offline';
import { Scene6Outro } from './video_scenes/Scene6Outro';

export const SCENE_DURATIONS: Record<string, number> = {
  intro: 4000,
  problem: 5000,
  home: 5500,
  subjects: 5000,
  ward: 5000,
  offline: 4500,
  outro: 4000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  intro: Scene0Intro,
  problem: Scene1Problem,
  home: Scene2Home,
  subjects: Scene3Subjects,
  ward: Scene4Ward,
  offline: Scene5Offline,
  outro: Scene6Outro,
};

// Scene start offsets in seconds (for audio seek)
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

// Custom scene transition variants
const sceneVariants = {
  initial: { opacity: 0, scale: 0.95, filter: 'blur(10px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 1.05, filter: 'blur(10px)' },
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentScene, currentSceneKey } = useVideoPlayer({ durations, loop });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Notify parent of scene changes
  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  // Seek audio to match the current scene
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);

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

  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  return (
    <>
      <div
        className="w-full h-screen overflow-hidden relative"
        style={{ backgroundColor: 'var(--bg-main)' }}
      >
        {/* Persistent Background */}
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/bg-glass.jpg`}
            alt="background"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-blue-50/20 backdrop-blur-[2px]" />
        </div>

        {/* Persistent Abstract Shapes for cross-scene continuity */}
        <motion.div
          className="absolute w-[40vw] h-[40vw] rounded-full blur-[100px] z-0 pointer-events-none mix-blend-multiply"
          animate={{
            x: sceneIndex === 0 ? '-10vw' : sceneIndex === 2 ? '50vw' : sceneIndex === 4 ? '20vw' : '80vw',
            y: sceneIndex === 1 ? '10vh' : sceneIndex === 3 ? '60vh' : '-20vh',
            backgroundColor: sceneIndex === 1 ? '#ef4444' : sceneIndex === 4 ? '#a855f7' : '#3b82f6',
            opacity: 0.15,
          }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute w-[30vw] h-[30vw] rounded-full blur-[80px] z-0 pointer-events-none mix-blend-multiply"
          animate={{
            x: sceneIndex === 0 ? '60vw' : sceneIndex === 1 ? '20vw' : sceneIndex === 5 ? '-10vw' : '10vw',
            y: sceneIndex === 0 ? '50vh' : sceneIndex === 2 ? '-10vh' : sceneIndex === 4 ? '70vh' : '40vh',
            backgroundColor: sceneIndex === 3 ? '#10b981' : sceneIndex === 5 ? '#f59e0b' : '#3b82f6',
            opacity: 0.1,
          }}
          transition={{ duration: 2.5, ease: 'easeInOut' }}
        />

        <AnimatePresence mode="sync">
          {SceneComponent && (
            <motion.div
              key={currentSceneKey}
              className="absolute inset-0 z-10"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.8 }}
            >
              <SceneComponent />
            </motion.div>
          )}
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
