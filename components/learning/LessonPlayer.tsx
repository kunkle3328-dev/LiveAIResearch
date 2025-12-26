
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { PodcastEpisode } from '../../types';
import { base64ToFloat32, createAudioBuffer } from '../../utils/audioUtils';

interface PodcastPlayerProps {
  episode: PodcastEpisode;
  onBack: () => void;
  onAskQuestion?: (question: string) => Promise<string | null>;
}

export const LessonPlayer: React.FC<PodcastPlayerProps> = ({ episode, onBack, onAskQuestion }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  // View State
  const [showTranscript, setShowTranscript] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'tutor'>('transcript');
  
  // Tutor State
  const [tutorInput, setTutorInput] = useState('');
  const [tutorChat, setTutorChat] = useState<{role: 'user' | 'ai', text: string}[]>([
      { role: 'ai', text: "I'm listening to the episode with you. Ask me anything about the content!" }
  ]);
  const [isTutorThinking, setIsTutorThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Transcript settings
  const [autoScroll, setAutoScroll] = useState(true);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const animationRef = useRef<number>(0);
  
  const transcriptRef = useRef<HTMLDivElement>(null);
  const scriptLinesRef = useRef<(HTMLDivElement | null)[]>([]);

  const lineTimestamps = useMemo(() => {
    if (!duration || !episode.script) return [];
    
    const totalChars = episode.script.reduce((acc, line) => acc + line.text.length, 0);
    let charsSoFar = 0;
    
    return episode.script.map(line => {
        const startPct = charsSoFar / totalChars;
        charsSoFar += line.text.length;
        const endPct = charsSoFar / totalChars;
        return {
            start: startPct * duration,
            end: endPct * duration,
            text: line.text
        };
    });
  }, [episode.script, duration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
    };
  }, [episode]);

  // Transcript Auto-scroll
  useEffect(() => {
      if (!showTranscript || !autoScroll || !transcriptRef.current || lineTimestamps.length === 0 || activeTab !== 'transcript') return;
      const activeIndex = lineTimestamps.findIndex(t => currentTime >= t.start && currentTime <= t.end);
      if (activeIndex !== -1 && scriptLinesRef.current[activeIndex]) {
          scriptLinesRef.current[activeIndex]?.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
          });
      }
  }, [currentTime, showTranscript, autoScroll, lineTimestamps, activeTab]);

  // Chat Auto-scroll
  useEffect(() => {
    if (activeTab === 'tutor' && chatEndRef.current) {
        // Slight delay to ensure DOM update
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
  }, [tutorChat, isTutorThinking, activeTab]);

  const togglePlay = () => {
      if (!audioContextRef.current || !bufferRef.current) return;

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

  const handleTutorSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tutorInput.trim() || !onAskQuestion) return;

      const userMsg = tutorInput;
      setTutorChat(prev => [...prev, { role: 'user', text: userMsg }]);
      setTutorInput('');
      setIsTutorThinking(true);

      // Auto-pause playback when asking a question to focus
      if (isPlaying) togglePlay();

      try {
          const response = await onAskQuestion(userMsg);
          if (response) {
              setTutorChat(prev => [...prev, { role: 'ai', text: response }]);
          } else {
               setTutorChat(prev => [...prev, { role: 'ai', text: "I couldn't find an answer to that specific question." }]);
          }
      } catch (err) {
          console.error(err);
          setTutorChat(prev => [...prev, { role: 'ai', text: "Sorry, I encountered an error connecting to my knowledge base. Please try again." }]);
      } finally {
          setIsTutorThinking(false);
      }
  };

  return (
    <div className={`h-full flex flex-col md:flex-row gap-4 md:gap-6 p-2 md:p-6 max-w-7xl mx-auto relative overflow-hidden transition-all duration-500 ${showTranscript ? '' : 'items-center justify-center'}`}>
      
      {/* Mobile: Top Bar Navigation (Hidden when transcript is open to save space) */}
      {!showTranscript && (
        <div className="md:hidden flex items-center justify-between mb-1 w-full shrink-0">
            <button onClick={onBack} className="text-slate-400 p-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
            </button>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Now Playing</span>
            <div className="w-9"></div> 
        </div>
      )}

      {/* LEFT PANEL: Cover Art & Player Controls */}
      <div className={`flex flex-col gap-4 md:gap-6 transition-all duration-500 shrink-0 ${showTranscript ? 'w-full md:w-[400px]' : 'w-full max-w-md'}`}>
        
        {/* Desktop Back Button */}
        <div className="hidden md:flex justify-between items-center mb-2">
             <button onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Dashboard
            </button>
        </div>
        
        {/* Card Container */}
        <div className={`glass-panel rounded-3xl border border-white/5 relative overflow-hidden shadow-2xl flex flex-col items-center text-center transition-all duration-500 ${showTranscript ? 'p-3 md:p-8 flex-row md:flex-col gap-4 md:gap-0' : 'p-6 md:p-8'}`}>
             
             {/* Background Glow */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/20 blur-[100px] rounded-full pointer-events-none"></div>

             {/* Cover Art - Dynamic Resizing */}
             <div className={`relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 group transition-all duration-500 shrink-0 ${showTranscript ? 'w-16 h-16 md:w-64 md:h-64 md:mb-6' : 'w-48 h-48 md:w-64 md:h-64 mb-6'}`}>
                 {episode.coverImageBase64 ? (
                     <img 
                        src={`data:image/png;base64,${episode.coverImageBase64}`} 
                        alt="Episode Cover" 
                        className="w-full h-full object-cover"
                     />
                 ) : (
                     <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 md:w-20 md:h-20 text-slate-700">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                     </div>
                 )}
                 {/* Play Overlay (Desktop Only when sidebar active) */}
                 <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity duration-300 ${isPlaying ? 'opacity-0' : 'opacity-100'} ${showTranscript ? 'hidden md:flex' : 'flex'}`}>
                    <div className="w-8 h-8 md:w-16 md:h-16 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-4 h-4 md:w-8 md:h-8 text-white ml-1">
                             <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                    </div>
                 </div>
             </div>

             <div className="flex-1 w-full md:w-auto flex flex-col justify-center">
                {/* Metadata - Hidden on mobile if transcript active to save space */}
                <div className={`space-y-1 md:space-y-2 w-full text-left md:text-center ${showTranscript ? 'hidden md:block mb-2 md:mb-8' : 'mb-8'}`}>
                    <h2 className={`font-bold text-white leading-tight line-clamp-2 ${showTranscript ? 'text-sm md:text-2xl' : 'text-xl md:text-2xl'}`}>{episode.title}</h2>
                    <p className="text-cyan-400 text-[10px] md:text-xs font-bold uppercase tracking-widest">{episode.style} Series</p>
                </div>
                
                <div className="w-full space-y-3 md:space-y-4">
                    {/* Progress Scrubber - Hide on mobile when transcript is active to maximize space */}
                    <div className={`group relative w-full h-1.5 md:h-2 bg-slate-800 rounded-full cursor-pointer ${showTranscript ? 'hidden md:block' : 'block'}`}>
                        <div className="absolute inset-y-0 left-0 bg-cyan-500 rounded-full" style={{ width: `${progress}%` }}>
                           <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform"></div>
                        </div>
                        <input 
                           type="range" 
                           min="0" 
                           max="100" 
                           step="0.1"
                           value={progress}
                           onChange={handleSeek}
                           className="absolute inset-0 w-full opacity-0 cursor-pointer"
                        />
                    </div>
                    
                    <div className={`flex justify-between text-[10px] font-mono text-slate-400 ${showTranscript ? 'hidden md:flex' : 'flex'}`}>
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                    
                    {/* Main Buttons */}
                    <div className="flex items-center justify-center gap-6 md:gap-8 pt-1 md:pt-2">
                        <button className="text-slate-500 hover:text-white transition-colors" onClick={() => {
                            const newTime = Math.max(0, currentTime - 10);
                            const pct = (newTime / duration) * 100;
                            handleSeek({ target: { value: pct } } as any);
                        }}>
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062A1.125 1.125 0 0121 8.688v8.123zM11.25 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953L9.567 7.71a1.125 1.125 0 011.683.977v8.123z" />
                           </svg>
                        </button>
                        
                        <button 
                            onClick={togglePlay}
                            className={`rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center hover:scale-105 transition-transform shadow-[0_0_30px_rgba(6,182,212,0.4)] ring-4 ring-slate-900 ${showTranscript ? 'w-10 h-10 md:w-16 md:h-16' : 'w-16 h-16'}`}
                        >
                            {isPlaying ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={showTranscript ? "w-5 h-5 md:w-7 md:h-7" : "w-7 h-7"}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`${showTranscript ? "w-5 h-5 md:w-7 md:h-7" : "w-7 h-7"} ml-1`}>
                                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>

                        <button className="text-slate-500 hover:text-white transition-colors" onClick={() => {
                            const newTime = Math.min(duration, currentTime + 10);
                            const pct = (newTime / duration) * 100;
                            handleSeek({ target: { value: pct } } as any);
                        }}>
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 md:w-6 md:h-6">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.811V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" />
                           </svg>
                        </button>
                    </div>

                    {/* Transcript Toggle */}
                    <div className="pt-2 md:pt-4 flex justify-center">
                       <button 
                           onClick={() => setShowTranscript(!showTranscript)}
                           className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all border ${
                               showTranscript 
                               ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                               : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                           }`}
                       >
                           {showTranscript ? (
                               <>
                                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                       <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-5.733 2.5 2.5 0 00-1.65-2.263c-.3-.08-.681-.1-1.018-.114l-2.09-.08a3.733 3.733 0 01-3.696 2.593l-.407-.004L5.342 4.282a10.013 10.013 0 00-2.062 2.062zM9 13.06l-1.06 1.06a3.75 3.75 0 014.243-4.243L11.12 10.94a2.25 2.25 0 00-2.12 2.12z" clipRule="evenodd" />
                                   </svg>
                                   Hide Learning View
                               </>
                           ) : (
                               <>
                                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                       <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                   </svg>
                                   Start Learning
                               </>
                           )}
                       </button>
                    </div>
                </div>
             </div>
        </div>
      </div>

      {/* RIGHT PANEL: Transcript & Tutor */}
      {showTranscript && (
        <div className="flex-1 w-full flex flex-col glass-panel rounded-3xl border border-white/5 overflow-hidden shadow-xl min-h-0 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Header Tabs */}
            <div className="p-3 md:p-6 border-b border-white/5 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-10 flex gap-4 items-center shrink-0">
                <button
                    onClick={() => setActiveTab('transcript')}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                        activeTab === 'transcript' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-500 hover:bg-white/5'
                    }`}
                >
                    Transcript
                </button>
                <button
                    onClick={() => setActiveTab('tutor')}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                        activeTab === 'tutor' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-500 hover:bg-white/5'
                    }`}
                >
                    AI Tutor
                </button>
                
                {activeTab === 'transcript' && (
                    <button 
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`ml-auto text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded transition-colors ${autoScroll ? 'text-cyan-400 bg-cyan-950/30' : 'text-slate-500 hover:text-white'}`}
                    >
                        {autoScroll ? 'Auto Scroll' : 'Manual'}
                    </button>
                )}
            </div>

            {/* Content Area */}
            {activeTab === 'transcript' ? (
                <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 bg-slate-900/20 scroll-smooth">
                    {episode.script.map((line, idx) => {
                        const isActive = lineTimestamps[idx] && currentTime >= lineTimestamps[idx].start && currentTime <= lineTimestamps[idx].end;
                        return (
                            <div 
                                key={idx} 
                                ref={el => scriptLinesRef.current[idx] = el}
                                className={`flex gap-4 transition-all duration-300 ${isActive ? 'opacity-100 scale-[1.01]' : 'opacity-60 hover:opacity-100'}`}
                            >
                                <div className={`shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-sm font-bold shadow-lg transition-colors ${
                                    line.speaker === 'Host' 
                                    ? isActive ? 'bg-cyan-500 text-white shadow-cyan-500/20' : 'bg-cyan-900/30 text-cyan-400 border border-cyan-500/20' 
                                    : isActive ? 'bg-indigo-500 text-white shadow-indigo-500/20' : 'bg-indigo-900/30 text-indigo-400 border border-indigo-500/20'
                                }`}>
                                    {line.speaker === 'Host' ? 'OR' : 'AO'}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className={`text-[10px] md:text-xs font-bold uppercase tracking-wider ${
                                        line.speaker === 'Host' ? 'text-cyan-500' : 'text-indigo-500'
                                    }`}>
                                        {line.speaker === 'Host' ? 'Orus (Host)' : 'Aoede (Expert)'}
                                    </div>
                                    <p className={`text-base md:text-lg leading-relaxed font-light transition-colors ${isActive ? 'text-white font-medium' : 'text-slate-300'}`}>
                                        {line.text}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    <div className="h-10"></div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col bg-slate-900/20 relative min-h-0">
                     <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                         {tutorChat.map((msg, idx) => (
                             <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                 <div className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed shadow-md ${
                                     msg.role === 'user' 
                                     ? 'bg-indigo-600 text-white rounded-tr-sm' 
                                     : 'bg-slate-800 text-slate-200 border border-white/5 rounded-tl-sm'
                                 }`}>
                                     {msg.text}
                                 </div>
                             </div>
                         ))}
                         {isTutorThinking && (
                             <div className="flex justify-start animate-in fade-in">
                                 <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-sm border border-white/5 flex gap-1 shadow-md">
                                     <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                                     <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                                     <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                                 </div>
                             </div>
                         )}
                         <div ref={chatEndRef} />
                     </div>
                     <form onSubmit={handleTutorSubmit} className="p-3 bg-slate-900/80 border-t border-white/5 flex gap-2 shrink-0 backdrop-blur-md">
                         <input 
                            type="text" 
                            value={tutorInput} 
                            onChange={e => setTutorInput(e.target.value)}
                            className="flex-1 bg-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all border border-transparent focus:border-indigo-500/50"
                            placeholder="Ask about this topic..."
                         />
                         <button 
                             type="submit"
                             disabled={!tutorInput.trim() || isTutorThinking}
                             className="bg-indigo-500 hover:bg-indigo-400 text-white p-3 rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
                         >
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                 <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                             </svg>
                         </button>
                     </form>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
