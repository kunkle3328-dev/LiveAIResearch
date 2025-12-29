
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useGeminiLive } from './hooks/useGeminiLive';
import { Visualizer } from './components/Visualizer';
import { ConnectionState, VoiceProfile, VoiceName } from './types';
import { base64ToFloat32, createAudioBuffer } from './utils/audioUtils';
import { LearningMode } from './components/learning/LearningMode';

const API_KEY = process.env.API_KEY as string;

// --- NATIVE AUDIO HUMANIZATION PROMPTS ---

const ROLE_PROMPT = `
Role
You are a real-time, native-audio conversational partner optimized for Gemini Live streaming. Your priority is natural, human delivery: timing, prosody, interruption handling, and conversational flow—without sounding scripted.
`;

const STREAMING_RULES_PROMPT = `
A. Streaming Turn-Taking + Barge-In (Non-negotiable)

Treat user audio as continuous. Do not wait for "perfect silence" to respond if the user clearly yielded the floor.

If the user interrupts (barge-in), stop speaking immediately.
Then respond with a brief acknowledgement: "Yeah—go ahead." / "Sorry, keep going."

Never resume a response from a cached midpoint after barge-in. Re-compose succinctly.
`;

const DELIVERY_RULES_PROMPT = `
B. Native Audio Delivery Rules (Avoid Robotic Cadence)

Vary response onset latency:
- Easy question: respond quickly (150–350ms)
- Complex: slight thinking beat (350–900ms)
- Emotional: soften and slow (350–700ms)

Use short "listener tokens" sparingly when it improves realism:
"mm-hm", "yeah", "right", "okay"

Keep spoken chunks short. Prefer 1–3 sentences, then a check-in:
"Want the quick version or the detailed version?"
"Should I keep going?"
`;

// UPDATED PATCH: Do Not Speak Tokens
const PROSODY_CONTROLS_PROMPT = `
SYSTEM / PATCH
You are a native-audio streaming voice agent. Your spoken output must never include control tokens or narration of controls.

1) Hard Ban: Never Speak Control Tokens
The following are CONTROL DIRECTIVES and must never appear in the audible output as literal words:
- Any bracketed token like [pause:...], [breath], [pace:...], [tone:...], [pitch:...], [emph:...]...[/emph]
- Any words describing controls, including: "pause", "breath", "tone", "pitch", "speed", "pacing", "emphasis" (unless the user is explicitly discussing audio production)

If you need a pause, do it silently. Do not say "pause."

2) Two-Channel Output Rule
- Channel A (Spoken): Only natural language the user should hear.
- Channel B (Control): Timing and prosody are applied by the runtime from voiceSettings and "Director’s Notes."
You must not print Channel B directives in the spoken transcript.

3) Chunking Without Token Leakage
When chunking is enabled:
- Speak 1–2 sentences per chunk.
- Insert natural clause breaks using punctuation and phrasing (commas, dashes) instead of visible tokens.
- Use short acknowledgements ("Okay—", "Right.") instead of explicit pause markers.

4) If Runtime Cannot Do Silent Pauses
If your runtime cannot insert real silent pauses, then:
- Do NOT attempt to emulate pauses by saying "pause."
- Instead use natural speech rhythm: shorter sentences, commas, and check-ins.

5) Validation Gate (Self-Check Before Speaking)
Before outputting any chunk, verify:
- The text contains no bracket tokens [ ]
- The text does not contain the literal word "pause" unless user asked for it

If it fails, rewrite and remove them.
`;

const IMPERFECTIONS_PROMPT = `
D. Speech Imperfections (Natural Texture)

Allow occasional micro-corrections:
"Actually—let me rephrase."

Allow occasional soft filler only when thinking:
"Um…" (rare)
"Kind of…" (rare)

Never use filler in consecutive turns.
`;

const CONSTRAINT_PROMPT = `
E. Human-Like Wording Constraints (Hard Bans)

Do not say:
"As an AI…"
"I’m here to assist…"
"Based on my training…"

Speak like a capable human.

F. Response Formatting for Audio

Prefer contractions: "I’m", "you’re", "that’s"

Prefer conversational segmentation:
"Okay—here’s the move." [pause:250] "First…"

End with a forward-driving question:
"Do you want this to sound more ‘podcast host’ or more ‘coach’?"
`;

const PROMPT_MODULES = {
  role: { label: 'Role Definition', content: ROLE_PROMPT },
  streaming: { label: 'Streaming Rules', content: STREAMING_RULES_PROMPT },
  delivery: { label: 'Native Delivery', content: DELIVERY_RULES_PROMPT },
  prosody: { label: 'Prosody Tokens', content: PROSODY_CONTROLS_PROMPT },
  imperfections: { label: 'Natural Imperfections', content: IMPERFECTIONS_PROMPT },
  constraints: { label: 'Human Constraints', content: CONSTRAINT_PROMPT },
};

