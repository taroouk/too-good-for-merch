"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// Artwork x/y transform values are stored as fractions of the placement
// container's own width (see src/studio/render/transform.ts --
// resolvePlacement multiplies the same fraction by templateWidth). CSS
// translate() needs real px, so these hooks track the container's live
// rendered width via ResizeObserver, not just a one-time measurement.

// For a ref attached to an element that's always mounted alongside its
// owner (e.g. TryOn3DPreview's own preview div) -- a plain effect keyed on
// the (stable) ref object is correct here: the node already exists by the
// time this runs.
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => setWidth(node.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

// For a ref shared with a child that mounts its target conditionally and
// later than the owner (e.g. BuilderClient's previewRef, attached only
// once the portal-rendered bespoke modal opens) -- ref.current mutating
// doesn't re-run effects, so a plain useEffect([ref]) (or any rAF/timer
// polling loop) can silently observe nothing forever if the ref was still
// null the one time it ran. A callback ref fires synchronously the instant
// React attaches/detaches the node, independent of tab visibility/timing,
// so it's used here instead of polling. Returns a ref CALLBACK (pass as
// the `ref` prop), a RefObject mirror (for imperative .current reads, e.g.
// in a pointer-move handler), and the live width.
export function useMeasuredRefCallback<T extends HTMLElement>(): {
  setRef: (node: T | null) => void;
  nodeRef: RefObject<T | null>;
  width: number;
} {
  const [width, setWidth] = useState(0);
  const nodeRef = useRef<T | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const setRef = useCallback((node: T | null) => {
    if (observerRef.current && nodeRef.current) {
      observerRef.current.unobserve(nodeRef.current);
    }
    nodeRef.current = node;

    if (!node) {
      setWidth(0);
      return;
    }

    setWidth(node.getBoundingClientRect().width);

    if (!observerRef.current) {
      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) setWidth(entry.contentRect.width);
      });
    }
    observerRef.current.observe(node);
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return { setRef, nodeRef, width };
}
