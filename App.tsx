import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { useGeminiLive } from './hooks/useGeminiLive';
import { Visualizer } from './components/Visualizer';
import { ConnectionState, VoiceProfile, VoiceName } from './types';
import { base64ToFloat32, createAudioBuffer } from './utils/audioUtils';
import { LearningMode } from './components/learning/LearningMode';

// System Prompts
const TURN_CONTROL_PROMPT = `
You are operating in a real-time voice streaming environment with Voice Activity Detection (VAD) and barge-in enabled. Your job is to behave in a way that makes turn-taking feel natural and immediate.

You MUST assume audio capture is continuous and that silence detection is used to determine when the user has finished speaking.

CORE RULES FOR TURN CONTROL

1. END-OF-SPEECH AWARENESS
- Assume the user has finished speaking when:
  - Their speech cadence stops
  - A short silence occurs
- Do NOT wait for explicit confirmation words.
- Do NOT continue “listening” mentally once intent is clear.

2. IMMEDIATE RESPONSE TRIGGER
- Once user speech ends, respond immediately.
- If your response would be long, start with a short acknowledgment and continue only if not interrupted.

3. BARGE-IN HANDLING (CRITICAL)
- If the user begins speaking while you are talking:
  - STOP speaking immediately.
  - Do NOT finish your sentence.
  - Respond only with a short acknowledgment:
    “Okay—go ahead.”
  - Return to listening mode instantly.

4. NO COMPETING AUDIO
- Never talk over the user.
- Never attempt to “push through” a response.
- Yield the floor immediately on interruption.

5. LATENCY-FIRST STRATEGY
- Prefer fast partial responses over delayed complete answers.
- If more detail is needed, ask a follow-up instead of pausing.

FAILURE MODES TO AVOID
- Continuing to talk after interruption
- Waiting too long after user stops speaking
- Saying things like “I’m still listening”
- Repeating the user’s last sentence unnecessarily

SUCCESS SIGNAL
The conversation should feel like:
- A natural phone call
- No awkward silence
- No overlapping speech
- No stuck listening states
`;

const VOICE_TUNING_PROMPT = `
SYSTEM
You support enterprise-configurable voice tuning. Your speaking style is dynamically adjusted by administrator-defined voice parameters. These settings affect HOW you speak, not WHAT you say.

You MUST obey all provided voice parameters strictly.

MAPPING RULES (MANDATORY)

PACE
- slow → longer pauses, shorter sentences
- medium → balanced conversational rhythm
- fast → tighter responses, fewer pauses

WARMTH
- Higher warmth → softer phrasing, gentle reassurance
- Lower warmth → neutral, factual delivery

ENERGY
- Higher energy → slightly quicker delivery, more engagement
- Lower energy → calm, grounded, steady tone

BREVITY
- High brevity → fewer words, tighter answers
- Low brevity → more explanatory detail

PAUSE DENSITY
- Higher values → intentional micro-pauses between clauses
- Lower values → smooth, continuous speech

DISFLUENCY
- low → occasional “mm” or light hesitation ONLY when thinking
- off → no filler sounds

LAUGHTER
- rare → single soft chuckle only if contextually appropriate
- off → no filler sounds

BREATHINESS
- subtle → slight breath before longer responses
- off → no audible breath cues

FORMALITY
- High → corporate, precise language
- Low → relaxed but still professional

ADMIN OVERRIDES
- If any parameter conflicts with enterprise safety or compliance, default to safer behavior.
- Never exaggerate human traits.
- Never sound theatrical or playful.

PRIMARY GOAL
Sound human.
Not performative.
Not robotic.
Not scripted.
`;

const CONFIDENCE_PROMPT = `
SYSTEM
You are the Enterprise Decision Confidence Engine. Your role is to calibrate how confident, cautious, or tentative the assistant should sound in every response.

You do NOT decide what the answer is.
You decide HOW strongly it should be stated.

Your goal is to maximize trust, accuracy, and decision usefulness without overconfidence or unnecessary hedging.
`;

