"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT, D_MORPH, D_RETRACT, STAGGER, SPRING_MORPH, SPRING_MORPH_SOFT } from "../lib/motion";


const BAR = "bg-slate-800 dark:bg-slate-100";

export function MenuLines({ open, size = 18 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const DOT_L = 4.025;
  const DOT_D = 1.8;
  const DOT_CX = DOT_L + DOT_D / 2;
  const FUSED_L = DOT_L;
  const REST_L = 7.125;
  const REST_R = 13.975;
  const OPEN_R = DOT_CX + 12.42;
  const OPEN_W = OPEN_R - FUSED_L;
  const REST_W = REST_R - REST_L;
  const REST_SCALE = REST_W / OPEN_W;
  const REST_SHIFT = REST_L - FUSED_L;
  const BAR_H = 1.8;
  const rowCy = [3.94, 8.0, 12.09];

  return (
    <span
      aria-hidden
      className="absolute inset-0 m-auto block"
      style={{ width: size, height: size, transform: 'translate(0px, 1px)' }}
    >
      {rowCy.map((cy, i) => {
        const isMid = i === 1;
        const rowTo = isMid
          ? { clipPath: 'inset(0 100% 0 0)' }
          : { rotate: i === 0 ? 45 : -45 };
        const rowRest = isMid
          ? { clipPath: 'inset(0 0% 0 0)' }
          : { rotate: 0 };
        const lineTo = isMid ? { scaleX: REST_SCALE, x: REST_SHIFT } : { scaleX: 1, x: 0 };
        const lineRest = { scaleX: REST_SCALE, x: REST_SHIFT };
        return (
          <span
            key={i}
            className="absolute left-0 right-0 block"
            style={{
              top: cy - BAR_H / 2,
              height: BAR_H,
            }}
          >
            <motion.span
              className="absolute inset-0 block"
              style={{ transformOrigin: `${DOT_CX}px center` }}
              initial={false}
              animate={reduce ? { opacity: isMid && open ? 0 : 1 } : (open ? rowTo : rowRest)}
              transition={
                reduce
                  ? { duration: D_RETRACT, ease: EASE_OUT }
                  : {
                      ...SPRING_MORPH,
                      delay: !open && isMid ? 0.06 : 0,
                    }
              }
            >
              <span
                className={`absolute top-0 rounded-full ${BAR}`}
                style={{ left: DOT_L, width: DOT_D, height: DOT_D }}
              />
              <motion.span
                className={`absolute top-0 rounded-full ${BAR}`}
                style={{
                  left: FUSED_L,
                  width: OPEN_W,
                  height: BAR_H,
                  transformOrigin: 'left center',
                }}
                initial={false}
                animate={reduce ? { opacity: isMid && open ? 0 : 1 } : (open ? lineTo : lineRest)}
                transition={reduce ? { duration: D_RETRACT, ease: EASE_OUT } : SPRING_MORPH}
              />
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

export function FolderLines({ open, size = 16 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const W = size;
  const H = size;

  const ROW_GAP = 3.5;
  const REST_LEN = 6;
  const OPEN_LEN = Math.hypot(REST_LEN, ROW_GAP);
  const restScale = REST_LEN / OPEN_LEN;
  const TILT = (Math.atan2(ROW_GAP, REST_LEN) * 180) / Math.PI;
  const PIVOT_X = 5;
  const rowCy = [8.6 - ROW_GAP / 2, 8.6 + ROW_GAP / 2];
  const LINE_H = 1.1;

  return (
    <span aria-hidden className="absolute inset-0 m-auto block" style={{ width: W, height: H }}>
      {
}
      <span
        className={`absolute inset-0 m-auto block ${BAR}`}
        style={{
          width: W,
          height: H,
          WebkitMaskImage: "url(/file_list-body.svg)",
          maskImage: "url(/file_list-body.svg)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
      {rowCy.map((cy, i) => (
        <span
          key={i}
          className="absolute left-0 right-0 block"
          style={{ top: cy - LINE_H / 2, height: LINE_H }}
        >
          <motion.span
            className="absolute inset-0 block"
            style={{ transformOrigin: `${PIVOT_X}px center` }}
            initial={false}
            animate={reduce ? { opacity: open ? 0.5 : 1 } : { rotate: open ? (i === 0 ? TILT : -TILT) : 0 }}
            transition={reduce ? { duration: D_MORPH, ease: EASE_OUT } : SPRING_MORPH_SOFT}
          >
            <motion.span
              className={`absolute top-0 rounded-full ${BAR}`}
              style={{
                left: PIVOT_X,
                width: OPEN_LEN,
                height: LINE_H,
                transformOrigin: 'left center',
              }}
              initial={false}
              animate={reduce ? { opacity: open ? 0.5 : 1 } : { scaleX: open ? 1 : restScale }}
              transition={reduce ? { duration: D_MORPH, ease: EASE_OUT } : SPRING_MORPH_SOFT}
            />
          </motion.span>
        </span>
      ))}
      {reduce && open && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-black leading-none text-slate-800 dark:text-slate-100"
          style={{ fontSize: 13 }}
        >
          ×
        </span>
      )}
    </span>
  );
}



export function TocBars({ open, size = 16 }: { open: boolean; size?: number }) {
  const reduce = useReducedMotion();
  const R = 1.51;
  const SW = 0.85;
  const RIGHT = 15;
  const OUTER = R + SW / 2;
  const LINK_END_X = 8.02;
  const BRIDGE_X = 3.9;
  const BRIDGE_W = 0.85;
  const BRIDGE_Y1 = 4.5;
  const BRIDGE_Y2 = 13.6;
  const SHIFT_CLOSED = 1.07;
  const SHIFT_OPEN = -0.27;
  const rings = [
    { cx: 3.9, cy: 3.16 },
    { cx: LINK_END_X + OUTER, cy: 7.92 },
    { cx: LINK_END_X + OUTER, cy: 13.1 },
  ];
  const spring = reduce ? { duration: 0.12, ease: EASE_OUT } : SPRING_MORPH;

  return (
    <motion.span
      aria-hidden
      className="absolute inset-0 m-auto block"
      style={{ width: size, height: size }}
      initial={false}
      animate={{ x: open ? SHIFT_OPEN : SHIFT_CLOSED }}
      transition={spring}
    >
      <span
        className={`absolute inset-0 m-auto block ${BAR}`}
        style={{
          width: size,
          height: size,
          WebkitMaskImage: 'url(/outline-lines.svg)',
          maskImage: 'url(/outline-lines.svg)',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        className="absolute inset-0 m-auto block overflow-visible text-slate-800 dark:text-slate-100"
        fill="none"
        stroke="currentColor"
        strokeWidth={SW}
      >
        {
}
        <line x1={BRIDGE_X} y1={BRIDGE_Y1} x2={BRIDGE_X} y2={BRIDGE_Y2} strokeWidth={BRIDGE_W} />
        {rings.map((r, i) => {
          const x = r.cx - R;
          const y = r.cy - R;
          const wBar = RIGHT - SW / 2 - x;
          const delay = reduce ? 0 : (open ? i : rings.length - 1 - i) * STAGGER;
          return (
            <motion.rect
              key={i}
              x={x}
              y={y}
              height={R * 2}
              rx={R}
              initial={false}
              animate={{ width: open ? wBar : R * 2 }}
              transition={{ ...spring, delay }}
            />
          );
        })}
      </svg>
    </motion.span>
  );
}