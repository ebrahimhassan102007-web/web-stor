"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * Scroll-triggered entrance for sections and cards.
 *
 * Deliberately dependency-free and CSS-driven:
 *  - the animation itself lives in `globals.css` (`.reveal` → `.is-visible`)
 *    so it only touches opacity + transform and never causes layout shift;
 *  - content stays visible when JavaScript is unavailable or the user asks for
 *    reduced motion (`.reveal` is forced visible in both cases);
 *  - the observer disconnects after the first reveal, so no scroll listeners
 *    or ongoing work remain once an element has appeared;
 *  - `delay` staggers siblings without a JS timer per element.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  once = true,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger in milliseconds. Keep under ~240ms for groups of 4-6. */
  delay?: number;
  className?: string;
  once?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      node.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          if (once) observer.unobserve(entry.target);
        }
      },
      // Start slightly before the element reaches the viewport for a calm feel.
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once]);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`.trim()}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