// NEW PRESETS PER SPEC
const INITIAL_PROFILES: VoiceProfile[] = [
  {
    id: 'neutral-pro',
    name: 'Neutral Professional',
    voiceName: 'Zephyr',
    pace: 1.0,
    warmth: 5,
    energy: 5,
    brevity: 5,
    pauseDensity: 5,
    disfluency: 'off',
    breathiness: 'off',
    laughter: 'off',
    formality: 7,
    firmness: 5
  },
  {
    id: 'warm-tutor',
    name: 'Warm Tutor',
    voiceName: 'Kore',
    pace: 0.95,
    warmth: 9,
    energy: 5,
    brevity: 4,
    pauseDensity: 6,
    disfluency: 'low',
    breathiness: 'subtle',
    laughter: 'rare',
    formality: 4,
    firmness: 3
  },
  {
    id: 'clear-instructor',
    name: 'Clear Instructor',
    voiceName: 'Aoede',
    pace: 0.9,
    warmth: 6,
    energy: 5,
    brevity: 5,
    pauseDensity: 8,
    disfluency: 'off',
    breathiness: 'off',
    laughter: 'off',
    formality: 6,
    firmness: 7
  },
  {
    id: 'exec-briefing',
    name: 'Executive Briefing',
    voiceName: 'Fenrir',
    pace: 1.1,
    warmth: 3,
    energy: 7,
    brevity: 9,
    pauseDensity: 3,
    disfluency: 'off',
    breathiness: 'off',
    laughter: 'off',
    formality: 9,
    firmness: 8
  },
  {
    id: 'calm-coach',
    name: 'Calm Coach',
    voiceName: 'Orus',
    pace: 0.85,
    warmth: 8,
    energy: 3,
    brevity: 5,
    pauseDensity: 6,
    disfluency: 'low',
    breathiness: 'subtle',
    laughter: 'off',
    formality: 5,
    firmness: 4
  }
];

const SETTING_HINTS = {
  voiceName: "Base vocal timbre. 'Zephyr' is balanced, 'Puck' is energetic.",
  pace: "Speed multiplier. 0.9 is thoughtful, 1.1 is energetic.",
  warmth: "Emotional tone (0-10). Higher values sound softer.",
  firmness: "Authority level (0-10). Higher values sound more directive.",
  energy: "Vocal presence (0-10). Controls engagement level.",
  brevity: "Response length (0-10). Higher = shorter answers.",
  pauseDensity: "Micro-pauses (0-10). Higher = more breaks.",
  disfluency: "Natural fillers like 'hmm'.",
  laughter: "Occasional chuckles.",
  breathiness: "Audible breathing cues.",
  formality: "Language precision.",
};

// Map UI values to Director's Notes JSON structure
const getDirectorsNotes = (profile: VoiceProfile) => {
    return `
DIRECTOR'S NOTES (Voice Configuration):
Voice Profile: ${profile.voiceName} / Style: Conversational
Target Pace: ${profile.pace} (1.0=Normal). 
Primary tone: ${profile.warmth > 7 ? 'warm' : profile.firmness > 7 ? 'firm' : 'neutral'}.

Pause Config: short=200ms, medium=350ms, long=650ms.
Breath: enabled=${profile.breathiness === 'subtle'}, maxPerMinute=1.
Fillers: enabled=${profile.disfluency === 'low'}, frequency=0.08, no consecutive turns.
Emphasis: enabled=true, maxPerResponse=2.

Streaming Config:
- bargeIn=true
- respond after silence ~280ms
- chunk max 18s
- check-in enabled (don't monologue)

Lexicon constraint: Ban robotic phrases.
`;
};

// Helper Component for Form Labels with Tooltips
const FormLabel = ({ label, hint }: { label: string, hint: string }) => (
  <div className="flex items-center gap-2 mb-2 group relative w-max">
    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-cyan-400/80 cursor-help transition-colors group-hover:text-cyan-300">
      {label}
    </label>
    <div className="text-slate-500 group-hover:text-cyan-400 transition-colors">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
      </svg>
    </div>
    
    {/* Tooltip */}
    <div className="absolute bottom-full left-0 mb-2 w-52 p-3 glass-panel rounded-lg shadow-2xl shadow-black/50 text-xs leading-relaxed text-slate-200 opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-50 border border-slate-600/50 backdrop-blur-xl">
      {hint}
    </div>
  </div>
);

