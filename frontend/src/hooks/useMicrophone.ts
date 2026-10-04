import { useState, useEffect, useRef, useCallback } from 'react';

export type MicrophoneStatus = 'idle' | 'requesting' | 'recording' | 'denied' | 'error';

const FILLER_WORDS = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'basically', 'actually', 'literally', 'so'];

export function useMicrophone() {
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(0);
  const [transcript, setTranscript] = useState<string>('');
  const [speakingSpeed, setSpeakingSpeed] = useState<number>(0);
  const [fillerCount, setFillerCount] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  // Browser speech recognition ends itself after a stretch of silence even with
  // continuous = true. This flag says whether we still want to be listening, so
  // onend knows to restart rather than letting transcription die at the first pause.
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Final text lives in a ref so it survives each restart of the recogniser.
  const finalTranscriptRef = useRef('');
  const startTokenRef = useRef(0);

  const startMicrophone = useCallback(async () => {
    const token = ++startTokenRef.current;
    setStatus('requesting');
    setErrorMessage(null);
    setTranscript('');
    finalTranscriptRef.current = '';
    setDuration(0);
    setFillerCount(0);
    setSpeakingSpeed(0);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not supported in this browser environment.');
      }

      // Tear down anything a previous start left running, or two recognisers would
      // both be appending to the same transcript.
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (token !== startTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      // Setup Web Audio API volume monitoring
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setVolume(normalized);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // Setup speech recognition if supported
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscriptRef.current += ' ' + event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          const fullText = (finalTranscriptRef.current + ' ' + interim).trim();
          setTranscript(fullText);

          // Calculate fillers
          const lower = fullText.toLowerCase();
          let fillers = 0;
          for (const fw of FILLER_WORDS) {
            const regex = new RegExp(`\\b${fw}\\b`, 'g');
            const matches = lower.match(regex);
            if (matches) fillers += matches.length;
          }
          setFillerCount(fillers);

          // Calculate current WPM
          if (startTimeRef.current) {
            const elapsedMins = (Date.now() - startTimeRef.current) / 60000;
            const words = fullText.split(/\s+/).filter(Boolean).length;
            if (elapsedMins > 0.05) {
              setSpeakingSpeed(Math.round(words / elapsedMins));
            }
          }
        };

        recognition.onerror = (e: any) => {
          // 'no-speech' and 'aborted' are routine: the recogniser gives up during a
          // silence and onend follows, where we restart it. Only a permissions or
          // service refusal is worth stopping and telling the candidate about.
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            shouldListenRef.current = false;
            setErrorMessage(
              'Speech recognition is blocked for this site. Allow the microphone, then start the answer again.'
            );
          } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
            console.warn('Speech recognition notice:', e.error);
          }
        };

        // The fix for transcription stopping after a pause: the browser ends the
        // session on its own, so start a fresh one for as long as we want to listen.
        recognition.onend = () => {
          if (!shouldListenRef.current || token !== startTokenRef.current) return;
          restartTimerRef.current = setTimeout(() => {
            if (!shouldListenRef.current || token !== startTokenRef.current) return;
            try {
              recognition.start();
            } catch {
              // Already starting: the next onend will try again.
            }
          }, 250);
        };

        shouldListenRef.current = true;
        try {
          recognition.start();
        } catch {
          // Start raises if a previous session has not fully released yet; onend
          // fires for that one and restarts us.
        }
        recognitionRef.current = recognition;
      }

      startTimeRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);

      setStatus('recording');
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('denied');
        setErrorMessage('Unable to access your microphone. Please allow microphone permission and try again.');
      } else {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to initialize microphone.');
      }
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    startTokenRef.current += 1;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    // Clear the intent before stopping, or onend would restart the recogniser.
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStatus('idle');
    setVolume(0);
  }, []);

  /** Clear the transcript and the accumulated final text behind it. */
  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = '';
    setTranscript('');
    setFillerCount(0);
    setSpeakingSpeed(0);
  }, []);

  useEffect(() => {
    return () => {
      stopMicrophone();
    };
  }, [stopMicrophone]);

  return {
    status,
    errorMessage,
    volume,
    transcript,
    speakingSpeed,
    fillerCount,
    duration,
    startMicrophone,
    stopMicrophone,
    setTranscript,
    resetTranscript,
  };
}
