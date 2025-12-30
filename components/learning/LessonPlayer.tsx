
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { PodcastEpisode, PodcastChapter, ConnectionState } from '../../types';
import { base64ToFloat32, createAudioBuffer } from '../../utils/audioUtils';
import { useGeminiLive } from '../../hooks/useGeminiLive';
import { Visualizer } from '../Visualizer';
import { AudioSessionManager } from '../../services/AudioSessionManager';
import { ProducerProvider } from '../../context/ProducerContext';
import { ProducerPanel } from '../producer/ProducerPanel';
import { ChapterManager } from './ChapterManager';
import { AudioDashboard } from '../diagnostics/AudioDashboard';
import { useLearningAI } from '../../hooks/useLearningAI';

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface PodcastPlayerProps {
  episode: PodcastEpisode;
  sourceContext: string;
  onBack: () => void;
  onAskQuestion?: (question: string) => Promise<string | null>;
}

// Wrapper to provide ProducerContext
export const LessonPlayer: React.FC<PodcastPlayerProps> = (props) => (
    <ProducerProvider>
        <LessonPlayerInternal {...props} />
    </ProducerProvider>
);

const LessonPlayerInternal: React.FC<PodcastPlayerProps> = ({ episode, sourceContext, onBack, onAskQuestion }) => {
  // --- Podcast Audio State ---
  const [isPlaying, setIsPlaying] = useState(false);
  // Ref to track playing state without triggering re-renders in callbacks
  const isPlayingRef = useRef(false);
  
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [chapters, setChapters] = useState<PodcastChapter[]>(episode.chapters || []);
  
  // --- View State ---
  const [showStudyPanel, setShowStudyPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'chapters' | 'producer' | 'glossary'>('chapters');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  // --- Audio Refs (Podcast) ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null); // New Gain Node for Fading
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const animationRef = useRef<number>(0);
  
  // Services
  const sessionManager = useRef(AudioSessionManager.getInstance()).current;
  const { generateChapters } = useLearningAI();

  // --- Voice Tutor Hook (Live API) ---
  const tutorSystemInstruction = `
    You are an AI Tutor discussing a specific lesson titled "${episode.title}".
    SOURCE MATERIAL FOR LESSON:
    ${sourceContext.substring(0, 20000)}
  `;

  const { 
    connect: connectTutor, 
    disconnect: disconnectTutor, 
    connectionState: tutorConnectionState,
    volume: tutorVolume,
    transcripts: liveTranscripts
  } = useGeminiLive({
    systemInstruction: tutorSystemInstruction,
    voiceName: 'Kore'
  });

  // --- Audio Implementation ---

  // Helper to update state and ref together
  const setPlayingState = (playing: boolean) => {
      setIsPlaying(playing);
      isPlayingRef.current = playing;
  };

  const playAudioInternal = useCallback(async () => {
      if (!audioContextRef.current || !bufferRef.current) return;
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      if (sourceRef.current) {
          try { sourceRef.current.stop(); } catch(e){}
      }

      const source = ctx.createBufferSource();
      source.buffer = bufferRef.current;
      
      // Safety: Ensure gain node exists and is connected
      if (!gainNodeRef.current) {
          gainNodeRef.current = ctx.createGain();
          gainNodeRef.current.connect(ctx.destination);
      }
      
      try {
          source.connect(gainNodeRef.current);
      } catch (err) {
          console.error("Audio Connection Error:", err);
          // Recovery: Recreate gain node if connection fails (likely context mismatch)
          gainNodeRef.current = ctx.createGain();
          gainNodeRef.current.connect(ctx.destination);
          source.connect(gainNodeRef.current);
      }
      
      // Strict Clamping for Offset
      let offset = pauseTimeRef.current;
      if (!Number.isFinite(offset)) offset = 0;
      offset = Math.max(0, Math.min(offset, bufferRef.current.duration));
      pauseTimeRef.current = offset;

      try {
          source.start(0, offset);
          startTimeRef.current = ctx.currentTime - offset;
          
          sourceRef.current = source;
          source.onended = () => {
              // Only reset if we naturally reached the end
              if (sourceRef.current === source) {
                  // Check if we are at the end
                  if (ctx.currentTime - startTimeRef.current >= (bufferRef.current?.duration || 0) - 0.5) {
                     setPlayingState(false);
                     sessionManager.reportPodcastStopped();
                     pauseTimeRef.current = 0;
                     setProgress(0);
                     setCurrentTime(0);
                  }
              }
          };
          
          setPlayingState(true);
          
          const updateProgress = () => {
              // Use refs for loop to access fresh state without closure issues
              if (ctx && bufferRef.current && sourceRef.current && isPlayingRef.current) {
                  const elapsed = ctx.currentTime - startTimeRef.current;
                  const validElapsed = Math.max(0, Math.min(elapsed, bufferRef.current.duration));
                  
                  setCurrentTime(validElapsed);
                  const pct = (validElapsed / bufferRef.current.duration) * 100;
                  setProgress(pct);
                  
                  if (validElapsed < bufferRef.current.duration) {
                      animationRef.current = requestAnimationFrame(updateProgress);
                  }
              }
          };
          updateProgress();
      } catch (e) {
          console.error("Audio Playback Failed:", e);
          setPlayingState(false);
      }
  }, [sessionManager]);

  const pauseAudioInternal = useCallback(() => {
      if (sourceRef.current && audioContextRef.current) {
          try {
              sourceRef.current.stop();
          } catch (e) {
              console.warn("Stop failed", e);
          }
          sourceRef.current = null;
          
          const ctx = audioContextRef.current;
          const elapsed = ctx.currentTime - startTimeRef.current;
          pauseTimeRef.current = Math.max(0, elapsed);
          
          setPlayingState(false);
          cancelAnimationFrame(animationRef.current);
      }
  }, []);

  // 1. Initialize Audio Engine (Only runs when audio source changes)
  useEffect(() => {
    const initAudio = async () => {
        if (!episode.audioBase64) return;
        
        // Close existing context if any
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
            gainNodeRef.current = null;
        }

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        gainNodeRef.current = gain;

        try {
            const float32 = base64ToFloat32(episode.audioBase64);
            const buffer = createAudioBuffer(ctx, float32, 24000); 
            bufferRef.current = buffer;
            setDuration(buffer.duration);
        } catch (e) {
            console.error("Failed to decode audio", e);
        }
    };
    initAudio();

    return () => {
        if (sourceRef.current) try { sourceRef.current.stop(); } catch(e){}
        if (audioContextRef.current) audioContextRef.current.close();
        
        // Nullify to prevent stale access
        audioContextRef.current = null;
        gainNodeRef.current = null;
        bufferRef.current = null;
        sourceRef.current = null;
        
        cancelAnimationFrame(animationRef.current);
    };
  }, [episode.audioBase64]);

  // 2. Register with Session Manager (Runs once on mount)
  useEffect(() => {
    sessionManager.registerPodcast({
        play: playAudioInternal,
        pause: pauseAudioInternal,
        getIsPlaying: () => isPlayingRef.current, 
        getCurrentTime: () => pauseTimeRef.current,
        fadeTo: async (volume: number, duration: number) => {
            if (gainNodeRef.current && audioContextRef.current && audioContextRef.current.state === 'running') {
                const ctx = audioContextRef.current;
                const gain = gainNodeRef.current.gain;
                try {
                    gain.cancelScheduledValues(ctx.currentTime);
                    gain.setValueAtTime(gain.value, ctx.currentTime);
                    gain.linearRampToValueAtTime(volume, ctx.currentTime + duration);
                    await new Promise(r => setTimeout(r, duration * 1000));
                } catch (e) {
                    console.warn("Fade failed", e);
                }
            }
        }
    });

    return () => {
        disconnectTutor();
        sessionManager.unregisterPodcast();
    };
  }, [sessionManager, playAudioInternal, pauseAudioInternal, disconnectTutor]);

  const togglePlay = () => {
      if (isPlaying) {
          pauseAudioInternal();
          sessionManager.reportPodcastStopped();
      } else {
          const allowed = sessionManager.requestPodcastStart();
          if (allowed) {
              playAudioInternal();
          }
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newPct = parseFloat(e.target.value);
      setProgress(newPct);
      if (!bufferRef.current) return;
      
      const newTime = (newPct / 100) * bufferRef.current.duration;
      pauseTimeRef.current = Math.max(0, Math.min(newTime, bufferRef.current.duration));
      setCurrentTime(pauseTimeRef.current);
      
      if (isPlaying) {
          if (sourceRef.current) try { sourceRef.current.stop(); } catch(e){}
          playAudioInternal(); 
      }
  };

  const jumpToTime = (time: number) => {
      if (!bufferRef.current) return;
      pauseTimeRef.current = Math.max(0, Math.min(time, bufferRef.current.duration));
      setCurrentTime(pauseTimeRef.current);
      setProgress((pauseTimeRef.current / bufferRef.current.duration) * 100);
      
      if (isPlaying) {
          if (sourceRef.current) try { sourceRef.current.stop(); } catch(e){}
          playAudioInternal();
      }
  };

  const handleGenerateChapters = async () => {
      if (!bufferRef.current) return;
      const newChapters = await generateChapters(sourceContext, bufferRef.current.duration);
      if (newChapters.length > 0) setChapters(newChapters);
  };

  return (
    <div className={`h-[100dvh] w-full flex flex-col md:flex-row gap-4 md:gap-6 p-2 md:p-6 max-w-7xl mx-auto relative overflow-hidden transition-all duration-500 ${showStudyPanel ? '' : 'items-center justify-center'}`}>
      
      {showDiagnostics && <AudioDashboard onClose={() => setShowDiagnostics(false)} />}

      {/* Mobile Top Bar */}
      {!showStudyPanel && (
        <div className="md:hidden flex items-center justify-between mb-1 w-full shrink-0">
            <button onClick={onBack} className="text-skin-muted p-2">Back</button>
            <span className="text-xs font-bold text-skin-muted uppercase tracking-widest">Now Playing</span>
            <button onClick={() => setShowDiagnostics(true)} className="p-2 text-skin-muted">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                </svg>
            </button>
        </div>
      )}

      {/* LEFT PANEL: Player */}
      <div className={`flex flex-col transition-all duration-500 shrink-0 ${
          showStudyPanel 
            ? 'w-full md:w-[400px] h-auto md:h-full gap-2 md:gap-6' 
            : 'w-full max-w-md gap-4 md:gap-6'
      }`}>
        
        <div className="hidden md:flex justify-between items-center mb-2">
             <button onClick={onBack} className="text-skin-muted hover:text-skin-text flex items-center gap-2 text-sm font-medium">
                Back to Dashboard
            </button>
            <button onClick={() => setShowDiagnostics(true)} className="text-[10px] text-skin-muted hover:text-skin-accent font-bold uppercase tracking-widest flex items-center gap-2">
                 Diagnostics
                 <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            </button>
        </div>
        
        <div className={`glass-panel rounded-3xl border border-skin-border relative overflow-hidden shadow-2xl flex flex-col items-center text-center transition-all duration-500 ${
            showStudyPanel 
                ? 'p-3 md:p-6 flex-row md:flex-col gap-3 md:gap-0' 
                : 'p-6 md:p-8'
        }`}>
             
             {/* Cover Art / Visualizer Area */}
             <div className={`relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 shrink-0 transition-all bg-skin-base ${
                 showStudyPanel 
                    ? 'hidden md:block w-32 h-32 md:w-48 md:h-48 md:mb-4' 
                    : 'w-64 h-64 mb-8'
             }`}>
                 {tutorConnectionState === ConnectionState.CONNECTED ? (
                     <>
                        <Visualizer volume={tutorVolume} isActive={true} />
                        <div className="absolute top-2 left-2 bg-red-500/20 text-red-400 border border-red-500/50 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider animate-pulse">
                            Live Studio
                        </div>
                     </>
                 ) : (
                     episode.coverImageBase64 ? (
                         <img src={`data:image/png;base64,${episode.coverImageBase64}`} className="w-full h-full object-cover" />
                     ) : (
                         <div className="w-full h-full bg-skin-surface flex items-center justify-center text-skin-muted">Podcast</div>
                     )
                 )}
             </div>

             {/* Player Content */}
             <div className={`w-full flex flex-col justify-center ${showStudyPanel ? 'text-left md:text-center' : 'text-center'}`}>
                <div className={`space-y-1 w-full ${showStudyPanel ? 'mb-2 md:mb-4' : 'mb-8'}`}>
                    <h2 className={`font-bold text-skin-text leading-tight line-clamp-2 ${showStudyPanel ? 'text-sm md:text-xl' : 'text-xl'}`}>
                        {episode.title}
                    </h2>
                    {!showStudyPanel && <p className="text-skin-muted text-xs uppercase tracking-widest">{episode.type} Episode</p>}
                </div>
                
                {/* Progress */}
                <div className="w-full space-y-2 mb-2 md:mb-6">
                    <div className="group relative w-full h-1.5 bg-skin-surface rounded-full cursor-pointer">
                        <div className="absolute inset-y-0 left-0 bg-skin-accent rounded-full" style={{ width: `${progress}%` }}></div>
                        <input type="range" min="0" max="100" step="0.1" value={progress} onChange={handleSeek} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-skin-muted">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>
                
                {/* Controls */}
                <div className={`flex items-center gap-4 md:gap-8 ${showStudyPanel ? 'justify-start md:justify-center' : 'justify-center'}`}>
                    
                    <button className="text-skin-muted hover:text-skin-text" onClick={() => handleSeek({ target: { value: Math.max(0, progress - 5) } } as any)}>
                        <span className="hidden md:inline">-10s</span>
                        <span className="md:hidden">10s</span>
                    </button>
                    
                    <button 
                        onClick={togglePlay}
                        className={`rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg ${
                            showStudyPanel ? 'w-10 h-10 md:w-16 md:h-16' : 'w-16 h-16'
                        } ${
                            episode.type === 'Teaching' ? 'bg-skin-secondary shadow-skin-secondary/40' : 'bg-skin-accent shadow-skin-accent/40'
                        }`}
                    >
                        {isPlaying ? (
                            <svg className={`${showStudyPanel ? 'w-4 h-4 md:w-6 md:h-6' : 'w-6 h-6'} text-skin-base`} fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
                        ) : (
                            <svg className={`${showStudyPanel ? 'w-4 h-4 md:w-6 md:h-6' : 'w-6 h-6'} text-skin-base ml-1`} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        )}
                    </button>

                    <button className="text-skin-muted hover:text-skin-text" onClick={() => handleSeek({ target: { value: Math.min(100, progress + 5) } } as any)}>
                        <span className="hidden md:inline">+10s</span>
                        <span className="md:hidden">10s</span>
                    </button>

                    {showStudyPanel && (
                         <button 
                             onClick={() => setShowStudyPanel(false)}
                             className="md:hidden ml-auto text-xs font-bold text-skin-muted uppercase border border-skin-border px-3 py-1.5 rounded-full"
                         >
                             Close
                         </button>
                    )}
                </div>

                <div className={`mt-6 ${showStudyPanel ? 'hidden md:block' : 'block'}`}>
                   <button 
                       onClick={() => setShowStudyPanel(!showStudyPanel)}
                       className="text-xs font-bold text-skin-muted hover:text-skin-text uppercase tracking-widest border border-skin-border px-4 py-2 rounded-full hover:bg-skin-surface-hover transition-colors"
                   >
                       {showStudyPanel ? 'Hide Tools' : 'Open Production Tools'}
                   </button>
                </div>
             </div>
        </div>
      </div>

      {/* RIGHT PANEL: Enterprise Tools */}
      {showStudyPanel && (
        <div className="flex-1 w-full flex flex-col glass-panel rounded-3xl border border-skin-border overflow-hidden shadow-xl min-h-0 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Tabs */}
            <div className="flex border-b border-skin-border bg-skin-surface shrink-0">
                <button 
                    onClick={() => setActiveTab('chapters')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'chapters' ? 'text-skin-text border-b-2 border-skin-secondary' : 'text-skin-muted hover:text-skin-text'}`}
                >
                    Chapters
                </button>
                <button 
                    onClick={() => setActiveTab('producer')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'producer' ? 'text-skin-text border-b-2 border-red-500' : 'text-skin-muted hover:text-skin-text'}`}
                >
                    <div className={`w-2 h-2 rounded-full ${tutorConnectionState === ConnectionState.CONNECTED ? 'bg-red-500 animate-pulse' : 'bg-skin-muted'}`}></div>
                    Producer
                </button>
                <button 
                    onClick={() => setActiveTab('glossary')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'glossary' ? 'text-skin-text border-b-2 border-skin-accent' : 'text-skin-muted hover:text-skin-text'}`}
                >
                    Terms
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto bg-skin-base/30 relative custom-scrollbar">
                
                {activeTab === 'chapters' && (
                    <ChapterManager 
                        chapters={chapters} 
                        currentTime={currentTime} 
                        duration={duration} 
                        onSeek={jumpToTime}
                        onGenerateMore={handleGenerateChapters}
                    />
                )}

                {activeTab === 'producer' && (
                    <ProducerPanel 
                        startAudio={async () => {
                            await connectTutor();
                        }}
                        stopAudio={() => {
                            disconnectTutor();
                        }}
                        liveTranscripts={liveTranscripts}
                    />
                )}

                {activeTab === 'glossary' && episode.blueprint?.glossary && (
                    <div className="p-4 md:p-6 grid grid-cols-1 gap-4 pb-20">
                        {episode.blueprint.glossary.map((term, i) => (
                            <div key={i} className="p-4 bg-skin-surface rounded-xl border border-skin-border">
                                <div className="text-sm font-bold text-skin-accent mb-1">{term.term}</div>
                                <div className="text-xs text-skin-text leading-relaxed">{term.definition}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};
