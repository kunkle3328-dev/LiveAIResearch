
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

// NEW: Granular Voice State Machine
export enum VoiceState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  INTERRUPTED = 'INTERRUPTED',
  RESUMING = 'RESUMING'
}

export interface TranscriptionItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  isFinal?: boolean;
}

export interface VisualizerData {
  volume: number; // 0.0 to 1.0
  isSpeaking: boolean;
}

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Orus' | 'Aoede';

// Theme Definition
export type AppTheme = 'nexus' | 'obsidian' | 'aether' | 'vertex' | 'crimson' | 'midnight' | 'cyber' | 'aurora' | 'solaris' | 'royale' | 'terminal' | 'custom';

export interface CustomThemeConfig {
    base: string;
    surface: string;
    accent: string;
    text: string;
    muted: string;
}

// ENHANCED: Voice Profile with Behavioral Traits
export interface VoiceProfile {
  id: string;
  name: string;
  voiceName: VoiceName;
  
  // Vocal Characteristics
  pace: number; // 0.8 to 1.2
  warmth: number; // 0-10
  energy: number; // 0-10
  
  // Behavioral Traits (Tier 3-6)
  brevity: number; // 0-10
  formality: number; // 0-10
  firmness: number; // 0-10
  challengeLevel: number; // 0-10 
  emotionalDrift: boolean; 
  pauseDensity: number; // 0-10
  
  // --- NEW: Advanced Realism Controls ---
  
  // Conversational Authenticity
  microHesitation: 'off' | 'low' | 'natural';
  selfCorrection: boolean;
  sentenceCompletionVariability: boolean;
  
  // Cognitive Timing
  thoughtDelay: 'off' | 'short' | 'variable';
  midResponseAdaptation: boolean;
  
  // Acoustic Nuance
  breathPlacement: 'off' | 'subtle';
  prosodicDrift: boolean;
  emphasisDecay: boolean;
  
  // Human Imperfection
  naturalFillers: 'off' | 'rare' | 'contextual';
  laughter: 'off' | 'rare';
  falseStartAllowance: boolean;
}

// NEW: Multi-Layer Memory System
export interface MemoryLayer {
  session: string[]; // Facts from this session
  user: { // Long-term preferences
    name: string;
    pacePreference: string;
    tonePreference: string;
  };
  workspace: string[]; // Shared domain knowledge
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

export interface PodcastChapter {
  id: string;
  title: string;
  startTime: number; // seconds
  endTime?: number;
  objective: string;
  keyTakeaways: string[];
  summary?: string;
}

export type MomentType = 'KeyTakeaway' | 'Reflection' | 'Quiz' | 'Definition';
export interface LearningMoment {
  id: string;
  chapterId?: string;
  timestamp: number;
  type: MomentType;
  content: string;
  action?: string;
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
  checkpoints?: string[];
  misconceptions?: string[];
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
  moments?: LearningMoment[];
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
  aiSummary?: string; 
  suggestedResponses?: string[];
}

// --- FEATURE 4: TELEMETRY & ADMIN ---

export type TelemetryLevel = 'info' | 'warn' | 'error' | 'debug';
export type TelemetryCategory = 'audio' | 'network' | 'producer' | 'system' | 'drift';

export interface AudioTelemetryEvent {
  id: string;
  timestamp: number;
  level: TelemetryLevel;
  category: TelemetryCategory;
  message: string;
  data?: any;
}

export interface AdminConfig {
  godMode: boolean; // Disables safety filters and system prompt constraints
  forceMonetization: boolean; // Simulates free tier limits
  debugLatency: boolean; // Shows latency graphs
  safetyFilters: 'strict' | 'relaxed' | 'off'; // Controls LLM safety settings
  temperature: number; // 0.0 to 2.0
  maintenanceMode: boolean; // Simulates system downtime
  systemBroadcast?: string; // Message to display to all users
}
