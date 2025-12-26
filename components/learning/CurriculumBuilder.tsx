
import React, { useState } from 'react';
import { LearningSource, PodcastEpisode } from '../../types';
import { useLearningAI } from '../../hooks/useLearningAI';

interface PodcastGeneratorProps {
  sources: LearningSource[];
  onPodcastGenerated: (episode: PodcastEpisode) => void;
  onCancel: () => void;
}

export const CurriculumBuilder: React.FC<PodcastGeneratorProps> = ({ sources, onPodcastGenerated, onCancel }) => {
  const { isGenerating, generatePodcastScript, synthesizePodcastAudio, generateCoverImage } = useLearningAI();
  
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('Deep Dive');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!topic) return;
    setError(null);
    
    try {
        // 1. Scripting
        setStatus('Drafting script (this takes ~30s)...');
        const scriptResult = await generatePodcastScript(topic, style, sources);
        
        if (!scriptResult) {
            setError("Failed to generate a valid script. Please try again.");
            setStatus('');
            return;
        }

        // 2. Parallel Generation (Audio + Image)
        setStatus('Initializing production...');
        
        let audioProgress = 0;
        
        // Pass progress callback to update UI
        const audioPromise = synthesizePodcastAudio(scriptResult.script, (progress) => {
             audioProgress = progress;
             setStatus(`Producing Audio: ${progress}%`);
        });
        
        const imagePromise = generateCoverImage(topic, style);

        const [audioData, imageData] = await Promise.all([audioPromise, imagePromise]);

        if (!audioData) {
            setError("Script generated, but audio synthesis failed. Please try again.");
            setStatus('');
            return;
        }
        
        setStatus('Finalizing episode...');

        // 3. Finalize
        const episode: PodcastEpisode = {
            id: Date.now().toString(),
            title: scriptResult.title,
            topic,
            style: style as any,
            script: scriptResult.script,
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
    <div className="glass-panel p-6 md:p-8 rounded-2xl border border-white/10 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Create Learning Podcast</h2>
        <p className="text-slate-400 text-sm">Turn your {sources.length} sources into an engaging audio episode.</p>
      </div>

      <div className="space-y-6">
        <div>
           <label className="block text-xs font-bold text-cyan-400 uppercase tracking-widest mb-2">Episode Topic</label>
           <textarea 
             value={topic}
             onChange={e => setTopic(e.target.value)}
             className="w-full h-24 glass-input rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-1 focus:ring-cyan-500/50"
             placeholder="e.g. Explain the safety protocols and why they matter..."
           />
        </div>

        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Podcast Style</label>
            <div className="grid grid-cols-2 gap-3">
                {['Deep Dive', 'Quick Summary', 'Debate', 'Storytelling'].map((s) => (
                    <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={`p-3 rounded-xl text-sm font-bold border transition-all ${
                            style === s 
                            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' 
                            : 'bg-slate-900 border-white/10 text-slate-400 hover:bg-slate-800'
                        }`}
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
        
        {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-200 text-xs">
                {error}
            </div>
        )}

        {status && (
             <div className="p-4 bg-slate-800/50 rounded-xl flex items-center justify-center gap-3">
                 <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                 <span className="text-cyan-400 text-xs font-mono tracking-widest uppercase animate-pulse">{status}</span>
             </div>
        )}
        
        <div className="pt-4 flex items-center justify-between">
            <button onClick={onCancel} className="text-slate-400 hover:text-white text-sm">Back</button>
            <button 
                onClick={handleGenerate}
                disabled={isGenerating || !topic}
                className="btn-glow px-8 py-3 rounded-xl text-white font-bold text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
            >
                {isGenerating ? "PRODUCING..." : "PRODUCE EPISODE"}
            </button>
        </div>
      </div>
    </div>
  );
};