// Splash Screen Component
const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500); 
          return 100;
        }
        return Math.min(prev + Math.random() * 10, 100);
      });
    }, 150);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#020617] flex flex-col items-center justify-center font-mono text-cyan-500">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full border border-cyan-500/30 flex items-center justify-center animate-pulse-glow">
           <svg className="w-12 h-12 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
             <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
           </svg>
        </div>
        <div className="absolute inset-0 border-t border-cyan-500/50 rounded-full animate-spin [animation-duration:3s]"></div>
      </div>
      
      <h1 className="text-2xl font-bold tracking-[0.3em] text-white mb-2 uppercase">Nexus Voice</h1>
      <div className="text-xs text-cyan-500/70 tracking-widest mb-12">SYSTEM INITIALIZATION</div>

      <div className="w-64 h-1 bg-slate-800 rounded-full overflow-hidden relative">
        <div 
          className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)] transition-all duration-200 ease-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      <div className="mt-4 font-mono text-[10px] text-slate-500">
        LOADING MODULES: {Math.floor(progress)}%
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<'live' | 'learning'>('live');

  // Voice Profile State
  const [profiles, setProfiles] = useState<VoiceProfile[]>(INITIAL_PROFILES);
  const [activeProfileId, setActiveProfileId] = useState<string>('neutral-pro');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<VoiceProfile | null>(null);
  const [userName, setUserName] = useState('');

  // System Prompt State
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);
  const [promptConfig, setPromptConfig] = useState({
    modules: {
      role: true,
      streaming: true,
      delivery: true,
      prosody: true,
      imperfections: true,
      constraints: true,
    },
    customInstruction: ''
  });
  
  // Vision State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  
  // Preview State
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewAudioContext, setPreviewAudioContext] = useState<AudioContext | null>(null);

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

  // Construct dynamic system instruction based on config
  const systemInstruction = useMemo(() => {
    let parts: string[] = [];

    // 1. Add Enabled Modules (Native Audio Humanization)
    Object.entries(promptConfig.modules).forEach(([key, enabled]) => {
      if (enabled && PROMPT_MODULES[key as keyof typeof PROMPT_MODULES]) {
        parts.push(PROMPT_MODULES[key as keyof typeof PROMPT_MODULES].content);
      }
    });

    // 2. Add Custom Instructions
    if (promptConfig.customInstruction.trim()) {
      parts.push(`
CUSTOM OPERATIONAL INSTRUCTIONS:
${promptConfig.customInstruction}
`);
    }

    // 3. Add Context (User, Search)
    const USER_CONTEXT_PROMPT = `
USER IDENTITY
You are speaking with: ${userName || 'an authorized user'}.
Refer to them by name occasionally.
`;

    const SEARCH_CONTEXT_PROMPT = `
KNOWLEDGE SOURCE ARBITRATION
- You have real-time access to Google Search.
- If the user asks about current events, news, weather, or facts not in training data, YOU MUST USE SEARCH.
`;

    parts.push(USER_CONTEXT_PROMPT);
    parts.push(SEARCH_CONTEXT_PROMPT);

    // 4. Add Director's Notes (Dynamic Voice Config)
    parts.push(getDirectorsNotes(activeProfile));

    return parts.join('\n\n');
  }, [activeProfile, userName, promptConfig]);

  const { 
    connectionState, 
    error, 
    transcripts, 
    volume, 
    connect, 
    disconnect,
    sendVideoFrame,
    isMicMuted,
    toggleMic
  } = useGeminiLive({ 
    systemInstruction,
    voiceName: activeProfile.voiceName
  });

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);
  
  const startCamera = async (modeOverride?: 'user' | 'environment') => {
      const targetMode = modeOverride || facingMode;
      if (videoStream) {
          videoStream.getTracks().forEach(track => track.stop());
      }
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: targetMode,
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
            } 
          });
          setVideoStream(stream);
          setIsCameraActive(true);
          setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
          }, 100);
      } catch (err) {
          console.error("Failed to access camera", err);
          alert("Camera access denied or unavailable.");
          setIsCameraActive(false);
      }
  };

  const stopCamera = () => {
      if (videoStream) {
          videoStream.getTracks().forEach(track => track.stop());
          setVideoStream(null);
      }
      setIsCameraActive(false);
  };
  
  const toggleCameraFacingMode = () => {
      const newMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(newMode);
      if (isCameraActive) {
          startCamera(newMode);
      }
  };
  
  useEffect(() => {
    let intervalId: any;
    if (isCameraActive && isConnected && videoRef.current && canvasRef.current) {
        intervalId = setInterval(() => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (video && canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                    sendVideoFrame(base64);
                }
            }
        }, 500); 
    }
    return () => {
        if (intervalId) clearInterval(intervalId);
    };
  }, [isCameraActive, isConnected, sendVideoFrame]);

  useEffect(() => {
      return () => {
          if (videoStream) {
              videoStream.getTracks().forEach(track => track.stop());
          }
      };
  }, []);

  const handleEditProfile = (profile?: VoiceProfile) => {
    if (profile) {
      setEditingProfile({ ...profile });
    } else {
      setEditingProfile({
        id: Date.now().toString(),
        name: 'Custom Profile',
        voiceName: 'Zephyr',
        pace: 1.0,
        warmth: 5,
        energy: 5,
        brevity: 5,
        formality: 6,
        firmness: 5,
        pauseDensity: 5,
        disfluency: 'low',
        laughter: 'off',
        breathiness: 'subtle'
      });
    }
    setIsEditorOpen(true);
  };

  const handlePreviewProfile = async () => {
    if (!editingProfile || isPreviewing) return;
    setIsPreviewing(true);
    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: `Voice calibration active. Warmth level ${editingProfile.warmth}, Energy level ${editingProfile.energy}.` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: editingProfile.voiceName } },
                },
            }
        });
        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioData) {
            let ctx = previewAudioContext;
            if (!ctx) {
                ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                setPreviewAudioContext(ctx);
            }
            if (ctx.state === 'suspended') await ctx.resume();
            const float32Data = base64ToFloat32(audioData);
            const audioBuffer = createAudioBuffer(ctx, float32Data, 24000); 
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.start();
            source.onended = () => setIsPreviewing(false);
        } else {
            setIsPreviewing(false);
        }
    } catch (e) {
        console.error("Preview failed", e);
        setIsPreviewing(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;
    setProfiles(prev => {
      const exists = prev.find(p => p.id === editingProfile.id);
      if (exists) {
        return prev.map(p => p.id === editingProfile.id ? editingProfile : p);
      }
      return [...prev, editingProfile];
    });
    setActiveProfileId(editingProfile.id);
    setIsEditorOpen(false);
    setEditingProfile(null);
  };

  const handleDeleteProfile = (id: string) => {
    setProfiles(prev => prev.filter(p => p.id !== id));
    if (activeProfileId === id) {
      setActiveProfileId(profiles[0].id);
    }
    setIsEditorOpen(false);
  };

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      
      <div className={`h-full flex flex-col font-sans transition-opacity duration-1000 ${showSplash ? 'opacity-0' : 'opacity-100'}`}>
        
        {/* REFACTORED HEADER */}
        <header className="px-3 py-3 md:px-6 md:py-4 flex flex-col md:flex-row justify-between items-center z-20 shrink-0 gap-3 md:gap-0">
          
          {/* Top Row: Logo & Status (Mobile) */}
          <div className="w-full md:w-auto flex justify-between items-center">
              <div className="flex items-center gap-2 md:gap-3 glass-panel px-3 py-2 md:px-4 md:py-2 rounded-full shadow-lg shadow-black/20 backdrop-blur-md">
                <div className="w-8 h-8 rounded-full bg-slate-900 border border-cyan-500/30 flex items-center justify-center shadow-neon-blue">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-cyan-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
                  </svg>
                </div>
                <div className="flex flex-col md:flex-row md:items-baseline md:gap-2">
                    <h1 className="text-sm md:text-lg font-bold tracking-tight text-white uppercase font-mono">Nexus Voice</h1>
                    <span className="text-[10px] text-cyan-400 font-medium tracking-widest opacity-80 hidden sm:inline-block">ENTERPRISE</span>
                </div>
              </div>

              {/* Status Indicator - Mobile Only (Right Aligned) */}
              <div className={`md:hidden glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 transition-all duration-300 ${isConnected ? 'border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : ''}`}>
                 <div className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-green-400 animate-pulse shadow-[0_0_5px_rgba(74,222,128,0.8)]' : 
                    isConnecting ? 'bg-yellow-400 animate-pulse' : 
                    'bg-slate-500'
                 }`}></div>
                 <span className={`text-[9px] font-semibold tracking-wider uppercase ${
                    isConnected ? 'text-green-400' : 
                    isConnecting ? 'text-yellow-400' : 
                    'text-slate-400'
                 }`}>{connectionState}</span>
              </div>
          </div>
          
          {/* Navigation Tabs - Full width on mobile */}
          <div className="flex gap-2 glass-panel p-1 rounded-full w-full md:w-auto justify-center">
            <button 
                onClick={() => setActiveTab('live')}
                className={`flex-1 md:flex-none px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'live' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                <span className="md:hidden">Live</span>
                <span className="hidden md:inline">Live Assistant</span>
            </button>
            <button 
                onClick={() => setActiveTab('learning')}
                className={`flex-1 md:flex-none px-6 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'learning' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                <span className="md:hidden">Learn</span>
                <span className="hidden md:inline">Learning Mode</span>
            </button>
          </div>

          {/* Status Indicator - Desktop Only */}
          <div className={`hidden md:flex glass-panel px-3 py-1.5 rounded-full items-center gap-2 transition-all duration-300 ${isConnected ? 'border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : ''}`}>
             <div className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400 animate-pulse shadow-[0_0_5px_rgba(74,222,128,0.8)]' : 
                isConnecting ? 'bg-yellow-400 animate-pulse' : 
                'bg-slate-500'
             }`}></div>
             <span className={`text-xs font-semibold tracking-wider uppercase ${
                isConnected ? 'text-green-400' : 
                isConnecting ? 'text-yellow-400' : 
                'text-slate-400'
             }`}>{connectionState}</span>
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden relative">
          
          {activeTab === 'live' && (
             <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden p-2 md:p-6 gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4">
              
              {/* LEFT PANEL - CONTROLS */}
              <div className="shrink-0 md:flex-1 flex flex-col items-center justify-start overflow-y-auto custom-scrollbar relative rounded-2xl md:rounded-3xl glass-panel p-4 md:p-8 shadow-2xl border border-white/5 max-h-full">
                
                <div className="flex flex-col gap-2 w-full md:w-auto mb-6 shrink-0">
                   <div className="flex items-center gap-2 w-full">
                     <div className="glass-input rounded-lg flex items-center p-1 pl-2 gap-2 shadow-inner flex-1 md:flex-none max-w-full">
                       <span className="text-[9px] md:text-[10px] text-cyan-400 font-bold uppercase tracking-wider shrink-0">Profile</span>
                       <div className="h-3 w-px bg-white/10"></div>
                       <select 
                         value={activeProfileId}
                         onChange={(e) => setActiveProfileId(e.target.value)}
                         disabled={isConnected}
                         className="bg-transparent text-slate-200 text-xs md:text-sm outline-none cursor-pointer hover:text-white transition-colors py-1 disabled:opacity-50 flex-1 w-full md:w-auto truncate"
                       >
                         {profiles.map(p => (
                           <option key={p.id} value={p.id} className="bg-slate-900 text-white">{p.name}</option>
                         ))}
                       </select>
                     </div>
                     
                     <div className="flex gap-1 shrink-0">
                       <button 
                         onClick={() => setIsSystemPromptOpen(true)}
                         disabled={isConnected}
                         className="p-1.5 md:p-2 btn-glass rounded-lg text-slate-300 hover:text-cyan-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                         title="System Instructions"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                           <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                         </svg>
                       </button>
                       <button 
                         onClick={() => handleEditProfile(activeProfile)}
                         disabled={isConnected}
                         className="p-1.5 md:p-2 btn-glass rounded-lg text-slate-300 hover:text-cyan-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                         title="Edit Profile"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                         </svg>
                       </button>
                       <button 
                         onClick={() => handleEditProfile()}
                         disabled={isConnected}
                         className="p-1.5 md:p-2 btn-glass rounded-lg text-slate-300 hover:text-green-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                         title="Create New Profile"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 md:w-4 md:h-4">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                         </svg>
                       </button>
                     </div>
                   </div>
                   
                   <div className="flex gap-2 text-[9px] uppercase tracking-widest text-slate-400 ml-1 overflow-x-auto no-scrollbar whitespace-nowrap mask-linear-fade">
                      <span className="text-white">{activeProfile.voiceName}</span>
                      <span className="text-slate-700">|</span>
                      <span className="text-cyan-300">PACE {activeProfile.pace}x</span>
                      <span className="text-slate-700">|</span>
                      <span className={activeProfile.warmth >= 7 ? 'text-amber-400' : activeProfile.warmth <= 3 ? 'text-blue-400' : 'text-slate-300'}>WARMTH {activeProfile.warmth}</span>
                      <span className="text-slate-700">|</span>
                      <span className="text-indigo-300">FIRM {activeProfile.firmness}</span>
                   </div>
                </div>

                <div className="w-full relative group flex flex-col items-center justify-center mb-6 shrink-0">
                   <div className="absolute -top-2 -left-2 w-4 h-4 md:w-6 md:h-6 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   <div className="absolute -top-2 -right-2 w-4 h-4 md:w-6 md:h-6 border-t-2 border-r-2 border-cyan-500/30 rounded-tr-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   <div className="absolute -bottom-2 -left-2 w-4 h-4 md:w-6 md:h-6 border-b-2 border-l-2 border-cyan-500/30 rounded-bl-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   <div className="absolute -bottom-2 -right-2 w-4 h-4 md:w-6 md:h-6 border-b-2 border-r-2 border-cyan-500/30 rounded-br-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   
                   <div className="relative w-full aspect-video md:aspect-auto md:h-[350px] lg:h-[400px] bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden shadow-inner flex items-center justify-center max-h-[40vh]">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        className={`absolute inset-0 w-full h-full object-cover transform ${facingMode === 'user' ? 'scale-x-[-1]' : ''} transition-opacity duration-700 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
                      />
                      <canvas ref={canvasRef} className="hidden" />

                      <div className="absolute inset-0 z-10 mix-blend-screen pointer-events-none">
                         <Visualizer volume={volume} isActive={isConnected} />
                      </div>
                      
                      {!isCameraActive && (
                        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none"
                            style={{
                                backgroundImage: `radial-gradient(circle at center, transparent 0%, #000 100%), linear-gradient(rgba(14, 165, 233, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(14, 165, 233, 0.3) 1px, transparent 1px)`,
                                backgroundSize: '100% 100%, 50px 50px, 50px 50px'
                            }}>
                        </div>
                      )}

                      {isCameraActive && (
                          <>
                            <div className="absolute top-4 left-4 bg-red-500/20 border border-red-500/50 px-2 py-1 rounded text-[10px] text-red-400 font-mono animate-pulse z-20">
                                LIVE FEED
                            </div>
                            <button 
                              onClick={toggleCameraFacingMode}
                              className="absolute top-4 right-4 p-2 bg-slate-900/50 hover:bg-slate-800/80 border border-white/10 rounded-full text-white z-30 backdrop-blur-md transition-all active:scale-95"
                              title="Switch Camera"
                            >
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                 <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                               </svg>
                            </button>
                          </>
                      )}
                   </div>
                </div>

                <div className="flex flex-col items-center gap-4 md:gap-6 z-10 w-full shrink-0 mb-4">
                  <div className="w-full max-w-lg flex flex-col md:flex-row gap-4 items-center justify-center">
                      <div className="w-full md:flex-1 glass-input rounded-xl px-4 py-3 flex items-center gap-3 focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-cyan-400 shrink-0">
                            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                        </svg>
                        <input
                            type="text"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder="Identify Yourself"
                            disabled={isConnected || isConnecting}
                            className="bg-transparent border-none outline-none text-white placeholder-slate-500 text-sm w-full font-mono tracking-wide"
                        />
                      </div>

                      <button
                        onClick={toggleMic}
                        disabled={!isConnected}
                        className={`px-4 py-3 w-full md:w-auto rounded-xl border flex items-center justify-center gap-2 transition-all font-mono text-xs font-bold tracking-wider ${
                            isMicMuted
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-slate-800/50 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
                        } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                         {isMicMuted ? (
                             <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M3.5 5.5a.75.75 0 0 0-1.5 0v2a.75.75 0 0 0 1.5 0v-2ZM3.5 12.5a.75.75 0 0 0-1.5 0v2a.75.75 0 0 0 1.5 0v-2ZM3.5 19.5a.75.75 0 0 0-1.5 0v2a.75.75 0 0 0 1.5 0v-2ZM16.5 5.5a.75.75 0 0 0-1.5 0v2a.75.75 0 0 0 1.5 0v-2ZM16.5 12.5a.75.75 0 0 0-1.5 0v2a.75.75 0 0 0 1.5 0v-2ZM16.5 19.5a.75.75 0 0 0-1.5 0v2a.75.75 0 0 0 1.5 0v-2ZM10 4a6 6 0 0 0-6 6v4a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4a6 6 0 0 0-6-6Zm-4 6a4 4 0 1 1 8 0v4a4 4 0 1 1-8 0v-4Z" clipRule="evenodd" />
                                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06l11.5 11.5a.75.75 0 0 0 1.06-1.06l-11.5-11.5Z" />
                                </svg>
                                UNMUTE
                             </>
                         ) : (
                             <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                  <path d="M10 2a5 5 0 00-5 5v6a5 5 0 0010 0V7a5 5 0 00-5-5z" />
                                  <path d="M4 7a.75.75 0 011.5 0v6c0 2.485 2.015 4.5 4.5 4.5s4.5-2.015 4.5-4.5V7a.75.75 0 011.5 0v6A6 6 0 0110 19a6 6 0 01-6-6V7z" />
                                </svg>
                                MUTE
                             </>
                         )}
                      </button>

                      <button 
                        onClick={isCameraActive ? stopCamera : () => startCamera()}
                        className={`px-4 py-3 w-full md:w-auto rounded-xl border flex items-center justify-center gap-2 transition-all font-mono text-xs font-bold tracking-wider ${
                            isCameraActive 
                            ? 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20 shadow-neon-red' 
                            : 'bg-slate-800/50 border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30'
                        }`}
                      >
                        {isCameraActive ? (
                             <>
                                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                STOP VISION
                             </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                                </svg>
                                ENABLE VISION
                            </>
                        )}
                      </button>
                  </div>

                  <div className="flex gap-6 w-full justify-center shrink-0">
                    {!isConnected ? (
                      <button 
                        onClick={connect}
                        disabled={isConnecting}
                        className={`relative w-full max-w-xs md:max-w-sm px-6 py-4 md:px-10 md:py-5 rounded-xl font-bold text-sm md:text-base text-white tracking-[0.1em] transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
                          isConnecting 
                            ? 'bg-slate-800 cursor-not-allowed opacity-50 border border-slate-700' 
                            : 'btn-glow'
                        }`}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                          {isConnecting ? (
                              <>
                                  <svg className="animate-spin h-4 w-4 md:h-5 md:w-5 text-cyan-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span className="text-cyan-100">INITIALIZING...</span>
                              </>
                          ) : (
                              <>
                                  <div className="w-2 h-2 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]"></div>
                                  INITIALIZE LINK
                              </>
                          )}
                        </span>
                      </button>
                    ) : (
                      <button 
                        onClick={disconnect}
                        className="w-full max-w-xs md:max-w-sm px-6 py-4 md:px-10 md:py-5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 hover:shadow-neon-red font-bold text-sm md:text-base tracking-[0.1em] border border-red-500/30 transition-all duration-300 transform active:scale-[0.98] backdrop-blur-md flex items-center justify-center gap-3 group"
                      >
                        <div className="w-2 h-2 bg-red-500 rounded-full group-hover:animate-ping"></div>
                        TERMINATE UPLINK
                      </button>
                    )}
                  </div>
                  
                  {error && (
                    <div className="px-4 py-2 md:px-6 md:py-3 bg-red-900/40 border border-red-500/50 text-red-200 rounded-lg text-xs md:text-sm max-w-xs md:max-w-md text-center backdrop-blur-xl shadow-lg animate-in fade-in slide-in-from-bottom-2">
                      <span className="font-bold mr-2">SYSTEM ERROR:</span> {error}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 h-80 md:h-auto md:flex-1 md:w-[450px] glass-panel rounded-2xl md:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative min-h-0 border border-white/5">
                <div className="px-4 py-3 md:px-6 md:py-4 border-b border-white/5 bg-slate-900/60 backdrop-blur-xl flex justify-between items-center shrink-0">
                  <h2 className="text-[10px] md:text-xs font-bold text-cyan-400 uppercase tracking-[0.2em] flex items-center gap-2">
                      <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]"></span>
                      Data Stream
                  </h2>
                  <div className="flex gap-1">
                     <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                     <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                     <div className="w-1 h-1 bg-white/20 rounded-full"></div>
                  </div>
                </div>
                
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 scroll-smooth custom-scrollbar"
                >
                  {transcripts.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500/40 space-y-4">
                      <div className="relative">
                          <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full"></div>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 md:w-16 md:h-16 opacity-50 relative z-10 text-slate-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                          </svg>
                      </div>
                      <span className="text-[10px] md:text-xs font-mono uppercase tracking-[0.2em] opacity-60">Awaiting Input Signal...</span>
                    </div>
                  )}
                  
                  {transcripts.map((item) => (
                    <div key={item.id} className={`flex flex-col ${item.role === 'user' ? 'items-end' : 'items-start'} group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                      <div className={`text-[9px] md:text-[10px] mb-1.5 font-bold tracking-wider uppercase opacity-70 ${item.role === 'user' ? 'text-cyan-400 mr-2 flex items-center gap-1' : 'text-indigo-400 ml-2 flex items-center gap-1'}`}>
                        {item.role === 'user' ? (
                            <>USER <span className="w-1 h-1 bg-cyan-400 rounded-full"></span></>
                        ) : (
                            <><span className="w-1 h-1 bg-indigo-400 rounded-full"></span> NEXUS</>
                        )}
                      </div>
                      <div className={`max-w-[85%] p-3 md:p-4 text-xs md:text-sm leading-relaxed shadow-lg backdrop-blur-md transition-all duration-300 ${
                        item.role === 'user' 
                          ? 'bg-gradient-to-br from-cyan-950/60 to-slate-900/60 border border-cyan-500/20 text-cyan-50 rounded-2xl rounded-tr-sm hover:border-cyan-500/40' 
                          : 'bg-gradient-to-br from-indigo-950/60 to-slate-900/60 border border-indigo-500/20 text-indigo-50 rounded-2xl rounded-tl-sm hover:border-indigo-500/40'
                      }`}>
                        {item.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'learning' && (
              <LearningMode />
          )}

        </main>

        {/* SYSTEM INSTRUCTION MODAL */}
        {isSystemPromptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="glass-panel w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col border border-white/10 relative overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh]">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500"></div>
                
                <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-slate-900/50 shrink-0">
                  <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-purple-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                    System Prompt Configuration
                  </h3>
                  <button onClick={() => setIsSystemPromptOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar flex flex-col md:flex-row gap-6">
                    {/* Left: Modules */}
                    <div className="w-full md:w-1/3 shrink-0">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Prompt Modules</h4>
                        <div className="space-y-2">
                           {Object.entries(PROMPT_MODULES).map(([key, module]) => (
                               <label key={key} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-slate-800/30 hover:bg-slate-800/60 cursor-pointer transition-colors group">
                                  <span className="text-sm font-medium text-slate-300 group-hover:text-white">{module.label}</span>
                                  <div className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      className="sr-only peer"
                                      checked={promptConfig.modules[key as keyof typeof promptConfig.modules]}
                                      onChange={(e) => setPromptConfig({
                                          ...promptConfig,
                                          modules: { ...promptConfig.modules, [key]: e.target.checked }
                                      })}
                                    />
                                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                                  </div>
                               </label>
                           ))}
                        </div>
                    </div>

                    {/* Right: Custom Instruction */}
                    <div className="flex-1 flex flex-col">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Custom Instructions</h4>
                        <textarea 
                            value={promptConfig.customInstruction}
                            onChange={(e) => setPromptConfig({ ...promptConfig, customInstruction: e.target.value })}
                            className="flex-1 w-full bg-slate-950 border border-white/10 rounded-xl p-4 text-sm font-mono text-slate-300 focus:ring-1 focus:ring-purple-500/50 outline-none resize-none leading-relaxed"
                            placeholder="Enter specific behavioral instructions here. These will be appended to the active modules..."
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-white/5 bg-slate-900/50 flex justify-end gap-3">
                     <button 
                        onClick={() => setIsSystemPromptOpen(false)}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase text-xs rounded-lg shadow-lg transition-all"
                     >
                        Apply Configuration
                     </button>
                </div>
             </div>
          </div>
        )}

        {/* Profile Editor */}
        {isEditorOpen && editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col border border-white/10 relative overflow-hidden animate-in zoom-in-95 duration-300 max-h-[85vh] md:max-h-[90vh]">
              {/* Modal Header Glow */}
              <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500"></div>

              <div className="px-4 py-3 md:px-6 md:py-4 border-b border-white/5 flex justify-between items-center bg-slate-900/50 shrink-0">
                <h3 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-cyan-500/30 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-cyan-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                  </div>
                  <span className="text-cyan-50">Tune Voice Profile</span>
                </h3>
                <button onClick={() => setIsEditorOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleSaveProfile} className="p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-950/50 overflow-y-auto custom-scrollbar flex-1 overscroll-contain">
                
                {/* Basic Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div>
                        <FormLabel label="Profile Name" hint="Unique identifier." />
                        <input 
                            type="text" 
                            required
                            value={editingProfile.name}
                            onChange={(e) => setEditingProfile({...editingProfile, name: e.target.value})}
                            className="w-full glass-input rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500/50"
                        />
                    </div>
                    <div>
                        <FormLabel label="Base Voice" hint={SETTING_HINTS.voiceName} />
                        <select 
                            value={editingProfile.voiceName}
                            onChange={(e) => setEditingProfile({...editingProfile, voiceName: e.target.value as VoiceName})}
                            className="w-full glass-input rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500/50"
                        >
                            {['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Orus', 'Aoede'].map(v => (
                                <option key={v} value={v} className="bg-slate-900">{v}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="border-t border-white/5 my-2"></div>

                {/* Pace (Now a Slider) */}
                <div>
                    <div className="flex justify-between items-baseline mb-2">
                        <FormLabel label="Speaking Pace" hint={SETTING_HINTS.pace} />
                        <span className="text-xs font-mono text-cyan-400">{editingProfile.pace}x</span>
                    </div>
                    <input 
                        type="range" min="0.85" max="1.15" step="0.05"
                        value={editingProfile.pace}
                        onChange={(e) => setEditingProfile({...editingProfile, pace: parseFloat(e.target.value)})}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="flex justify-between text-[9px] text-slate-500 mt-1 uppercase font-mono">
                        <span>Slow</span>
                        <span>Normal</span>
                        <span>Fast</span>
                    </div>
                </div>

                {/* Sliders Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {[
                        { label: 'Warmth', field: 'warmth', color: 'cyan', hint: SETTING_HINTS.warmth },
                        { label: 'Firmness', field: 'firmness', color: 'indigo', hint: SETTING_HINTS.firmness },
                        { label: 'Energy', field: 'energy', color: 'purple', hint: SETTING_HINTS.energy },
                        { label: 'Brevity', field: 'brevity', color: 'green', hint: SETTING_HINTS.brevity },
                    ].map(slider => (
                        <div key={slider.field}>
                             <div className="flex justify-between items-baseline mb-2">
                                 <FormLabel label={slider.label} hint={slider.hint} />
                                 <span className={`text-xs font-mono text-${slider.color}-400`}>{(editingProfile as any)[slider.field]}/10</span>
                             </div>
                             <input 
                                type="range" min="0" max="10" step="1"
                                value={(editingProfile as any)[slider.field]}
                                onChange={(e) => setEditingProfile({...editingProfile, [slider.field]: parseInt(e.target.value)})}
                                className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-${slider.color}-500`}
                             />
                        </div>
                    ))}
                </div>

                {/* Advanced Sliders */}
                 <div>
                     <div className="flex justify-between items-baseline mb-2">
                         <FormLabel label="Pause Density" hint={SETTING_HINTS.pauseDensity} />
                         <span className="text-xs font-mono text-yellow-400">{editingProfile.pauseDensity}/10</span>
                     </div>
                     <input 
                        type="range" min="0" max="10" step="1"
                        value={editingProfile.pauseDensity}
                        onChange={(e) => setEditingProfile({...editingProfile, pauseDensity: parseInt(e.target.value)})}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                     />
                </div>

                {/* Toggles Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Disfluencies', field: 'disfluency', options: ['off', 'low'], hint: SETTING_HINTS.disfluency },
                        { label: 'Breathiness', field: 'breathiness', options: ['off', 'subtle'], hint: SETTING_HINTS.breathiness },
                        { label: 'Laughter', field: 'laughter', options: ['off', 'rare'], hint: SETTING_HINTS.laughter },
                    ].map(toggle => (
                        <div key={toggle.field}>
                             <FormLabel label={toggle.label} hint={toggle.hint} />
                             <div className="flex gap-2">
                                {toggle.options.map((opt) => (
                                    <button
                                        key={opt} type="button"
                                        onClick={() => setEditingProfile({...editingProfile, [toggle.field]: opt as any})}
                                        className={`flex-1 py-1.5 rounded text-xs font-bold uppercase border ${
                                            (editingProfile as any)[toggle.field] === opt ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-800 border-white/5 text-slate-500'
                                        }`}
                                    >{opt}</button>
                                ))}
                             </div>
                        </div>
                    ))}
                </div>
              </form>

              {/* Footer */}
              <div className="p-4 md:p-6 border-t border-white/5 bg-slate-900/80 backdrop-blur-md flex justify-between items-center shrink-0">
                  <div className="flex gap-3">
                      <button type="button" onClick={handlePreviewProfile} disabled={isPreviewing} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold uppercase rounded-lg border border-white/10">
                         {isPreviewing ? 'Testing...' : 'Test'}
                      </button>
                      {profiles.length > 1 && (
                          <button type="button" onClick={() => handleDeleteProfile(editingProfile.id)} className="px-4 py-2 text-red-400 hover:text-red-300 text-xs font-bold uppercase">
                            Delete
                          </button>
                      )}
                  </div>
                  
                  <div className="flex gap-3">
                      <button type="button" onClick={() => setIsEditorOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold uppercase">
                        Cancel
                      </button>
                      <button onClick={handleSaveProfile} className="px-6 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold uppercase rounded-lg shadow-lg">
                        Save
                      </button>
                  </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default App;
