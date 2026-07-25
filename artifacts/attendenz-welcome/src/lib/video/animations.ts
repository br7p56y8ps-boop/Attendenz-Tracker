import { Variants } from 'framer-motion';

export const charVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
  },
};

export const charContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.2,
    },
  },
};

export const containerVariants: Variants = charContainerVariants;
export const itemVariants: Variants = charVariants;

export const springs = {
  soft: { type: 'spring' as const, stiffness: 100, damping: 15 },
  stiff: { type: 'spring' as const, stiffness: 300, damping: 20 },
};

export const easings = {
  easeOut: [0.16, 1, 0.3, 1] as const,
};

export const sceneTransitions = {
  fade: { duration: 0.5 },
};

export const elementAnimations = {
  fadeIn: { initial: { opacity: 0 }, animate: { opacity: 1 } },
};

export const staggerConfigs = {
  fast: 0.05,
  normal: 0.1,
};

export const staggerDelay = (index: number, base: number = 0.1) => index * base;
export const customSpring = (stiffness = 200, damping = 20) => ({ type: 'spring' as const, stiffness, damping });
export const withDelay = (delay: number) => ({ delay });
