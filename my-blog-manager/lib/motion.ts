
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;


export const D_PRESS = 0.14;
export const D_POPOVER = 0.18;
export const D_MORPH = 0.24;
export const D_RETRACT = 0.18;
export const D_ENTER = 0.28;
export const STAGGER = 0.045;


export const SPRING_MORPH = { type: 'spring', duration: 0.32, bounce: 0 } as const;

export const SPRING_MORPH_SOFT = { type: 'spring', duration: 0.42, bounce: 0 } as const;

export const SPRING_PLAYFUL = { type: 'spring', duration: 0.45, bounce: 0.18 } as const;