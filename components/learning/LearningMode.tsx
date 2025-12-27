
import React, { useState, useRef, useEffect } from 'react';
import { PodcastEpisode, LearningSource } from '../../types';
import { SourceIntake } from './SourceIntake';
import { CurriculumBuilder as PodcastGenerator } from './CurriculumBuilder'; 
import { LessonPlayer as PodcastPlayer } from './LessonPlayer'; 
import { useLearningAI } from '../../hooks/useLearningAI';

export const LearningMode: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'intake' | 'generator' | 'player'>('dashboard');
  const [sources, setSources] = useState<LearningSource[]>([]);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [activeEpisode, setActiveEpisode] = useState<PodcastEpisode | null>(null);
  
  const { chatWithSources } = useLearningAI();

  const handleSourceAdd = (source: LearningSource) => {
    setSources([...sources, source]);
    setView('dashboard');
  };

  const handlePodcastGenerated = (episode: PodcastEpisode) => {
    setEpisodes([episode, ...episodes]);
    setActiveEpisode(episode);
    setView('player');
  };

  const playEpisode = (episode: PodcastEpisode) => {
    setActiveEpisode(episode);
    setView('player');
  };

  // Helper to get raw text for the active episode's context
  const getEpisodeContext = (episode: PodcastEpisode): string => {
      const relevantSources = sources.filter(s => episode.sourceIds.includes(s.id));
      return relevantSources.map(s => `[${s.title}]: ${s.content.substring(0, 5000)}`).join('\n\n');
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-hidden relative">
        
        {/* Header Area */}
        {view === 'dashboard' && (
            <div className="flex justify-between items-end mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Audio Learning Center</h1>
                    <p className="text-slate-400 text-sm">Generate AI Podcasts from your knowledge base</p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setView('intake')}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg border border-white/10 transition-all flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Source
                    </button>
                    <button 
                        onClick={() => setView('generator')}
                        disabled={sources.length === 0}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                        </svg>
                        Generate Episode
                    </button>
                </div>
            </div>
        )}

        {/* Views */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            
            {view === 'dashboard' && (
                <div className="space-y-8 pb-10">
                    
                    {/* Sources Widget */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="glass-panel p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Knowledge Base</h3>
                            <div className="text-3xl font-bold text-white mb-4">{sources.length} <span className="text-base text-slate-500 font-normal">sources</span></div>
                            <div className="space-y-2">
                                {sources.slice(0, 3).map(s => (
                                    <div key={s.id} className="text-xs text-slate-300 flex items-center gap-2 truncate">
                                        <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                                        {s.title}
                                    </div>
                                ))}
                                {sources.length === 0 && <div className="text-xs text-slate-500 italic">No sources connected</div>}
                            </div>
                        </div>

                        {/* Episodes Grid */}
                        <div className="md:col-span-2 space-y-4">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Your Episodes</h3>
                            {episodes.length > 0 ? (
                                <div className="grid grid-cols-1 gap-4">
                                    {episodes.map(ep => (
                                        <div key={ep.id} className="glass-panel p-4 rounded-xl border border-white/5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 group-hover:scale-110 transition-transform">
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-white">{ep.title}</h4>
                                                    <div className="flex gap-2 text-xs text-slate-400 mt-1">
                                                        <span className="bg-slate-800 px-2 py-0.5 rounded">{ep.style}</span>
                                                        <span>{new Date(ep.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => playEpisode(ep)}
                                                className="px-4 py-2 bg-white text-slate-900 text-xs font-bold rounded-lg hover:bg-indigo-50 transition-colors"
                                            >
                                                PLAY
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-40 glass-panel rounded-xl flex flex-col items-center justify-center text-slate-500 border border-white/5 border-dashed">
                                    <p>No episodes generated yet.</p>
                                    <p className="text-xs mt-1">Add sources and generate your first podcast.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {view === 'intake' && (
                <div className="max-w-xl mx-auto pt-10">
                    <SourceIntake 
                        onAddSource={handleSourceAdd}
                        onCancel={() => setView('dashboard')}
                    />
                </div>
            )}

            {view === 'generator' && (
                <div className="pt-6">
                    <PodcastGenerator 
                        sources={sources}
                        onPodcastGenerated={handlePodcastGenerated}
                        onCancel={() => setView('dashboard')}
                    />
                </div>
            )}

            {view === 'player' && activeEpisode && (
                <PodcastPlayer 
                    episode={activeEpisode}
                    sourceContext={getEpisodeContext(activeEpisode)}
                    onBack={() => setView('dashboard')}
                    onAskQuestion={async (question) => {
                         const relevantSources = sources.filter(s => activeEpisode.sourceIds.includes(s.id));
                         return await chatWithSources(question, relevantSources, []);
                    }}
                />
            )}

        </div>
    </div>
  );
};
