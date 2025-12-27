
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { PodcastEpisode, PodcastChapter, ConnectionState } from '../../types';
import { base64ToFloat32, createAudioBuffer } from '../../utils/audioUtils';
import { useGeminiLive } from '../../hooks/useGeminiLive';
import { Visualizer } from '../Visualizer';

interface PodcastPlayerProps {
  episode: PodcastEpisode;
  sourceContext: string;
  onBack: () => void;
  onAskQuestion?: (question: string) => Promise<string | null>;
}

export const LessonPlayer: React.FC<PodcastPlayerProps> = ({ episode, sourceContext, onBack, onAskQuestion }) => {
  // --- Podcast Audio State ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  // --- View State ---
  const [showStudyPanel, setShowStudyPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'chapters' | 'glossary' | 'talkback'>('chapters');
  const [isVoiceTutorActive, setIsVoiceTutorActive] = useState(false);
  
  // --- Text Tutor State ---
  const [tutorInput, setTutorInput] = useState('');
  const [tutorChat, setTutorChat] = useState<{role: 'user' | 'ai', text: string}[]>([
      { role: 'ai', text: "I'm analyzing the lesson. Ask me to clarify any concept or give more examples!" }
  ]);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Audio Refs (Podcast) ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const animationRef = useRef<number>(0);
  
  // --- Voice Tutor Hook (Live API) ---
  const tutorSystemInstruction = `
    You are an AI Tutor discussing a specific lesson titled "${episode.title}".
    
    SOURCE MATERIAL FOR LESSON:
    ${sourceContext.substring(0, 20000)}

    INSTRUCTIONS:
    - Answer user questions based STRICTLY on the source material provided above.
    - Be encouraging, concise, and educational.
    - If the user asks something not in the sources, admit it and suggest a related topic from the lesson.
    - Keep responses relatively short (under 30 seconds spoken) to allow for back-and-forth.
    - You are helpful, warm, and professional.
  `;

  const { 
    connect: connectTutor, 
    disconnect: disconnectTutor, 
    connectionState: tutorConnectionState,
    volume: tutorVolume,
    transcripts: tutorTranscripts
  } = useGeminiLive({
    systemInstruction: tutorSystemInstruction,
    voiceName: 'Kore' // Warm Tutor voice
  });

  const currentChapterIndex = useMemo(() => {
      if (!episode.chapters) return -1;
      return episode.chapters.findIndex((ch, i) => {
          const nextStart = episode.chapters![i+1]?.startTime || duration;
          return currentTime >= ch.startTime && currentTime < nextStart;
      });
  }, [currentTime, episode.chapters, duration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Initialize Podcast Audio
  useEffect(() => {
    const initAudio = async () => {
        if (!episode.audioBase64) return;
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        const float32 = base64ToFloat32(episode.audioBase64);
        const buffer = createAudioBuffer(ctx, float32, 24000); 
        bufferRef.current = buffer;
        setDuration(buffer.duration);
    };
    initAudio();

    return () => {
        if (sourceRef.current) sourceRef.current.stop();
        if (audioContextRef.current) audioContextRef.current.close();
        cancelAnimationFrame(animationRef.current);
        disconnectTutor(); // Ensure Live connection is closed
    };
  }, [episode]);

  // Handle Voice Tutor Activation
  const toggleVoiceTutor = () => {
      if (isVoiceTutorActive) {
          // Stop Tutor
          disconnectTutor();
          setIsVoiceTutorActive(false);
      } else {
          // Start Tutor
          // 1. Pause Podcast
          if (isPlaying) togglePlay();
          // 2. Connect Live
          connectTutor();
          setIsVoiceTutorActive(true);
      }
  };

  const togglePlay = () => {
      if (!audioContextRef.current || !bufferRef.current) return;
      
      // Prevent playing podcast if Tutor is active
      if (isVoiceTutorActive) {
          disconnectTutor();
          setIsVoiceTutorActive(false);
          // Small delay to let audio context switch cleanly? Not strictly needed but good UX to separate modes.
      }

      if (isPlaying) {
          if (sourceRef.current) {
              sourceRef.current.stop();
              sourceRef.current = null;
          }
          pauseTimeRef.current += audioContextRef.current.currentTime - startTimeRef.current;
          setIsPlaying(false);
          cancelAnimationFrame(animationRef.current);
      } else {
          const ctx = audioContextRef.current;
          if (ctx.state === 'suspended') ctx.resume();

          const source = ctx.createBufferSource();
          source.buffer = bufferRef.current;
          source.connect(ctx.destination);
          
          const offset = pauseTimeRef.current % bufferRef.current.duration;
          source.start(0, offset);
          startTimeRef.current = ctx.currentTime - offset;
          
          sourceRef.current = source;
          source.onended = () => {
              setIsPlaying(false);
              pauseTimeRef.current = 0;
              setProgress(0);
              setCurrentTime(0);
          };
          
          setIsPlaying(true);
          
          const updateProgress = () => {
              if (ctx && bufferRef.current) {
                  const elapsed = ctx.currentTime - startTimeRef.current;
                  setCurrentTime(elapsed);
                  const pct = Math.min(100, (elapsed / bufferRef.current.duration) * 100);
                  setProgress(pct);
                  
                  if (elapsed < bufferRef.current.duration) {
                      animationRef.current = requestAnimationFrame(updateProgress);
                  }
              }
          };
          updateProgress();
      }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newPct = parseFloat(e.target.value);
      setProgress(newPct);
      
      if (!bufferRef.current || !audioContextRef.current) return;
      
      const newTime = (newPct / 100) * bufferRef.current.duration;
      pauseTimeRef.current = newTime;
      setCurrentTime(newTime);

      if (isPlaying) {
          if (sourceRef.current) sourceRef.current.stop();
          const ctx = audioContextRef.current;
          const source = ctx.createBufferSource();
          source.buffer = bufferRef.current;
          source.connect(ctx.destination);
          source.start(0, newTime);
          startTimeRef.current = ctx.currentTime - newTime;
          sourceRef.current = source;
          
          source.onended = () => {
              setIsPlaying(false);
              pauseTimeRef.current = 0;
              setProgress(0);
              setCurrentTime(0);
          };
      }
  };

  const jumpToChapter = (startTime: number) => {
      pauseTimeRef.current = startTime;
      setCurrentTime(startTime);
      setProgress((startTime / duration) * 100);
      if (isPlaying) {
          if (sourceRef.current) sourceRef.current.stop();
          const ctx = audioContextRef.current!;
          const source = ctx.createBufferSource();
          source.buffer = bufferRef.current;
          source.connect(ctx.destination);
          source.start(0, startTime);
          startTimeRef.current = ctx.currentTime - startTime;
          sourceRef.current = source;
      }
  };

  const handleTutorSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tutorInput.trim() || !onAskQuestion) return;

      const userMsg = tutorInput;
      setTutorChat(prev => [...prev, { role: 'user', text: userMsg }]);
      setTutorInput('');
      setIsTutorThinking(true);

      try {
          const response = await onAskQuestion(userMsg);
          setTutorChat(prev => [...prev, { role: 'ai', text: response || "I couldn't find an answer." }]);
      } catch (err) {
          setTutorChat(prev => [...prev, { role: 'ai', text: "Error connecting to knowledge base." }]);
      } finally {
          setIsTutorThinking(false);
      }
  };

  const isTeachingMode = episode.type === 'Teaching';

  return (
    <div className={`h-[100dvh] w-full flex flex-col md:flex-row gap-4 md:gap-6 p-2 md:p-6 max-w-7xl mx-auto relative overflow-hidden transition-all duration-500 ${showStudyPanel ? '' : 'items-center justify-center'}`}>
      
      {/* Mobile Top Bar */}
      {!showStudyPanel && (
        <div className="md:hidden flex items-center justify-between mb-1 w-full shrink-0">
            <button onClick={onBack} className="text-slate-400 p-2">Back</button>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Now Playing</span>
            <div className="w-9"></div> 
        </div>
      )}

      {/* LEFT PANEL: Player */}
      <div className={`flex flex-col transition-all duration-500 shrink-0 ${
          showStudyPanel 
            ? 'w-full md:w-[400px] h-auto md:h-full gap-2 md:gap-6' 
            : 'w-full max-w-md gap-4 md:gap-6'
      }`}>
        
        <div className="hidden md:flex justify-between items-center mb-2">
             <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium">
                Back to Dashboard
            </button>
        </div>
        
        <div className={`glass-panel rounded-3xl border border-white/5 relative overflow-hidden shadow-2xl flex flex-col items-center text-center transition-all duration-500 ${
            showStudyPanel 
                ? 'p-3 md:p-6 flex-row md:flex-col gap-3 md:gap-0' 
                : 'p-6 md:p-8'
        }`}>
             
             {/* Cover Art / Visualizer Area */}
             <div className={`relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 shrink-0 transition-all bg-slate-900 ${
                 showStudyPanel 
                    ? 'hidden md:block w-32 h-32 md:w-48 md:h-48 md:mb-4' 
                    : 'w-64 h-64 mb-8'
             }`}>
                 {isVoiceTutorActive ? (
                     // Live Visualizer Mode
                     <>
                        <Visualizer volume={tutorVolume} isActive={tutorConnectionState === ConnectionState.CONNECTED} />
                        <div className="absolute top-2 left-2 bg-red-500/20 text-red-400 border border-red-500/50 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider animate-pulse">
                            Live Tutor
                        </div>
                     </>
                 ) : (
                     // Static Cover Art
                     episode.coverImageBase64 ? (
                         <img src={`data:image/png;base64,${episode.coverImageBase64}`} className="w-full h-full object-cover" />
                     ) : (
                         <div className="w-full h-full bg-slate-800 flex items-center justify-center">Podcast</div>
                     )
                 )}
                 
                 {isTeachingMode && !isVoiceTutorActive && (
                     <div className="absolute top-2 right-2 bg-indigo-500 text-white text-[9px] font-bold px-2 py-1 rounded shadow-lg uppercase tracking-wider">
                         Study Mode
                     </div>
                 )}
             </div>

             {/* Player Content */}
             <div className={`w-full flex flex-col justify-center ${showStudyPanel ? 'text-left md:text-center' : 'text-center'}`}>
                <div className={`space-y-1 w-full ${showStudyPanel ? 'mb-2 md:mb-4' : 'mb-8'}`}>
                    <h2 className={`font-bold text-white leading-tight line-clamp-2 ${showStudyPanel ? 'text-sm md:text-xl' : 'text-xl'}`}>
                        {isVoiceTutorActive ? "Live Q&A Session" : episode.title}
                    </h2>
                    {!showStudyPanel && <p className="text-slate-400 text-xs uppercase tracking-widest">{isVoiceTutorActive ? 'Interactive Mode' : `${episode.type} Episode`}</p>}
                </div>
                
                {/* Progress (Hidden in Voice Mode) */}
                {!isVoiceTutorActive && (
                    <div className="w-full space-y-2 mb-2 md:mb-6">
                        <div className="group relative w-full h-1.5 bg-slate-800 rounded-full cursor-pointer">
                            <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full" style={{ width: `${progress}%` }}></div>
                            <input type="range" min="0" max="100" step="0.1" value={progress} onChange={handleSeek} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>
                )}
                
                {/* Controls */}
                <div className={`flex items-center gap-4 md:gap-8 ${showStudyPanel ? 'justify-start md:justify-center' : 'justify-center'}`}>
                    
                    {!isVoiceTutorActive && (
                        <button className="text-slate-500 hover:text-white" onClick={() => handleSeek({ target: { value: Math.max(0, progress - 5) } } as any)}>
                            <span className="hidden md:inline">-10s</span>
                            <span className="md:hidden"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 8h-2.5v13m0-13l-5 5m5-5l5 5"/></svg></span>
                        </button>
                    )}
                    
                    {/* Main Action Button */}
                    <button 
                        onClick={togglePlay}
                        disabled={isVoiceTutorActive}
                        className={`rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg ${
                            showStudyPanel ? 'w-10 h-10 md:w-16 md:h-16' : 'w-16 h-16'
                        } ${
                            isTeachingMode ? 'bg-indigo-500 shadow-indigo-500/40' : 'bg-cyan-500 shadow-cyan-500/40'
                        } ${isVoiceTutorActive ? 'opacity-20 cursor-not-allowed' : ''}`}
                    >
                        {isPlaying ? (
                            <svg className={`${showStudyPanel ? 'w-4 h-4 md:w-6 md:h-6' : 'w-6 h-6'} text-white`} fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
                        ) : (
                            <svg className={`${showStudyPanel ? 'w-4 h-4 md:w-6 md:h-6' : 'w-6 h-6'} text-white ml-1`} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        )}
                    </button>

                     {!isVoiceTutorActive && (
                        <button className="text-slate-500 hover:text-white" onClick={() => handleSeek({ target: { value: Math.min(100, progress + 5) } } as any)}>
                            <span className="hidden md:inline">+10s</span>
                            <span className="md:hidden"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 8h2.5v13m0-13l5 5m-5-5l-5 5"/></svg></span>
                        </button>
                     )}

                    {/* Voice Tutor Toggle */}
                    {isTeachingMode && (
                        <button 
                            onClick={toggleVoiceTutor}
                            className={`rounded-full p-2 md:p-3 transition-all ${
                                isVoiceTutorActive 
                                    ? 'bg-red-500 text-white shadow-neon-red animate-pulse' 
                                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                            title="Speak with AI Tutor"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5">
                                <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                                <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 5.25v1.5a.75.75 0 01-1.5 0v-1.5a6.751 6.751 0 01-6-5.25v-1.5a.75.75 0 01.75-.75z" />
                            </svg>
                        </button>
                    )}

                    {showStudyPanel && (
                         <button 
                             onClick={() => setShowStudyPanel(false)}
                             className="md:hidden ml-auto text-xs font-bold text-slate-400 uppercase border border-white/10 px-3 py-1.5 rounded-full"
                         >
                             Close
                         </button>
                    )}
                </div>

                {/* View Toggle (Desktop or when panel hidden) */}
                <div className={`mt-6 ${showStudyPanel ? 'hidden md:block' : 'block'}`}>
                   <button 
                       onClick={() => setShowStudyPanel(!showStudyPanel)}
                       className="text-xs font-bold text-slate-400 hover:text-white uppercase tracking-widest border border-white/10 px-4 py-2 rounded-full hover:bg-white/5 transition-colors"
                   >
                       {showStudyPanel ? 'Hide Study Tools' : isTeachingMode ? 'Open Study Guide' : 'View Transcript'}
                   </button>
                </div>
             </div>
        </div>
      </div>

      {/* RIGHT PANEL: Study Tools */}
      {showStudyPanel && (
        <div className="flex-1 w-full flex flex-col glass-panel rounded-3xl border border-white/5 overflow-hidden shadow-xl min-h-0 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-slate-900/50 shrink-0">
                <button 
                    onClick={() => setActiveTab('chapters')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'chapters' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Chapters
                </button>
                {isTeachingMode && (
                    <button 
                        onClick={() => setActiveTab('glossary')}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'glossary' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Glossary
                    </button>
                )}
                <button 
                    onClick={() => setActiveTab('talkback')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 ${activeTab === 'talkback' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <div className={`w-2 h-2 rounded-full ${isVoiceTutorActive ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></div>
                    Talk Back
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto bg-slate-900/30 relative custom-scrollbar">
                
                {/* Visualizer Background for Talkback Mode */}
                {activeTab === 'talkback' && isVoiceTutorActive && (
                     <div className="absolute inset-0 opacity-10 pointer-events-none">
                         <Visualizer volume={tutorVolume} isActive={true} />
                     </div>
                )}

                {activeTab === 'chapters' && (
                    <div className="p-4 md:p-6 space-y-4 md:space-y-6 pb-20 md:pb-6">
                        {isTeachingMode && episode.blueprint ? (
                            episode.chapters?.map((ch, idx) => {
                                const isActive = idx === currentChapterIndex;
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => !isVoiceTutorActive && jumpToChapter(ch.startTime)}
                                        className={`p-4 rounded-xl border transition-all ${!isVoiceTutorActive ? 'cursor-pointer' : ''} ${isActive ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'bg-slate-800/40 border-white/5 hover:bg-slate-800/60'}`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-300'}`}>{idx + 1}. {ch.title}</h4>
                                            <span className="text-[10px] font-mono text-slate-500">{formatTime(ch.startTime)}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 mb-3 leading-relaxed">{ch.objective}</p>
                                        {isActive && (
                                            <div className="space-y-1">
                                                <div className="text-[10px] font-bold text-indigo-400 uppercase">Key Takeaways</div>
                                                <ul className="list-disc pl-4 space-y-1">
                                                    {ch.keyTakeaways.map((pt, i) => (
                                                        <li key={i} className="text-[11px] text-slate-300">{pt}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-4 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                {episode.script.map(l => (
                                    <div key={l.text.substring(0, 10)} className="mb-4">
                                        <span className="font-bold text-slate-500 uppercase text-xs mr-2">{l.speaker}:</span>
                                        {l.text}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'glossary' && episode.blueprint?.glossary && (
                    <div className="p-4 md:p-6 grid grid-cols-1 gap-4 pb-20">
                        {episode.blueprint.glossary.map((term, i) => (
                            <div key={i} className="p-4 bg-slate-800/40 rounded-xl border border-white/5">
                                <div className="text-sm font-bold text-indigo-400 mb-1">{term.term}</div>
                                <div className="text-xs text-slate-300 leading-relaxed">{term.definition}</div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'talkback' && (
                    <div className="h-full flex flex-col relative z-10">
                        {isVoiceTutorActive ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center animate-pulse">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-red-400">
                                        <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                                        <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 5.25v1.5a.75.75 0 01-1.5 0v-1.5a6.751 6.751 0 01-6-5.25v-1.5a.75.75 0 01.75-.75z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-lg">Live Tutor Active</h3>
                                    <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2">
                                        Ask me anything about the lesson. I'm listening...
                                    </p>
                                </div>
                                <div className="w-full max-w-sm h-32 relative">
                                    {/* Mini visualizer */}
                                    <Visualizer volume={tutorVolume} isActive={true} />
                                </div>
                            </div>
                        ) : (
                            // Text Fallback Mode
                            <>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {tutorChat.map((msg, i) => (
                                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 border border-white/10'}`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    {isTutorThinking && (
                                        <div className="flex justify-start">
                                            <div className="bg-slate-800 p-3 rounded-xl border border-white/10 flex gap-1">
                                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                                                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef}></div>
                                </div>
                                <form onSubmit={handleTutorSubmit} className="p-4 bg-slate-900 border-t border-white/10 flex gap-2 shrink-0">
                                    <input 
                                        type="text" 
                                        value={tutorInput}
                                        onChange={e => setTutorInput(e.target.value)}
                                        className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder="Type a question or use voice mode..."
                                    />
                                    <button type="submit" disabled={isTutorThinking || !tutorInput.trim()} className="p-2 bg-indigo-600 rounded-lg text-white disabled:opacity-50">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                            <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                                        </svg>
                                    </button>
                                </form>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};
