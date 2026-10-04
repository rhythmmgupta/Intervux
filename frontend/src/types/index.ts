export interface User {
  id: number;
  name: string;
  email: string;
  role: 'candidate' | 'hr';
  target_company?: string | null;
  target_role?: string | null;
  created_at: string;
}

export interface Company {
  slug: string;
  name: string;
  tier: string;
  roles: string[];
  focus: string[];
  question_pool: number;
}

export interface CompanyDetail extends Omit<Company, 'question_pool'> {
  sample_questions: Array<{ question: string; category: string; difficulty: string; company: string }>;
}

export interface FluencyReport {
  fluency_score: number;
  band: string;
  word_count?: number;
  speaking_speed?: number;
  filler_count?: number;
  components: {
    pace: number;
    continuity: number;
    filler_control: number;
    vocabulary: number;
    sentence_flow: number;
  };
  strengths: string[];
  tips: string[];
  answers_scored?: number;
}

export interface Rating {
  user_id: number;
  rating: number;
  tier: string;
  sessions_completed: number;
  best_score: number | null;
  average_score: number | null;
  contests_entered: number;
}

export interface LeaderboardRow {
  rank?: number;
  user_id: number;
  name: string;
  target_company?: string | null;
  sessions: number;
  best_score: number | null;
  average_score: number | null;
  rating: number;
  tier: string;
}

export interface ContestQuestion {
  question: string;
  category: string;
  difficulty: string;
  company?: string;
}

export interface Contest {
  id: number;
  slug: string;
  title: string;
  company: string;
  kind: 'daily' | 'weekly';
  difficulty: string;
  question_count: number;
  starts_at: string;
  ends_at: string;
  status: 'live' | 'upcoming' | 'closed';
  participants: number;
  joined: boolean;
  my_score: number | null;
  questions: ContestQuestion[] | null;
  questions_locked: boolean;
}

export interface ScoreboardRow {
  rank: number | null;
  user_id: number;
  name: string;
  score: number | null;
  completed_at: string | null;
  status: 'completed' | 'in_progress';
}

export interface SpeakingPrompt {
  id: string;
  level: 'starter' | 'intermediate' | 'advanced';
  focus: string;
  seconds: number;
  prompt: string;
  hint: string;
}

export interface SpeakingAttempt {
  id: number;
  prompt: string;
  transcript: string;
  duration: number;
  word_count: number;
  speaking_speed: number;
  filler_count: number;
  fluency_score: number;
  fluency_band: string;
  feedback: { components?: FluencyReport['components']; strengths?: string[]; tips?: string[] };
  created_at: string;
}

export interface HRCandidate {
  user_id: number;
  name: string;
  email: string;
  target_company?: string | null;
  target_role?: string | null;
  joined: string;
  rating: number;
  tier: string;
  sessions_completed: number;
  best_score: number | null;
  average_score: number | null;
  contests_entered: number;
  last_session_at: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Question {
  id: number;
  interview_id: number;
  question_text: string;
  category: string;
  difficulty: string;
  order_number: number;
  response?: ResponseData;
}

export interface VisionMetrics {
  id?: number;
  eye_contact: number;
  face_visibility: number;
  head_orientation: string;
  posture_score: number;
  gesture_score: number;
  gaze_direction?: string;
  looking_away?: boolean;
  person_count?: number;
  background_motion?: number;
}

export interface IntegrityFlag {
  type: string;
  label: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
}

export interface IntegrityState {
  integrity_score: number;
  status: 'clean' | 'review' | 'flagged';
  flags: IntegrityFlag[];
  hidden_seconds: number;
  event_count: number;
}

export interface AnswerEvaluation {
  id?: number;
  relevance: number;
  clarity: number;
  technical_depth: number;
  structure: number;
  grammar: number;
  confidence: number;
  overall_score: number;
  feedback: string;
  strengths?: string[];
  weaknesses?: string[];
  suggestions?: string[];
}

export interface ResponseData {
  id: number;
  question_id: number;
  transcript: string;
  duration: number;
  speaking_speed: number;
  pause_duration: number;
  filler_count: number;
  volume_score: number;
  vision_metrics?: VisionMetrics;
  answer_evaluation?: AnswerEvaluation;
}

export interface Recommendation {
  id: number;
  interview_id: number;
  category: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Interview {
  id: number;
  user_id: number;
  target_company?: string | null;
  target_role?: string | null;
  contest_id?: number | null;
  type: 'technical' | 'hr';
  mode: 'practice' | 'simulation';
  difficulty: 'easy' | 'medium' | 'hard';
  status: 'in_progress' | 'completed';
  started_at: string;
  ended_at?: string;
  overall_score?: number;
  communication_score?: number;
  technical_score?: number;
  body_language_score?: number;
  speech_score?: number;
  answer_quality_score?: number;
  questions?: Question[];
  recommendations?: Recommendation[];
}

export interface ScoreCardData {
  title: string;
  score: number;
  max_score: number;
  status: string;
  description: string;
}

export interface TimelinePoint {
  question_number: number;
  question_category: string;
  overall_score: number;
  eye_contact: number;
  speaking_speed: number;
  filler_count: number;
  fluency_score?: number;
}

export interface InterviewReportData {
  fluency?: FluencyReport;
  interview: Interview;
  score_cards: ScoreCardData[];
  timeline: TimelinePoint[];
  radar_scores: Array<{ subject: string; A: number; fullMark: number }>;
  recommendations: Recommendation[];
  questions: Question[];
  ai_mode_badge: string;
}
