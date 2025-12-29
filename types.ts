
export interface AudioConfig {
  inputSampleRate: number;
  outputSampleRate: number;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface TranscriptionItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

export interface VisualizerData {
  volume: number; // 0.0 to 1.0
  isSpeaking: boolean;
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Orus' | 'Aoede';

export interface VoiceProfile {
  id: string;
  name: string;
  voiceName: VoiceName;
  pace: number; // 0.8 to 1.2
  warmth: number; // 0-10
  energy: number; // 0-10
  brevity: number; // 0-10
  formality: number; // 0-10
  firmness: number; // 0-10 (New)
  pauseDensity: number; // 0-10
  disfluency: 'off' | 'low';
  laughter: 'off' | 'rare';
  breathiness: 'off' | 'subtle';
}

// --- LEARNING & PODCAST ---

export interface LearningSource {
  id: string;
  title: string;
  type: 'text' | 'url' | 'pdf' | 'youtube';
  content: string;
  url?: string;
  tags: string[];
  createdAt: Date;
  status: 'processing' | 'ready' | 'error';
}

export interface PodcastScriptLine {
  speaker: 'Host' | 'Expert';
  text: string;
}

export type PodcastType = 'Standard' | 'Teaching';

// Updated Chapter Interface
export interface PodcastChapter {
  id: string;
  title: string;
  startTime: number; // seconds
  endTime?: number;
  objective: string;
  keyTakeaways: string[];
  summary?: string;
}

// Feature 2: Learning Moments
export type MomentType = 'KeyTakeaway' | 'Reflection' | 'Quiz' | 'Definition';
export interface LearningMoment {
  id: string;
  chapterId?: string;
  timestamp: number;
  type: MomentType;
  content: string;
  action?: string; // e.g., "Think about X"
}

export interface PodcastBlueprint {
  learningObjectives: string[];
  targetAudience: string;
  teachingStyle: string;
  chapters: {
    title: string;
    objective: string;
    keyPoints: string[];
  }[];
  glossary: { term: string; definition: string }[];
}

export interface PodcastEpisode {
  id: string;
  title: string;
  topic: string;
  type: PodcastType;
  style: string;
  script: PodcastScriptLine[];
  blueprint?: PodcastBlueprint;
  chapters?: PodcastChapter[];
  moments?: LearningMoment[]; // New
  audioBase64?: string;
  coverImageBase64?: string;
  sourceIds: string[];
  createdAt: Date;
  durationSeconds?: number;
}

// --- FEATURE 1 & 3: PRODUCER & CALLS ---

export type CallStatus = 'queued' | 'screening' | 'live' | 'declined' | 'ended';

export interface AnswerCard {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  pitfalls: string[];
  nextActions: string[];
  createdAt: Date;
}

export interface CallRequest {
  id: string;
  callerName: string;
  topic: string;
  rawPromptOrText: string;
  status: CallStatus;
  createdAt: Date;
  transcript?: TranscriptionItem[];
  answerCards?: AnswerCard[];
  aiSummary?: string; // Generated during screening
  suggestedResponses?: string[]; // Generated during screening
}

// --- FEATURE 4: TELEMETRY ---

export type TelemetryLevel = 'info' | 'warn' | 'error' | 'debug';
export type TelemetryCategory = 'audio' | 'network' | 'producer' | 'system';

export interface AudioTelemetryEvent {
  id: string;
  timestamp: number;
  level: TelemetryLevel;
  category: TelemetryCategory;
  message: string;
  data?: any;
}
