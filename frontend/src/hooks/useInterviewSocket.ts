import { useState, useEffect, useRef, useCallback } from 'react';
import { Question, VisionMetrics, IntegrityState } from '../types';

export interface UseInterviewSocketOptions {
  interviewId: number;
  onInterviewCompleted?: (data: any) => void;
  onQuestionStarted?: (question: Question) => void;
}

export function useInterviewSocket({ interviewId, onInterviewCompleted, onQuestionStarted }: UseInterviewSocketOptions) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<VisionMetrics>({
    eye_contact: 78,
    face_visibility: 92,
    head_orientation: 'Mostly centered',
    posture_score: 85,
    gesture_score: 75,
  });
  const [integrity, setIntegrity] = useState<IntegrityState>({
    integrity_score: 100,
    status: 'clean',
    flags: [],
    hidden_seconds: 0,
    event_count: 0,
  });
  const [coachingTip, setCoachingTip] = useState<string | null>(null);
  const [lastQuestionFeedback, setLastQuestionFeedback] = useState<any | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Callers pass these as inline arrow functions, so their identity changes every
  // render. Holding them in a ref keeps them out of the effect's dependencies:
  // with them in, the effect tore down and reopened the socket on every render,
  // and because the effect sets state, that loop never stopped.
  const handlersRef = useRef({ onInterviewCompleted, onQuestionStarted });
  useEffect(() => {
    handlersRef.current = { onInterviewCompleted, onQuestionStarted };
  }, [onInterviewCompleted, onQuestionStarted]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect directly to backend port 8000 when running on dev port 3000 / 5173
    const isDev = window.location.port === '3000' || window.location.port === '5173';
    const wsHost = isDev ? `${window.location.hostname}:8000` : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws/interview/${interviewId}`;

    let closedByUnmount = false;

    const connect = () => {
      setConnectionStatus('connecting');
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setIsConnected(true);
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.event) {
          case 'interview_started':
            break;

          case 'question_started':
            setCurrentQuestion(data.question);
            setCoachingTip(null);
            handlersRef.current.onQuestionStarted?.(data.question);
            break;

          case 'video_metrics':
            if (data.metrics) {
              setLiveMetrics((prev) => ({ ...prev, ...data.metrics }));
            }
            break;

          case 'integrity_update':
            if (data.integrity) {
              setIntegrity(data.integrity);
            }
            break;

          case 'feedback':
            if (data.tip) {
              setCoachingTip(data.tip);
              // Clear tip after 8 seconds
              setTimeout(() => {
                setCoachingTip((curr) => (curr === data.tip ? null : curr));
              }, 8000);
            }
            break;

          case 'question_feedback':
            setLastQuestionFeedback(data);
            break;

          case 'interview_completed':
            handlersRef.current.onInterviewCompleted?.(data);
            break;

          case 'error':
            console.error('WebSocket server error:', data.message);
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (closedByUnmount) return;

        // "Reconnecting" should mean it, so actually retry, backing off to 10s.
        setConnectionStatus('connecting');
        const delay = Math.min(10000, 500 * 2 ** retryRef.current);
        retryRef.current += 1;
        retryTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [interviewId]);

  const sendVideoFrame = useCallback(
    (frameBase64: string, currentWpm: number = 0, isAnswering: boolean = true) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            event: 'video_frame',
            frame: frameBase64,
            speaking_speed: currentWpm,
            is_answering: isAnswering,
          })
        );
      }
    },
    []
  );

  const sendAudioChunk = useCallback((volume: number, wpm: number, transcript: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'audio_chunk',
          volume,
          wpm,
          transcript,
        })
      );
    }
  }, []);

  const sendIntegrityEvent = useCallback((type: string, detail?: Record<string, unknown>) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'integrity_event',
          type,
          detail: detail || {},
        })
      );
    }
  }, []);

  const completeQuestion = useCallback((questionId: number, transcript: string, duration: number): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'question_completed',
          question_id: questionId,
          transcript,
          duration,
        })
      );
      return true;
    }
    return false;
  }, []);


  const requestCompleteInterview = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          event: 'complete_interview',
        })
      );
    }
  }, []);

  return {
    isConnected,
    connectionStatus,
    currentQuestion,
    liveMetrics,
    integrity,
    coachingTip,
    lastQuestionFeedback,
    sendVideoFrame,
    sendIntegrityEvent,
    sendAudioChunk,
    completeQuestion,
    requestCompleteInterview,
  };
}
