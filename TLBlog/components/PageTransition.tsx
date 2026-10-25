"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef } from "react";

export default function PageTransition({
  children,
  disabled = false,
  fadeOnly = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  fadeOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const forceVisible = () => {
      const el = ref.current;
      if (!el) return;
      el.style.opacity = "1";
      el.style.transform = "none";
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) forceVisible();
    };
    window.addEventListener("pageshow", onPageShow);

    const t = window.setTimeout(() => {
      const el = ref.current;
      if (el && parseFloat(getComputedStyle(el).opacity) < 0.99) forceVisible();
    }, 2000);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <motion.div
      ref={ref}
      initial={disabled ? false : fadeOnly ? { opacity: 0 } : { y: 20, opacity: 0 }}
      animate={fadeOnly ? { opacity: 1 } : { y: 0, opacity: 1 }}
      transition={
        disabled
          ? { duration: 0 }
          : fadeOnly
            ? { ease: 'easeOut', duration: 0.4 }
            : { ease: "easeOut", duration: 0.8 }
      }
    >
      {children}
    </motion.div>
  );
}