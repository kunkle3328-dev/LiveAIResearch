
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
  // Tuning Controls - Enterprise Spec
  pace: 'slow' | 'medium' | 'fast';
  warmth: number; // 0-10
  energy: number; // 0-10
  brevity: number; // 0-10
  formality: number; // 0-10
  pauseDensity: number; // 0-10
  disfluency: 'off' | 'low';
  laughter: 'off' | 'rare';
  breathiness: 'off' | 'subtle';
}

// --- LEARNING MODE SCHEMAS ---

export interface LearningSource {
  id: string;
  title: string;
  type: 'text' | 'url' | 'pdf' | 'youtube';
  content: string; // Extracted text
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

export interface PodcastChapter {
  title: string;
  startTime: number; // estimated seconds
  objective: string;
  keyTakeaways: string[];
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
  audioBase64?: string; // Cache the audio data
  coverImageBase64?: string; // Podcast cover art
  sourceIds: string[];
  createdAt: Date;
  durationSeconds?: number;
}