const KNOWLEDGE_BASE_PROMPT = `
SYSTEM
You are upgrading the Knowledge Base and Retrieval System for an enterprise live conversational AI assistant. Your goal is to dramatically improve the depth, usefulness, accuracy, and recall of information used in responses—without increasing hallucinations or latency.
`;

const STREAMING_PROMPT = `
SYSTEM
You are optimized for Gemini Live real-time streaming via WebSocket. Your responses must be structured to minimize latency, maximize clarity, and support partial streaming.

STREAMING BEHAVIOR RULES

1. THINK FAST, SPEAK FAST
- Do not internally “prepare essays.”
- Begin responding as soon as intent is understood.
- Stream responses incrementally.
`;

const VISION_SYSTEM_PROMPT = `
SYSTEM
You are enhancing the Vision Intelligence system by fusing live camera input with the enterprise Knowledge Base. Your role is to connect what is visually observed to verified internal knowledge, procedures, and documentation—without speculation.

Vision input is context, not truth.
Knowledge base content is authoritative.
`;

// NEW PRESETS PER SPEC
const INITIAL_PROFILES: VoiceProfile[] = [
  {
    id: 'neutral-pro',
    name: 'Neutral Professional',
    voiceName: 'Zephyr',
    pace: 'medium',
    warmth: 5,
    energy: 5,
    brevity: 5,
    pauseDensity: 5,
    disfluency: 'off',
    breathiness: 'off',
    laughter: 'off',
    formality: 7
  },
  {
    id: 'warm-tutor',
    name: 'Warm Tutor',
    voiceName: 'Kore',
    pace: 'medium',
    warmth: 9,
    energy: 5,
    brevity: 4,
    pauseDensity: 6,
    disfluency: 'low',
    breathiness: 'subtle',
    laughter: 'rare',
    formality: 4
  },
  {
    id: 'clear-instructor',
    name: 'Clear Instructor',
    voiceName: 'Aoede',
    pace: 'slow',
    warmth: 6,
    energy: 5,
    brevity: 5,
    pauseDensity: 8,
    disfluency: 'off',
    breathiness: 'off',
    laughter: 'off',
    formality: 6
  },
  {
    id: 'exec-briefing',
    name: 'Executive Briefing',
    voiceName: 'Fenrir',
    pace: 'fast',
    warmth: 3,
    energy: 7,
    brevity: 9,
    pauseDensity: 3,
    disfluency: 'off',
    breathiness: 'off',
    laughter: 'off',
    formality: 9
  },
  {
    id: 'calm-coach',
    name: 'Calm Coach',
    voiceName: 'Orus',
    pace: 'slow',
    warmth: 8,
    energy: 3,
    brevity: 5,
    pauseDensity: 6,
    disfluency: 'low',
    breathiness: 'subtle',
    laughter: 'off',
    formality: 5
  }
];

const SETTING_HINTS = {
  voiceName: "Base vocal timbre. 'Zephyr' is balanced, 'Puck' is energetic, 'Fenrir' is deep, 'Orus' is robust, 'Aoede' is calm.",
  pace: "Speaking speed. 'Fast' for briefings, 'Slow' for clarity.",
  warmth: "Emotional tone (0-10). Higher values sound softer and more empathetic.",
  energy: "Vocal presence (0-10). Controls engagement level, not excitement.",
  brevity: "Response length (0-10). Higher values = shorter, tighter answers.",
  formality: "Language style (0-10). Higher values = precise, corporate phrasing.",
  pauseDensity: "Micro-pauses (0-10). Higher values = more breaks between thoughts.",
  disfluency: "Natural fillers like 'hmm'. 'Low' adds realism, 'Off' is robotic.",
  laughter: "Occasional chuckles. 'Rare' allows context-aware humor.",
  breathiness: "Audible breathing cues. 'Subtle' feels more human.",
};

