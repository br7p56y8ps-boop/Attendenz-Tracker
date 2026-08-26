import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Background } from './video_scenes/Background';
import { Scene4 } from './video_scenes/Scene4';

interface WelcomeVideoScreenProps {
  onBeginExit?: () => void;
  onComplete: () => void;
}

export default function WelcomeVideoScreen({ onBeginExit, onComplete }: WelcomeVideoScreenProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleTap = useCallback(() => {
    if (isExiting) return;
    onBeginExit?.();
    setIsExiting(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  }, [isExiting, onBeginExit, onComplete]);

  return (
    <motion.div
      onClick={handleTap}
      className="fixed inset-0 z-50 bg-neutral-900 text-white overflow-hidden cursor-pointer select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: isExiting ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
    >
      <Background scene={3} />
      <Scene4 />

      <audio
        src={`${import.meta.env.BASE_URL || '/'}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        onError={() => {}}
      />
    </motion.div>
  );
}
