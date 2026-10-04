import { useEffect, useRef, useState, useCallback } from 'react';

export type IntegrityEventType =
  | 'tab_hidden'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'second_display'
  | 'viewport_shift'
  | 'injected_overlay'
  | 'paste';

export interface UseProctorOptions {
  /** Only report while the candidate is actually answering. */
  active: boolean;
  onEvent: (type: IntegrityEventType, detail?: Record<string, unknown>) => void;
}

/**
 * Watches the browser environment for things that correlate with outside help:
 * leaving the tab, losing window focus, dropping fullscreen, a second display,
 * browser chrome resizing mid-answer (devtools or an extension panel), DOM nodes
 * injected by something other than this app, and pasting.
 *
 * Ceiling, stated plainly: a web page cannot enumerate other processes. A
 * well-built always-on-top answer overlay (Parakeet and friends) draws outside
 * the page and excludes itself from screen capture, so none of these APIs can
 * see it directly. What they catch is the *behaviour* around using one. The
 * strongest signal for a silent overlay is gaze, which the backend vision
 * service measures from the webcam, not anything in here.
 */
export function useProctor({ active, onEvent }: UseProctorOptions) {
  const [localFlags, setLocalFlags] = useState<string[]>([]);
  const hiddenAtRef = useRef<number | null>(null);
  const chromeHeightRef = useRef<number>(0);

  const report = useCallback(
    (type: IntegrityEventType, detail?: Record<string, unknown>) => {
      onEvent(type, detail);
      setLocalFlags((prev) => (prev.includes(type) ? prev : [...prev, type]));
    },
    [onEvent]
  );

  // Ask for fullscreen so that leaving it becomes a reportable event.
  const enterLockdown = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Denied or unsupported: not fatal, the other signals still apply.
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    chromeHeightRef.current = window.outerHeight - window.innerHeight;

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current) {
        const seconds = (Date.now() - hiddenAtRef.current) / 1000;
        hiddenAtRef.current = null;
        report('tab_hidden', { seconds: Math.round(seconds * 10) / 10 });
      }
    };

    const onBlur = () => report('window_blur');

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) report('fullscreen_exit');
    };

    // A toolbar, devtools pane or extension panel opening changes how much of the
    // window the page gets without the page itself being resized by the user.
    const onResize = () => {
      const chrome = window.outerHeight - window.innerHeight;
      if (Math.abs(chrome - chromeHeightRef.current) > 60) {
        report('viewport_shift', { from: chromeHeightRef.current, to: chrome });
        chromeHeightRef.current = chrome;
      }
    };

    const onPaste = () => report('paste');

    // Extensions inject their UI as direct children of <body>, outside our root.
    const root = document.getElementById('root');
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (['STYLE', 'SCRIPT', 'LINK', 'TEMPLATE'].includes(node.tagName)) continue;
          if (root?.contains(node)) continue;
          report('injected_overlay', { tag: node.tagName, id: node.id || null });
          return;
        }
      }
    });
    observer.observe(document.body, { childList: true });

    if ((window.screen as Screen & { isExtended?: boolean }).isExtended) {
      report('second_display');
    }

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('paste', onPaste);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [active, report]);

  return { localFlags, enterLockdown };
}
