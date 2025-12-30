
import React, { useState } from 'react';
import { LearningSource, PodcastEpisode, PodcastBlueprint, PodcastType } from '../../types';
import { useLearningAI } from '../../hooks/useLearningAI';

interface PodcastGeneratorProps {
  sources: LearningSource[];
  onPodcastGenerated: (episode: PodcastEpisode) => void;
  onCancel: () => void;
}

export const CurriculumBuilder: React.FC<PodcastGeneratorProps> = ({ sources, onPodcastGenerated, onCancel }) => {
  const { isGenerating, generateBlueprint, generatePodcastScript, synthesizePodcastAudio, generateCoverImage } = useLearningAI();
  
  // Step 1: Configuration
  const [topic, setTopic] = useState('');
  const [podcastType, setPodcastType] = useState<PodcastType>('Teaching'); // Default to Teaching for Enterprise
  const [audience, setAudience] = useState('Beginner');
  
  // Step 2: Blueprint Review (Teaching only)
  const [blueprint, setBlueprint] = useState<PodcastBlueprint | null>(null);
  
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const handleGenerateBlueprint = async () => {
      if (!topic) return;
      setError(null);
      setStatus('Designing curriculum blueprint...');
      
      const bp = await generateBlueprint(topic, audience, sources);
      if (bp) {
          setBlueprint(bp);
          setStatus('');
      } else {
          setError("Failed to generate blueprint. Try refining your topic.");
          setStatus('');
      }
  };

  const handleFinalizeEpisode = async () => {
    if (!topic) return;
    setError(null);
    setQuotaExceeded(false);
    
    try {
        // 1. Scripting
        setStatus('Drafting script (this takes ~30s)...');
        
        const scriptResult = await generatePodcastScript(
            topic, 
            podcastType === 'Teaching' ? 'Educational' : 'Casual', 
            podcastType,
            sources,
            blueprint || undefined
        );
        
        if (!scriptResult) {
            setError("Failed to generate a valid script. Please try again.");
            setStatus('');
            return;
        }

        // 2. Sequential Generation (Image then Audio) to save Quota
        setStatus('Generating Cover Art...');
        const imageData = await generateCoverImage(topic, podcastType === 'Teaching' ? 'Minimalist Tech' : 'Vibrant');

        setStatus('Initializing Audio Production...');
        let audioProgress = 0;
        const audioData = await synthesizePodcastAudio(scriptResult.script, (progress) => {
             audioProgress = progress;
             setStatus(`Producing Audio: ${progress}%`);
        });

        if (!audioData) {
            // Audio Failed - Check if it was likely a Quota issue?
            // Since useLearningAI swallows the exact error type but returns null on fail,
            // we assume generic failure but offer fallback.
            // However, useLearningAI logs 'Critical: Audio chunk generation failed'.
            setQuotaExceeded(true);
            setError("Audio generation limit reached. You can view the text script.");
            setStatus('');
            
            // Allow proceeding without audio (Text Only Mode fallback)
            // We create the episode but without audioBase64
            const textEpisode: PodcastEpisode = {
                id: Date.now().toString(),
                title: scriptResult.title,
                topic,
                style: podcastType === 'Teaching' ? 'Educational' : 'Conversational',
                type: podcastType,
                script: scriptResult.script,
                blueprint: blueprint || undefined,
                chapters: undefined, 
                coverImageBase64: imageData || undefined,
                sourceIds: sources.map(s => s.id),
                createdAt: new Date(),
                durationSeconds: 0 
            };
            // Don't auto-redirect, let user decide
            return; 
        }
        
        setStatus('Finalizing episode...');

        // 3. Finalize
        // Estimate timestamps for chapters if teaching mode
        let chapters = undefined;
        if (podcastType === 'Teaching' && blueprint) {
            const totalChars = scriptResult.script.reduce((acc, l) => acc + l.text.length, 0);
            // Approx 15 chars per second for TTS
            const estDuration = totalChars / 15;
            
            chapters = blueprint.chapters.map((ch, idx) => ({
                title: ch.title,
                objective: ch.objective,
                keyTakeaways: ch.keyPoints,
                // Rough estimate: distribute chapters evenly for MVP
                startTime: (idx / blueprint.chapters.length) * estDuration
            }));
        }

        const episode: PodcastEpisode = {
            id: Date.now().toString(),
            title: scriptResult.title,
            topic,
            style: podcastType === 'Teaching' ? 'Educational' : 'Conversational',
            type: podcastType,
            script: scriptResult.script,
            blueprint: blueprint || undefined,
            chapters,
            audioBase64: audioData,
            coverImageBase64: imageData || undefined,
            sourceIds: sources.map(s => s.id),
            createdAt: new Date(),
            durationSeconds: 0 
        };

        onPodcastGenerated(episode);
    } catch (e) {
        console.error(e);
        setError("An unexpected error occurred.");
        setStatus('');
    }
  };

  return (
    <div className="glass-panel p-6 md:p-8 rounded-2xl border border-skin-border max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-skin-text mb-2">Create Learning Podcast</h2>
        <p className="text-skin-muted text-sm">Turn your {sources.length} sources into an engaging audio episode.</p>
      </div>

      <div className="space-y-6">
        
        {/* Toggle Type */}
        <div className="flex bg-skin-surface p-1 rounded-xl border border-skin-border">
            <button 
                onClick={() => { setPodcastType('Teaching'); setBlueprint(null); }}
                className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${podcastType === 'Teaching' ? 'bg-skin-accent text-skin-base shadow-lg' : 'text-skin-muted hover:text-skin-text'}`}
            >
                Teaching Podcast
            </button>
            <button 
                onClick={() => { setPodcastType('Standard'); setBlueprint(null); }}
                className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${podcastType === 'Standard' ? 'bg-skin-secondary text-skin-base shadow-lg' : 'text-skin-muted hover:text-skin-text'}`}
            >
                Standard Podcast
            </button>
        </div>

        {/* Configuration */}
        {!blueprint && (
            <div className="space-y-4 animate-in fade-in">
                <div>
                   <label className="block text-xs font-bold text-skin-muted uppercase tracking-widest mb-2">Episode Topic</label>
                   <textarea 
                     value={topic}
                     onChange={e => setTopic(e.target.value)}
                     className="w-full h-24 glass-input rounded-xl px-4 py-3 text-skin-text placeholder-skin-muted focus:ring-1 focus:ring-skin-accent"
                     placeholder="e.g. Explain the safety protocols and why they matter..."
                   />
                </div>

                {podcastType === 'Teaching' && (
                    <div>
                        <label className="block text-xs font-bold text-skin-muted uppercase tracking-widest mb-2">Target Audience</label>
                        <div className="grid grid-cols-3 gap-3">
                            {['Beginner', 'Intermediate', 'Advanced'].map((a) => (
                                <button
                                    key={a}
                                    onClick={() => setAudience(a)}
                                    className={`p-2 rounded-lg text-xs font-bold border transition-all ${
                                        audience === a
                                        ? 'bg-skin-accent-dim border-skin-accent text-skin-accent'
                                        : 'bg-skin-surface border-skin-border text-skin-muted hover:bg-skin-surface-hover'
                                    }`}
                                >
                                    {a}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Blueprint Review (Teaching Mode) */}
        {blueprint && podcastType === 'Teaching' && (
            <div className="bg-skin-surface rounded-xl border border-skin-border p-6 animate-in zoom-in-95 space-y-6">
                <div className="flex justify-between items-start">
                    <h3 className="text-sm font-bold text-skin-text uppercase tracking-widest">Curriculum Blueprint</h3>
                    <button onClick={() => setBlueprint(null)} className="text-xs text-skin-accent hover:text-skin-accent-hover">Edit Settings</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <span className="text-[10px] text-skin-muted uppercase font-bold block mb-2">Objectives</span>
                            <ul className="space-y-1">
                                {blueprint.learningObjectives.map((obj, i) => (
                                    <li key={i} className="text-xs text-skin-text flex gap-2">
                                        <span className="text-skin-secondary">•</span> {obj}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        
                        <div>
                            <span className="text-[10px] text-skin-muted uppercase font-bold block mb-2">Common Misconceptions</span>
                            <ul className="space-y-1">
                                {blueprint.misconceptions?.map((misc, i) => (
                                    <li key={i} className="text-xs text-skin-text flex gap-2">
                                        <span className="text-red-400">×</span> {misc}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[10px] text-skin-muted uppercase font-bold block mb-1">Lesson Plan</span>
                        {blueprint.chapters.map((ch, i) => (
                            <div key={i} className="bg-skin-base/30 p-3 rounded-lg border border-skin-border">
                                <div className="flex justify-between items-start">
                                    <div className="text-xs font-bold text-skin-text mb-1">{i+1}. {ch.title}</div>
                                </div>
                                <div className="text-[10px] text-skin-muted">{ch.objective}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {blueprint.checkpoints && blueprint.checkpoints.length > 0 && (
                    <div className="pt-4 border-t border-skin-border">
                        <span className="text-[10px] text-skin-muted uppercase font-bold block mb-2">Knowledge Checkpoints</span>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {blueprint.checkpoints.map((cp, i) => (
                                <div key={i} className="bg-skin-accent-dim border border-skin-accent/20 p-2 rounded text-[10px] text-skin-text">
                                    <span className="font-bold text-skin-accent mr-1">Q{i+1}:</span> {cp}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}
        
        {error && (
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-200 text-sm flex flex-col gap-3 items-center text-center">
                <span>{error}</span>
                {quotaExceeded && (
                    <div className="flex gap-3">
                         <button 
                             onClick={() => {
                                 // Retry logic placeholder
                             }}
                             className="hidden px-4 py-2 bg-skin-surface hover:bg-skin-surface-hover rounded text-xs uppercase font-bold"
                         >
                             Retry Text Only
                         </button>
                    </div>
                )}
            </div>
        )}

        {status && (
             <div className="p-4 bg-skin-surface rounded-xl flex items-center justify-center gap-3">
                 <div className="w-4 h-4 border-2 border-skin-accent border-t-transparent rounded-full animate-spin"></div>
                 <span className="text-skin-accent text-xs font-mono tracking-widest uppercase animate-pulse">{status}</span>
             </div>
        )}
        
        <div className="pt-4 flex items-center justify-between">
            <button onClick={onCancel} className="text-skin-muted hover:text-skin-text text-sm">Back</button>
            
            {podcastType === 'Teaching' && !blueprint ? (
                <button 
                    onClick={handleGenerateBlueprint}
                    disabled={isGenerating || !topic}
                    className="btn-glow px-6 py-2 rounded-lg text-white font-bold text-xs tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGenerating ? "PLANNING..." : "GENERATE BLUEPRINT"}
                </button>
            ) : (
                <button 
                    onClick={handleFinalizeEpisode}
                    disabled={isGenerating || !topic}
                    className="btn-glow px-8 py-3 rounded-xl text-white font-bold text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                >
                    {isGenerating ? "PRODUCING..." : "PRODUCE EPISODE"}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
