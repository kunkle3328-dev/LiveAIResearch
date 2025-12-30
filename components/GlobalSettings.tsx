
import React, { useState } from 'react';
import { AppTheme, VoiceProfile, MemoryLayer, CustomThemeConfig } from '../types';

interface GlobalSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    
    // Theme Props
    currentTheme: AppTheme;
    onSetTheme: (theme: AppTheme) => void;
    customColors: CustomThemeConfig;
    onUpdateCustomColor: (key: keyof CustomThemeConfig, value: string) => void;
    
    // Persona Props
    profiles: VoiceProfile[];
    activeProfileId: string;
    onSelectProfile: (id: string) => void;
    onOpenVoiceSettings: () => void; // New Prop
    
    // Memory Props
    memory: MemoryLayer;
    onUpdateMemory: (newMemory: MemoryLayer) => void;
}

const THEMES: AppTheme[] = ['nexus', 'obsidian', 'aether', 'vertex', 'crimson', 'midnight', 'cyber', 'aurora', 'solaris', 'royale', 'terminal'];

export const GlobalSettings: React.FC<GlobalSettingsProps> = ({
    isOpen, onClose,
    currentTheme, onSetTheme, customColors, onUpdateCustomColor,
    profiles, activeProfileId, onSelectProfile, onOpenVoiceSettings,
    memory, onUpdateMemory
}) => {
    const [activeTab, setActiveTab] = useState<'appearance' | 'persona' | 'memory'>('appearance');
    const [newItem, setNewItem] = useState('');

    if (!isOpen) return null;

    // --- MEMORY HANDLERS ---
    const handleAddMemory = (category: 'session' | 'workspace') => {
        if (!newItem.trim()) return;
        onUpdateMemory({
            ...memory,
            [category]: [...memory[category], newItem.trim()]
        });
        setNewItem('');
    };

    const handleRemoveMemory = (category: 'session' | 'workspace', index: number) => {
        const list = [...memory[category]];
        list.splice(index, 1);
        onUpdateMemory({
            ...memory,
            [category]: list
        });
    };

    const handleUpdateUser = (key: keyof typeof memory.user, value: string) => {
        onUpdateMemory({
            ...memory,
            user: { ...memory.user, [key]: value }
        });
    };

    const handleWipeSession = () => {
        onUpdateMemory({
            ...memory,
            session: []
        });
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-skin-base border border-skin-border rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-skin-border bg-skin-surface flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold text-skin-text tracking-tight">Settings & Configuration</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-skin-muted hover:text-skin-text transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-skin-border bg-skin-base/50 shrink-0">
                    <button 
                        onClick={() => setActiveTab('appearance')}
                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'appearance' ? 'bg-skin-surface border-b-2 border-skin-accent text-skin-text' : 'text-skin-muted hover:text-skin-text'}`}
                    >
                        Appearance
                    </button>
                    <button 
                        onClick={() => setActiveTab('persona')}
                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'persona' ? 'bg-skin-surface border-b-2 border-skin-accent text-skin-text' : 'text-skin-muted hover:text-skin-text'}`}
                    >
                        Persona
                    </button>
                    <button 
                        onClick={() => setActiveTab('memory')}
                        className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === 'memory' ? 'bg-skin-surface border-b-2 border-skin-accent text-skin-text' : 'text-skin-muted hover:text-skin-text'}`}
                    >
                        Memory Management
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-skin-base/30">
                    
                    {/* TAB: APPEARANCE */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                            
                            {/* Theme Grid */}
                            <div>
                                <h3 className="text-sm font-bold text-skin-muted uppercase tracking-widest mb-4">Select Theme</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {THEMES.map(t => (
                                        <button
                                            key={t}
                                            onClick={() => onSetTheme(t)}
                                            className={`
                                                relative p-4 rounded-xl border text-left transition-all hover:scale-105
                                                ${currentTheme === t ? 'border-skin-accent bg-skin-surface ring-1 ring-skin-accent' : 'border-skin-border bg-skin-base hover:border-skin-muted'}
                                            `}
                                        >
                                            <div className="text-xs font-bold uppercase mb-2" style={{ color: t === 'custom' ? 'var(--color-text-main)' : undefined }}>{t}</div>
                                            {/* Preview dots */}
                                            <div className="flex gap-1" data-theme={t}>
                                                <div className="w-3 h-3 rounded-full bg-[var(--color-base)] border border-white/20"></div>
                                                <div className="w-3 h-3 rounded-full bg-[var(--color-accent)]"></div>
                                                <div className="w-3 h-3 rounded-full bg-[var(--color-secondary)]"></div>
                                            </div>
                                        </button>
                                    ))}
                                    
                                    {/* Custom Option */}
                                    <button
                                        onClick={() => onSetTheme('custom')}
                                        className={`
                                            relative p-4 rounded-xl border text-left transition-all hover:scale-105
                                            ${currentTheme === 'custom' ? 'border-skin-accent bg-skin-surface ring-1 ring-skin-accent' : 'border-skin-border bg-skin-base hover:border-skin-muted'}
                                        `}
                                    >
                                        <div className="text-xs font-bold uppercase mb-2 text-skin-text">Custom</div>
                                        <div className="flex gap-1">
                                             <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.base }}></div>
                                             <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.accent }}></div>
                                             <div className="w-3 h-3 rounded-full" style={{ backgroundColor: customColors.surface }}></div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Customizer */}
                            {currentTheme === 'custom' && (
                                <div className="glass-panel p-6 rounded-xl border border-skin-border animate-in fade-in">
                                    <h3 className="text-sm font-bold text-skin-text mb-4">Custom Theme Editor</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {[
                                            { key: 'base', label: 'Background Base' },
                                            { key: 'surface', label: 'Surface / Panel' },
                                            { key: 'accent', label: 'Primary Accent' },
                                            { key: 'text', label: 'Main Text' },
                                            { key: 'muted', label: 'Muted Text' }
                                        ].map(({key, label}) => (
                                            <div key={key}>
                                                <label className="block text-xs font-bold text-skin-muted uppercase mb-2">{label}</label>
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                        type="color" 
                                                        value={customColors[key as keyof CustomThemeConfig]}
                                                        onChange={(e) => onUpdateCustomColor(key as keyof CustomThemeConfig, e.target.value)}
                                                        className="h-10 w-20 bg-transparent border-0 cursor-pointer rounded overflow-hidden"
                                                    />
                                                    <span className="font-mono text-xs text-skin-text">{customColors[key as keyof CustomThemeConfig]}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p className="mt-4 text-[10px] text-skin-muted">
                                        Changes are applied in real-time. Use high contrast colors for accessibility.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB: PERSONA */}
                    {activeTab === 'persona' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <h3 className="text-sm font-bold text-skin-muted uppercase tracking-widest mb-4">Active Persona Preset</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {profiles.map(p => {
                                    const isActive = activeProfileId === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => onSelectProfile(p.id)}
                                            className={`
                                                p-5 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden
                                                ${isActive ? 'bg-skin-accent-dim/20 border-skin-accent ring-1 ring-skin-accent shadow-lg' : 'bg-skin-surface border-skin-border hover:border-skin-muted'}
                                            `}
                                        >
                                            {isActive && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-skin-accent"></div>}
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className={`text-sm font-bold ${isActive ? 'text-skin-accent' : 'text-skin-text'}`}>{p.name}</h4>
                                                <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded text-skin-muted uppercase">{p.voiceName}</span>
                                            </div>
                                            
                                            {/* Derived Stats display */}
                                            <div className="flex gap-2 mb-3">
                                                <div className="flex flex-col items-center">
                                                    <div className="h-10 w-1.5 bg-skin-border rounded-full overflow-hidden relative">
                                                        <div className="absolute bottom-0 w-full bg-skin-secondary" style={{ height: `${p.warmth * 10}%` }}></div>
                                                    </div>
                                                    <span className="text-[9px] text-skin-muted mt-1 uppercase">Warm</span>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <div className="h-10 w-1.5 bg-skin-border rounded-full overflow-hidden relative">
                                                        <div className="absolute bottom-0 w-full bg-orange-400" style={{ height: `${p.energy * 10}%` }}></div>
                                                    </div>
                                                    <span className="text-[9px] text-skin-muted mt-1 uppercase">Egy</span>
                                                </div>
                                                <div className="flex flex-col items-center">
                                                    <div className="h-10 w-1.5 bg-skin-border rounded-full overflow-hidden relative">
                                                        <div className="absolute bottom-0 w-full bg-indigo-400" style={{ height: `${p.brevity * 10}%` }}></div>
                                                    </div>
                                                    <span className="text-[9px] text-skin-muted mt-1 uppercase">Brev</span>
                                                </div>
                                            </div>

                                            <p className="text-xs text-skin-muted line-clamp-2 leading-relaxed">
                                                {p.emotionalDrift ? "Adapts emotionally to user." : "Maintains consistent tone."} 
                                                {p.challengeLevel > 6 ? " Challenges assumptions." : " Supportive and helpful."}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                            
                            {/* Advanced Tuning Link */}
                            <div className="mt-4 p-4 bg-skin-surface rounded-xl border border-skin-border flex flex-col md:flex-row items-center gap-4 text-center md:text-left shadow-lg">
                                <div className="flex items-center gap-3 flex-1">
                                    <div className="p-2 bg-skin-accent/10 rounded-full">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-skin-accent">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                                        </svg>
                                    </div>
                                    <p className="text-xs text-skin-muted">
                                        Need finer control? Adjust pitch, speed, and specific behavioral patterns in the Advanced Tuning Studio.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => {
                                        onClose();
                                        onOpenVoiceSettings();
                                    }}
                                    className="w-full md:w-auto px-6 py-3 bg-skin-surface hover:bg-skin-surface-hover border border-skin-border hover:border-skin-accent text-skin-text rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-md active:scale-95 whitespace-nowrap"
                                >
                                    Open Tuning Studio
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB: MEMORY */}
                    {activeTab === 'memory' && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                            
                            {/* User Identity */}
                            <div className="glass-panel p-6 rounded-xl border border-skin-border">
                                <h3 className="text-sm font-bold text-skin-text mb-4 border-b border-skin-border pb-2">User Identity</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-skin-muted uppercase mb-1">Name</label>
                                        <input 
                                            type="text" 
                                            value={memory.user.name}
                                            onChange={(e) => handleUpdateUser('name', e.target.value)}
                                            className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-skin-muted uppercase mb-1">Tone Preference</label>
                                        <input 
                                            type="text" 
                                            value={memory.user.tonePreference}
                                            onChange={(e) => handleUpdateUser('tonePreference', e.target.value)}
                                            className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Session Memory */}
                            <div className="glass-panel p-6 rounded-xl border border-skin-border">
                                <div className="flex justify-between items-center mb-4 border-b border-skin-border pb-2">
                                    <h3 className="text-sm font-bold text-skin-text">Session Context</h3>
                                    <button 
                                        onClick={handleWipeSession}
                                        className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase border border-red-500/30 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20"
                                    >
                                        Wipe Session
                                    </button>
                                </div>
                                <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                    {memory.session.length === 0 && <p className="text-xs text-skin-muted italic">No active session memory.</p>}
                                    {memory.session.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-black/20 p-2 rounded text-xs text-skin-text group">
                                            <span>{item}</span>
                                            <button 
                                                onClick={() => handleRemoveMemory('session', idx)}
                                                className="text-skin-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newItem}
                                        onChange={(e) => setNewItem(e.target.value)}
                                        placeholder="Add context manually..."
                                        className="flex-1 glass-input rounded-lg px-3 py-2 text-xs"
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddMemory('session')}
                                    />
                                    <button 
                                        onClick={() => handleAddMemory('session')}
                                        className="px-3 py-2 bg-skin-surface border border-skin-border rounded-lg text-xs font-bold uppercase hover:bg-skin-surface-hover"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>

                            {/* Workspace Memory */}
                            <div className="glass-panel p-6 rounded-xl border border-skin-border">
                                <h3 className="text-sm font-bold text-skin-text mb-4 border-b border-skin-border pb-2">Workspace Knowledge</h3>
                                <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                    {memory.workspace.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-black/20 p-2 rounded text-xs text-skin-text group">
                                            <span>{item}</span>
                                            <button 
                                                onClick={() => handleRemoveMemory('workspace', idx)}
                                                className="text-skin-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-skin-accent-dim/10 rounded-lg text-xs text-skin-muted border border-skin-border border-dashed text-center">
                                    Workspace memory is shared across sessions. Use the "Add" input above to inject facts into the current context, then they persist here.
                                </div>
                            </div>

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
