import { useEffect, useRef, useState } from 'react';

export interface SceneDurations {
  [key: string]: number;
}

export interface UseVideoPlayerOptions {
  durations: SceneDurations;
  onVideoEnd?: () => void;
  loop?: boolean;
}

export interface UseVideoPlayerReturn {
  currentScene: number;
  totalScenes: number;
  currentSceneKey: string;
  hasEnded: boolean;
  nextScene: () => void;
}

export function useVideoPlayer(
  options: UseVideoPlayerOptions,
): UseVideoPlayerReturn {
  const { durations, onVideoEnd, loop = false } = options;

  const sceneKeys = useRef(Object.keys(durations)).current;
  const totalScenes = sceneKeys.length;

  const [currentScene, setCurrentScene] = useState(0);
  const [hasEnded, setHasEnded] = useState(false);

  const nextScene = () => {
    if (currentScene < totalScenes - 1) {
      setCurrentScene((prev) => prev + 1);
    } else {
      if (!hasEnded) {
        setHasEnded(true);
        onVideoEnd?.();
      }
      if (loop) {
        setCurrentScene(0);
      }
    }
  };

  useEffect(() => {
    // Only the final scene (Outro) auto-transitions after ~1.2s
    if (currentScene === totalScenes - 1 && !hasEnded) {
      const timer = setTimeout(() => {
        setHasEnded(true);
        onVideoEnd?.();
      }, 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [currentScene, totalScenes, hasEnded, onVideoEnd]);

  return {
    currentScene,
    totalScenes,
    currentSceneKey: sceneKeys[currentScene] || 'scene1',
    hasEnded,
    nextScene,
  };
}
