import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { charVariants, charContainerVariants } from '../../../lib/video/animations';

const logoImg = '/favicon.svg';

const GRID_SIZE = 6;

export function Scene1() {
  const [phase, setPhase] = useState<'scattered' | 'assembling' | 'assembled'>('scattered');

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('assembling'), 200),
      setTimeout(() => setPhase('assembled'), 1400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const fragments = Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
    const x = i % GRID_SIZE;
    const y = Math.floor(i / GRID_SIZE);
    
    // Calculate scatter positions
    const angle = Math.random() * Math.PI * 2;
    const distance = 300 + Math.random() * 500;
    const scatterX = Math.cos(angle) * distance;
    const scatterY = Math.sin(angle) * distance;
    const scatterRotate = (Math.random() - 0.5) * 720;
    const scatterScale = 0.2 + Math.random() * 2;

    return {
      id: i,
      bgPosX: `${(x / (GRID_SIZE - 1)) * 100}%`,
      bgPosY: `${(y / (GRID_SIZE - 1)) * 100}%`,
      scatterX,
      scatterY,
      scatterRotate,
      scatterScale,
    };
  });

  return (
    <motion.div 
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      <div className="relative w-40 h-40 md:w-48 md:h-48 mb-12">
        {/* Glow behind assembled logo */}
        <motion.div 
          className="absolute inset-0 rounded-[32px] bg-[var(--color-primary)]/30 blur-2xl"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ 
            opacity: phase === 'assembled' ? 0.6 : 0,
            scale: phase === 'assembled' ? [1, 1.2, 1] : 0.5
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="w-full h-full rounded-[32px] overflow-hidden border border-white/20 p-2 bg-slate-900/80 shadow-2xl backdrop-blur-md relative z-10 flex items-center justify-center">
          <div className="w-full h-full rounded-2xl overflow-hidden relative">
            {fragments.map((frag) => (
              <motion.div
                key={frag.id}
                className="absolute overflow-hidden"
                style={{
                  width: `${100 / GRID_SIZE}%`,
                  height: `${100 / GRID_SIZE}%`,
                  left: `${(frag.id % GRID_SIZE) * (100 / GRID_SIZE)}%`,
                  top: `${Math.floor(frag.id / GRID_SIZE) * (100 / GRID_SIZE)}%`,
                  backgroundImage: `url(${logoImg})`,
                  backgroundSize: `${GRID_SIZE * 100}% ${GRID_SIZE * 100}%`,
                  backgroundPosition: `${frag.bgPosX} ${frag.bgPosY}`,
                }}
                initial={{
                  x: frag.scatterX,
                  y: frag.scatterY,
                  rotateZ: frag.scatterRotate,
                  scale: frag.scatterScale,
                  opacity: 0,
                  filter: 'blur(10px)'
                }}
                animate={{
                  x: phase === 'scattered' ? frag.scatterX : 0,
                  y: phase === 'scattered' ? frag.scatterY : 0,
                  rotateZ: phase === 'scattered' ? frag.scatterRotate : 0,
                  scale: phase === 'scattered' ? frag.scatterScale : 1,
                  opacity: phase === 'scattered' ? 0 : 1,
                  filter: phase === 'scattered' ? 'blur(10px)' : 'blur(0px)'
                }}
                transition={{
                  duration: 1.2,
                  ease: [0.16, 1, 0.3, 1],
                  delay: phase === 'assembling' ? Math.random() * 0.2 : 0
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <motion.div
        variants={charContainerVariants}
        initial="hidden"
        animate={phase === 'assembled' ? "visible" : "hidden"}
        className="flex gap-2 text-3xl md:text-4xl font-display font-bold tracking-widest text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.8)] uppercase"
      >
        {"ATTENDENZ".split('').map((char, i) => (
          <motion.span key={i} variants={charVariants}>
            {char}
          </motion.span>
        ))}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: phase === 'assembled' ? 1 : 0, y: phase === 'assembled' ? 0 : 10 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="mt-2 text-xl md:text-2xl font-display font-medium tracking-[0.2em] text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]"
      >
        TRACKER
      </motion.div>
    </motion.div>
  );
}
