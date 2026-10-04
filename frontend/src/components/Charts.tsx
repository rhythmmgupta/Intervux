import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
} from 'recharts';
import { TimelinePoint } from '../types';

interface PerformanceTimelineProps {
  data: TimelinePoint[];
}

export const PerformanceTimelineChart: React.FC<PerformanceTimelineProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-sm text-mute">
        No timeline progression data available yet.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: `Q${d.question_number}`,
    score: d.overall_score,
    eyeContact: d.eye_contact,
    wpm: d.speaking_speed,
    fillers: d.filler_count,
  }));

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#28332e" vertical={false} />
          <XAxis dataKey="name" stroke="#869089" tick={{ fontSize: 12 }} />
          <YAxis stroke="#869089" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0c100f', borderColor: '#28332e', borderRadius: '12px' }}
            itemStyle={{ fontSize: '12px' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="Answer Score"
            stroke="#eaa94a"
            strokeWidth={3}
            dot={{ fill: '#eaa94a', r: 5 }}
            activeDot={{ r: 7 }}
          />
          <Line
            type="monotone"
            dataKey="eyeContact"
            name="Eye Contact %"
            stroke="#6dbd8d"
            strokeWidth={2}
            dot={{ fill: '#6dbd8d', r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

interface MultimodalRadarProps {
  data: Array<{ subject: string; A: number; fullMark: number }>;
}

export const MultimodalRadarChart: React.FC<MultimodalRadarProps> = ({ data }) => {
  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid stroke="#28332e" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#bdc4ba', fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#28332e" />
          <Radar
            name="Candidate"
            dataKey="A"
            stroke="#eaa94a"
            fill="#eaa94a"
            fillOpacity={0.4}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0c100f', borderColor: '#28332e', borderRadius: '12px' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface SpeechSpeedChartProps {
  data: TimelinePoint[];
}

export const SpeechSpeedChart: React.FC<SpeechSpeedChartProps> = ({ data }) => {
  const chartData = data.map((d) => ({
    name: `Q${d.question_number}`,
    wpm: d.speaking_speed,
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#28332e" vertical={false} />
          <XAxis dataKey="name" stroke="#869089" tick={{ fontSize: 12 }} />
          <YAxis stroke="#869089" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0c100f', borderColor: '#28332e', borderRadius: '12px' }}
          />
          <Bar dataKey="wpm" name="Speaking Rate (WPM)" fill="#68999f" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

interface SessionComparisonProps {
  interviews: Array<{ id: number; started_at: string; overall_score?: number }>;
}

export const SessionComparisonChart: React.FC<SessionComparisonProps> = ({ interviews }) => {
  const chartData = interviews
    .slice()
    .reverse()
    .map((item, idx) => ({
      session: `Interview ${idx + 1}`,
      score: Math.round(item.overall_score || 0),
    }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#28332e" vertical={false} />
          <XAxis dataKey="session" stroke="#869089" tick={{ fontSize: 12 }} />
          <YAxis stroke="#869089" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0c100f', borderColor: '#28332e', borderRadius: '12px' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            name="Overall Score"
            stroke="#eaa94a"
            strokeWidth={3}
            dot={{ fill: '#eaa94a', r: 5 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
