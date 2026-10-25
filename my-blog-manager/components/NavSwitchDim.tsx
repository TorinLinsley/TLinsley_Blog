"use client";

import { motion, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { EASE_OUT } from '../lib/motion';


let navigating = false;
const listeners = new Set<() => void>();

export function signalNavStart() {
  if (navigating) return;
  navigating = true;
  listeners.forEach((f) => f());
}

function signalNavEnd() {
  if (!navigating) return;
  navigating = false;
  listeners.forEach((f) => f());
}

export default function NavSwitchDim({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  const [dim, setDim] = useState(false);

  useEffect(() => {
    const sync = () => setOn(navigating);
    listeners.add(sync);
    sync();
    return () => { listeners.delete(sync); };
  }, []);

  useEffect(() => { signalNavEnd(); }, [pathname]);

  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setDim(true), 110);
    const guard = window.setTimeout(signalNavEnd, 1500);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(guard);
      setDim(false);
    };
  }, [on]);

  return (
    <motion.div
      className="flex-1 flex flex-col"
      initial={false}
      animate={{ opacity: dim ? 0.55 : 1 }}
      transition={{ duration: reduce ? 0 : dim ? 0.13 : 0.22, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}