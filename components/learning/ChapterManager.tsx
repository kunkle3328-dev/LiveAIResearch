
import React from 'react';
import { PodcastChapter, LearningMoment } from '../../types';

interface ChapterManagerProps {
    chapters?: PodcastChapter[];
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    onGenerateMore: () => void;
}

export const ChapterManager: React.FC<ChapterManagerProps> = ({ chapters, currentTime, duration, onSeek, onGenerateMore }) => {
    
    if (!chapters || chapters.length === 0) {
        return (
            <div className="p-8 text-center text-skin-muted">
                <p className="mb-4">No chapters defined.</p>
                <button 
                    onClick={onGenerateMore}
                    className="px-4 py-2 bg-skin-accent text-skin-base text-xs font-bold uppercase rounded shadow-lg hover:bg-skin-accent-hover"
                >
                    Auto-Generate Chapters
                </button>
            </div>
        );
    }

    const currentChapterId = chapters.find((ch, i) => {
        const nextStart = chapters[i+1]?.startTime || duration;
        return currentTime >= ch.startTime && currentTime < nextStart;
    })?.id;

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-skin-border bg-skin-surface flex justify-between items-center">
                 <h3 className="text-xs font-bold text-skin-muted uppercase tracking-widest">Episode Chapters</h3>
                 <button onClick={onGenerateMore} className="text-[10px] text-skin-accent hover:text-skin-text">Refresh AI</button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {chapters.map((ch, idx) => {
                    const isActive = ch.id === currentChapterId;
                    return (
                        <div 
                            key={ch.id}
                            onClick={() => onSeek(ch.startTime)}
                            className={`relative pl-6 pb-6 border-l-2 cursor-pointer transition-all group ${isActive ? 'border-skin-accent' : 'border-skin-border hover:border-skin-accent/50'}`}
                        >
                            <div className={`absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full transition-colors ${isActive ? 'bg-skin-accent shadow-glow' : 'bg-skin-surface border border-skin-muted group-hover:border-skin-accent'}`}></div>
                            
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-xs font-bold uppercase tracking-wide ${isActive ? 'text-skin-text' : 'text-skin-muted group-hover:text-skin-text'}`}>
                                    Chapter {idx + 1}
                                </span>
                                <span className="text-[10px] font-mono text-skin-muted">{Math.floor(ch.startTime / 60)}:{Math.floor(ch.startTime % 60).toString().padStart(2, '0')}</span>
                            </div>
                            
                            <h4 className={`text-sm font-bold mb-2 ${isActive ? 'text-skin-accent' : 'text-skin-text'}`}>{ch.title}</h4>
                            
                            {isActive && (
                                <div className="bg-skin-accent-dim border border-skin-accent/20 p-3 rounded-lg text-xs text-skin-text animate-in fade-in slide-in-from-left-2">
                                    <p className="mb-2 opacity-90">{ch.summary}</p>
                                    <div className="flex gap-2 mt-2">
                                        <span className="px-2 py-1 bg-skin-surface rounded text-[9px] uppercase font-bold text-skin-accent">Learning Moment</span>
                                        <span className="text-[10px] italic opacity-70">Key Takeaway Active</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