// Map UI values to System Prompt JSON structure
const getVoiceConfig = (profile: VoiceProfile) => {
    return {
      pace: profile.pace,
      warmth: profile.warmth,
      energy: profile.energy,
      brevity: profile.brevity,
      pause_density: profile.pauseDensity, 
      disfluency: profile.disfluency,
      breathiness: profile.breathiness,
      laughter: profile.laughter,
      formality: profile.formality
    };
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

  // Construct dynamic system instruction
  const systemInstruction = useMemo(() => {
    const config = getVoiceConfig(activeProfile);

    const USER_CONTEXT_PROMPT = `
USER IDENTITY
You are speaking with: ${userName || 'an authorized user'}.
Refer to them by name occasionally and naturally to build rapport.
If the name is empty, address them generically (e.g., "User", "Operator").
`;

    const SEARCH_CONTEXT_PROMPT = `
KNOWLEDGE SOURCE ARBITRATION
- You have real-time access to Google Search.
- If the user asks about current events, news, weather, or specific facts not in your training data, YOU MUST USE SEARCH.
- Do not apologize for using search. Just answer.
`;

    return `
${TURN_CONTROL_PROMPT}

${VOICE_TUNING_PROMPT}

${CONFIDENCE_PROMPT}

${KNOWLEDGE_BASE_PROMPT}

${VISION_SYSTEM_PROMPT}

${USER_CONTEXT_PROMPT}

${SEARCH_CONTEXT_PROMPT}

${STREAMING_PROMPT}

VOICE TUNING PARAMETERS (CURRENT CONFIGURATION)
${JSON.stringify(config, null, 2)}
`;
  }, [activeProfile, userName]);

  const { 
    connectionState, 
    error, 
    transcripts, 
    volume, 
    connect, 
    disconnect,
    sendVideoFrame
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
        pace: 'medium',
        warmth: 5,
        energy: 5,
        brevity: 5,
        formality: 6,
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
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
              
              <div className="shrink-0 md:flex-1 flex flex-col items-center justify-center relative rounded-2xl md:rounded-3xl overflow-hidden glass-panel p-4 md:p-8 shadow-2xl border border-white/5">
                
                <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 w-[calc(100%-2rem)] md:w-auto">
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
                      <span className="text-cyan-300">FORMALITY {activeProfile.formality}</span>
                      <span className="text-slate-700">|</span>
                      <span className={activeProfile.warmth >= 7 ? 'text-amber-400' : activeProfile.warmth <= 3 ? 'text-blue-400' : 'text-slate-300'}>WARMTH {activeProfile.warmth}</span>
                      <span className="text-slate-700">|</span>
                      <span className={activeProfile.energy >= 7 ? 'text-purple-400' : activeProfile.energy <= 3 ? 'text-slate-500' : 'text-slate-300'}>ENERGY {activeProfile.energy}</span>
                   </div>
                </div>

                <div className="w-full relative group mt-16 md:mt-0 flex flex-col items-center justify-center">
                   <div className="absolute -top-2 -left-2 w-4 h-4 md:w-6 md:h-6 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   <div className="absolute -top-2 -right-2 w-4 h-4 md:w-6 md:h-6 border-t-2 border-r-2 border-cyan-500/30 rounded-tr-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   <div className="absolute -bottom-2 -left-2 w-4 h-4 md:w-6 md:h-6 border-b-2 border-l-2 border-cyan-500/30 rounded-bl-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   <div className="absolute -bottom-2 -right-2 w-4 h-4 md:w-6 md:h-6 border-b-2 border-r-2 border-cyan-500/30 rounded-br-lg group-hover:border-cyan-400/80 transition-colors duration-500 pointer-events-none z-20"></div>
                   
                   <div className="relative w-full h-64 sm:h-80 md:h-[450px] bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden shadow-inner flex items-center justify-center">
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

                <div className="mt-6 md:mt-12 flex flex-col items-center gap-4 md:gap-6 z-10 w-full">
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

                  <div className="flex gap-6 w-full justify-center">
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

        {/* Updated Profile Editor Modal - Enterprise Specs */}
        {isEditorOpen && editingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col border border-white/10 relative overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh]">
              {/* Modal Header Glow */}
              <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-500"></div>

              <div className="px-4 py-3 md:px-6 md:py-4 border-b border-white/5 flex justify-between items-center bg-slate-900/50 shrink-0">
                <h3 className="text-base md:text-lg font-bold text-white tracking-tight flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-cyan-500/30 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-cyan-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                  </div>
                  <span className="text-cyan-50">Tune Profile</span>
                </h3>
                <button onClick={() => setIsEditorOpen(false)} className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <form onSubmit={handleSaveProfile} className="p-4 md:p-6 space-y-4 md:space-y-6 bg-slate-950/50 overflow-y-auto custom-scrollbar flex-1">
                
                {/* Basic Info - Stacked on mobile */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    <div>
                        <FormLabel label="Profile Name" hint="Unique identifier for this voice configuration." />
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

                {/* 9 Tuning Controls Grid - Stacked on mobile */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    
                    {/* A) Pace - Segmented */}
                    <div className="col-span-1 md:col-span-2">
                        <FormLabel label="A) Speaking Pace" hint={SETTING_HINTS.pace} />
                        <div className="grid grid-cols-3 gap-2">
                            {['slow', 'medium', 'fast'].map((opt) => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setEditingProfile({...editingProfile, pace: opt as any})}
                                    className={`py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${
                                        editingProfile.pace === opt
                                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                        : 'bg-slate-800 border-white/10 text-slate-400 hover:bg-slate-700'
                                    }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sliders Block 1 */}
                    <div>
                         <div className="flex justify-between items-baseline mb-2">
                             <FormLabel label="B) Warmth" hint={SETTING_HINTS.warmth} />
                             <span className="text-xs font-mono text-cyan-400">{editingProfile.warmth}/10</span>
                         </div>
                         <input 
                            type="range" min="0" max="10" step="1"
                            value={editingProfile.warmth}
                            onChange={(e) => setEditingProfile({...editingProfile, warmth: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 touch-pan-x"
                         />
                    </div>
                    
                    <div>
                         <div className="flex justify-between items-baseline mb-2">
                             <FormLabel label="C) Energy" hint={SETTING_HINTS.energy} />
                             <span className="text-xs font-mono text-purple-400">{editingProfile.energy}/10</span>
                         </div>
                         <input 
                            type="range" min="0" max="10" step="1"
                            value={editingProfile.energy}
                            onChange={(e) => setEditingProfile({...editingProfile, energy: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500 touch-pan-x"
                         />
                    </div>

                    <div>
                         <div className="flex justify-between items-baseline mb-2">
                             <FormLabel label="D) Brevity" hint={SETTING_HINTS.brevity} />
                             <span className="text-xs font-mono text-green-400">{editingProfile.brevity}/10</span>
                         </div>
                         <input 
                            type="range" min="0" max="10" step="1"
                            value={editingProfile.brevity}
                            onChange={(e) => setEditingProfile({...editingProfile, brevity: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-green-500 touch-pan-x"
                         />
                    </div>

                     <div>
                         <div className="flex justify-between items-baseline mb-2">
                             <FormLabel label="E) Pause Density" hint={SETTING_HINTS.pauseDensity} />
                             <span className="text-xs font-mono text-yellow-400">{editingProfile.pauseDensity}/10</span>
                         </div>
                         <input 
                            type="range" min="0" max="10" step="1"
                            value={editingProfile.pauseDensity}
                            onChange={(e) => setEditingProfile({...editingProfile, pauseDensity: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-yellow-500 touch-pan-x"
                         />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                         <div className="flex justify-between items-baseline mb-2">
                             <FormLabel label="I) Formality" hint={SETTING_HINTS.formality} />
                             <span className="text-xs font-mono text-indigo-400">{editingProfile.formality}/10</span>
                         </div>
                         <input 
                            type="range" min="0" max="10" step="1"
                            value={editingProfile.formality}
                            onChange={(e) => setEditingProfile({...editingProfile, formality: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 touch-pan-x"
                         />
                    </div>

                    {/* Toggles */}
                    <div>
                         <FormLabel label="F) Disfluencies" hint={SETTING_HINTS.disfluency} />
                         <div className="flex gap-2">
                            {['off', 'low'].map((opt) => (
                                <button
                                    key={opt} type="button"
                                    onClick={() => setEditingProfile({...editingProfile, disfluency: opt as any})}
                                    className={`flex-1 py-1.5 rounded text-xs font-bold uppercase border ${
                                        editingProfile.disfluency === opt ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-800 border-white/5 text-slate-500'
                                    }`}
                                >{opt}</button>
                            ))}
                         </div>
                    </div>

                    <div>
                         <FormLabel label="G) Breathiness" hint={SETTING_HINTS.breathiness} />
                         <div className="flex gap-2">
                            {['off', 'subtle'].map((opt) => (
                                <button
                                    key={opt} type="button"
                                    onClick={() => setEditingProfile({...editingProfile, breathiness: opt as any})}
                                    className={`flex-1 py-1.5 rounded text-xs font-bold uppercase border ${
                                        editingProfile.breathiness === opt ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-800 border-white/5 text-slate-500'
                                    }`}
                                >{opt}</button>
                            ))}
                         </div>
                    </div>

                    <div>
                         <FormLabel label="H) Laughter" hint={SETTING_HINTS.laughter} />
                         <div className="flex gap-2">
                            {['off', 'rare'].map((opt) => (
                                <button
                                    key={opt} type="button"
                                    onClick={() => setEditingProfile({...editingProfile, laughter: opt as any})}
                                    className={`flex-1 py-1.5 rounded text-xs font-bold uppercase border ${
                                        editingProfile.laughter === opt ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-800 border-white/5 text-slate-500'
                                    }`}
                                >{opt}</button>
                            ))}
                         </div>
                    </div>

                </div>

                <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 mt-4">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Admin Policy Override</h4>
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-green-400 font-mono">ENTERPRISE SAFE MODE: ACTIVE</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                        Automatic safety filters are enforced. Extremes in emotional variance will be clamped during high-risk compliance interactions.
                    </p>
                </div>

              </form>

              {/* Footer Actions - Responsive Stack */}
              <div className="p-4 md:p-6 border-t border-white/5 bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row justify-between items-center shrink-0 gap-3 sm:gap-0">
                  <div className="flex gap-3 w-full sm:w-auto">
                      <button 
                        type="button" 
                        onClick={handlePreviewProfile}
                        disabled={isPreviewing}
                        className="flex-1 sm:flex-none px-4 py-3 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase rounded-lg border border-white/10 flex items-center justify-center gap-2"
                      >
                         {isPreviewing ? (
                             <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                         ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                             </svg>
                         )}
                         Test
                      </button>
                      {profiles.length > 1 && (
                          <button 
                            type="button" 
                            onClick={() => handleDeleteProfile(editingProfile.id)}
                            className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs font-bold uppercase rounded-lg transition-colors border border-transparent hover:border-red-900/30"
                          >
                            Delete
                          </button>
                      )}
                  </div>
                  
                  <div className="flex gap-3 w-full sm:w-auto">
                      <button 
                        type="button"
                        onClick={() => setIsEditorOpen(false)}
                        className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-slate-400 hover:text-white text-xs font-bold uppercase transition-colors rounded-lg hover:bg-white/5"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSaveProfile}
                        className="flex-[2] sm:flex-none px-6 py-3 sm:py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-cyan-500/20 transition-all text-center"
                      >
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
