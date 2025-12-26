
import React, { useState } from 'react';
import { LearningSource } from '../../types';

interface SourceIntakeProps {
  onAddSource: (source: LearningSource) => void;
  onCancel: () => void;
}

export const SourceIntake: React.FC<SourceIntakeProps> = ({ onAddSource, onCancel }) => {
  const [type, setType] = useState<'text' | 'url'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // For URL types, if content is empty, use the URL as content so the AI has something to reference
    let finalContent = content;
    if (type === 'url' && !finalContent) {
        finalContent = `Reference URL: ${url}`;
    }

    const newSource: LearningSource = {
      id: Date.now().toString(),
      title: title || (type === 'url' ? url : 'Untitled Source'),
      type: type as any,
      content: finalContent,
      url: type === 'url' ? url : undefined,
      tags: [],
      createdAt: new Date(),
      status: 'ready'
    };
    onAddSource(newSource);
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/10 animate-in zoom-in-95 duration-200">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-cyan-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Add Knowledge Source
      </h3>

      <div className="flex gap-4 mb-6">
        <button 
          type="button"
          onClick={() => setType('text')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'text' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          Paste Text
        </button>
        <button 
          type="button"
          onClick={() => setType('url')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${type === 'url' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          Web URL
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Title</label>
          <input 
            type="text" 
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full glass-input rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-cyan-500/50"
            placeholder="e.g. Q3 Compliance Handbook"
          />
        </div>

        {type === 'text' ? (
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Content</label>
            <textarea 
              required
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-48 glass-input rounded-lg px-4 py-3 text-sm focus:ring-1 focus:ring-cyan-500/50 font-mono"
              placeholder="Paste document text here..."
            />
          </div>
        ) : (
          <div>
             <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">URL</label>
             <input 
                type="url" 
                required
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full glass-input rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-cyan-500/50"
                placeholder="https://..."
             />
             <p className="text-[10px] text-slate-500 mt-2">
               Note: In this demo environment, URLs are stored as references. For full analysis, please paste the text content directly above.
             </p>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
            <button 
              type="button" 
              onClick={onCancel}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
                Cancel
            </button>
            <button 
              type="submit" 
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-cyan-500/20 transition-all"
            >
                Add Source
            </button>
        </div>
      </form>
    </div>
  );
};
