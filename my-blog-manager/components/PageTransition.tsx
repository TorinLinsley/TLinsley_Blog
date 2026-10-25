"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";

let documentEntryPlayed = false;

export default function PageTransition({
  children,
  onlyOnDocumentLoad = false,
  fadeOnly = false,
}: {
  children: ReactNode;
  onlyOnDocumentLoad?: boolean;
  fadeOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [animate] = useState(() => (onlyOnDocumentLoad ? !documentEntryPlayed : true));

  useEffect(() => {
    documentEntryPlayed = true;
  }, []);

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
      initial={animate ? (fadeOnly ? { opacity: 0 } : { y: 20, opacity: 0 }) : false}
      animate={fadeOnly ? { opacity: 1 } : { y: 0, opacity: 1 }}
      transition={animate ? { ease: "easeOut", duration: fadeOnly ? 0.4 : 0.8 } : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}