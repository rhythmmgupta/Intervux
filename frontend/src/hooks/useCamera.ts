import { useState, useEffect, useRef, useCallback } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Each start claims a token. A start whose token is stale by the time its
  // async work finishes has been superseded, and must not touch the element.
  const startTokenRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    const token = ++startTokenRef.current;
    setStatus('requesting');
    setErrorMessage(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not supported in this browser environment.');
      }

      // Release any stream already running before requesting another, otherwise
      // two live tracks fight over the same element.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      // A newer start (or an unmount) happened while we were waiting.
      if (token !== startTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr: any) {
          // Assigning a new srcObject rejects any play() still in flight with
          // AbortError. It is noise, not a failure, and must not surface as an
          // error banner - React's development double-mount triggers it every time.
          if (playErr?.name !== 'AbortError') throw playErr;
        }
      }
      if (token !== startTokenRef.current) return;
      setStatus('active');
    } catch (err: any) {
      if (token !== startTokenRef.current) return;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('denied');
        setErrorMessage('Camera access is blocked. Allow the camera for this site in your browser settings, then try again.');
      } else {
        setStatus('error');
        setErrorMessage(err.message || 'The camera could not be started.');
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    // Invalidate any start still in flight.
    startTokenRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  }, []);

  const captureSampledFrame = useCallback((): string | null => {
    if (!videoRef.current || status !== 'active') return null;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 320;
      canvasRef.current.height = 240;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch {
      return null;
    }
  }, [status]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    status,
    errorMessage,
    startCamera,
    stopCamera,
    captureSampledFrame,
  };
}
