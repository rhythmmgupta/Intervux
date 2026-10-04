import React from 'react';
import { Camera, CameraOff, AlertCircle, Eye, UserCheck } from 'lucide-react';
import { VisionMetrics } from '../types';
import { CameraStatus } from '../hooks/useCamera';

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  errorMessage: string | null;
  metrics?: VisionMetrics;
  isRecording?: boolean;
  onRetry?: () => void;
}

export const CameraPreview: React.FC<CameraPreviewProps> = ({
  videoRef,
  status,
  errorMessage,
  metrics,
  isRecording = false,
  onRetry,
}) => {
  return (
    <div className="relative w-full aspect-video bg-panel rounded-panel overflow-hidden border border-line flex items-center justify-center">
      {/* Video Stream Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transform -scale-x-100 ${
 status === 'active' ? 'opacity-100' : 'opacity-0'
        } transition-opacity duration-300`}
      />

      {/* Centering Face Framing Guide Overlay */}
      {status === 'active' && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {/* Subtle head framing outline */}
          <div className="w-56 h-72 border-2 border-sodium-400/20 rounded-[50%] transition-all duration-300 pointer-events-none" />
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRecording ? 'bg-peak-400' : 'bg-good-400'} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${isRecording ? 'bg-peak-500' : 'bg-good-500'}`} />
            </span>
            <span className="text-xs font-medium text-chalk-dim bg-ink/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-line/50">
              {isRecording ? 'Analyzing Answer' : 'Camera Active'}
            </span>
          </div>

          {/* Real-time Vision Signal Badges on Video */}
          {metrics && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-ink/80 backdrop-blur-md px-3 py-1.5 rounded-control border border-line/60 text-chalk">
                  <Eye className="w-3.5 h-3.5 text-sodium-400" />
                  <span>Eye Contact:</span>
                  <span className={`font-semibold ${metrics.eye_contact >= 70 ? 'text-good-400' : metrics.eye_contact >= 50 ? 'text-flag-400' : 'text-peak-400'}`}>
                    {metrics.eye_contact}%
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 bg-ink/80 backdrop-blur-md px-3 py-1.5 rounded-control border border-line/60 text-chalk">
                  <UserCheck className="w-3.5 h-3.5 text-sodium-400" />
                  <span>Orientation:</span>
                  <span className="font-semibold text-chalk-dim">{metrics.head_orientation}</span>
                </div>
              </div>

              <div className="bg-ink/80 backdrop-blur-md px-3 py-1.5 rounded-control border border-line/60 text-chalk-dim">
                <span>Posture: </span>
                <span className={`font-semibold ${metrics.posture_score >= 80 ? 'text-good-400' : 'text-flag-400'}`}>
                  {metrics.posture_score >= 80 ? 'Good' : 'Moderate'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Requesting State */}
      {status === 'requesting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-panel/90 z-10">
          <div className="w-12 h-12 rounded-full border-2 border-sodium-500 border-t-transparent animate-spin mb-3" />
          <p className="text-sm font-medium text-chalk-dim">Connecting to webcam...</p>
          <p className="text-xs text-mute mt-1">Please approve the browser camera permission request.</p>
        </div>
      )}

      {/* Permission Denied or Error State */}
      {(status === 'denied' || status === 'error') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-ink/95 z-20">
          <div className="w-12 h-12 rounded-full bg-peak-500/10 text-peak-400 flex items-center justify-center mb-3 border border-peak-500/20">
            <CameraOff className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-chalk mb-1">Camera Access Required</h4>
          <p className="text-xs text-mute max-w-sm mb-4 leading-relaxed">
            {errorMessage || 'Unable to access your camera. Please allow camera permissions in your browser and try again.'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-sodium-600 hover:bg-sodium-500 text-chalk rounded-control text-xs font-medium transition-colors"
            >
              Retry Access
            </button>
          )}
        </div>
      )}

      {/* Idle / Off State */}
      {status === 'idle' && (
        <div className="flex flex-col items-center justify-center text-mute p-6 text-center">
          <Camera className="w-10 h-10 mb-2 opacity-50" />
          <p className="text-sm">Webcam preview is currently inactive</p>
        </div>
      )}
    </div>
  );
};
