"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { D_ENTER, EASE_OUT } from "../lib/motion";

export default function FadeInImage({
  className = "",
  wrapperClassName = "",
  onLoad,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { wrapperClassName?: string }) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    <motion.span
      className={`block ${wrapperClassName}`}
      initial={false}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: reduce ? 0.12 : D_ENTER, ease: EASE_OUT }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...rest}
        ref={ref}
        className={className}
        onLoad={(e) => {
          setLoaded(true);
          onLoad?.(e);
        }}
      />
    </motion.span>
  );
}