
import React, { useState, useEffect, useRef } from 'react';
import { VoiceProfile, VoiceName } from '../types';

interface VoiceSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    profiles: VoiceProfile[];
    activeProfileId: string;
    onSelectProfile: (id: string) => void;
    onUpdateProfile: (id: string, updates: Partial<VoiceProfile>) => void;
    userName: string;
    onUpdateUserName: (name: string) => void;
}

// Reusable Tooltip Component - Touch Friendly & Clipping Fixed
const Tooltip: React.FC<{ title: string; content: string }> = ({ title, content }) => {
    const [isVisible, setIsVisible] = useState(false);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Close on click outside or touch outside
    useEffect(() => {
        const handleClickOutside = (event: Event) => {
            // Check if click/touch is inside the tooltip container (button)
            if (tooltipRef.current && tooltipRef.current.contains(event.target as Node)) {
                return;
            }
            // Check if click is inside the tooltip content (for the fixed elements which might be outside the ref in DOM tree)
            const target = event.target as HTMLElement;
            if (target.closest('.tooltip-content')) {
                return;
            }

            setIsVisible(false);
        };

        if (isVisible) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        }
    }, [isVisible]);
    
    return (
        <div 
            className="relative inline-flex items-center ml-2"
            ref={tooltipRef}
        >
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsVisible(!isVisible);
                }}
                className={`w-4 h-4 rounded-full border border-skin-border text-[10px] flex items-center justify-center transition-colors hover:border-skin-accent hover:text-skin-accent active:bg-skin-accent active:text-skin-base ${isVisible ? 'border-skin-accent text-skin-accent bg-skin-accent/10' : 'text-skin-muted'}`}
                aria-label="Info"
            >
                ?
            </button>
            {isVisible && (
                <>
                    {/* MOBILE: Fixed Overlay (Toast Style) - Prevents clipping and off-screen issues */}
                    <div className="md:hidden fixed left-4 right-4 bottom-8 z-[200] animate-in slide-in-from-bottom-5 duration-200 tooltip-content">
                        <div className="glass-panel p-4 rounded-xl border border-skin-border shadow-[0_0_50px_rgba(0,0,0,0.5)] bg-black/95 backdrop-blur-xl">
                            <div className="flex justify-between items-start mb-2">
                                <h5 className="text-sm font-bold text-skin-accent flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                                    </svg>
                                    {title}
                                </h5>
                                <button onClick={() => setIsVisible(false)} className="text-skin-muted p-2 -mr-2 -mt-2 hover:text-white">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-xs text-skin-text leading-relaxed opacity-90">{content}</p>
                        </div>
                    </div>

                    {/* DESKTOP: Traditional Popover (Enhanced z-index) */}
                    <div className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 z-[200] animate-in fade-in zoom-in-95 duration-150 origin-bottom tooltip-content">
                         <div className="glass-panel p-4 rounded-xl border border-skin-border shadow-2xl bg-black/95 backdrop-blur-xl">
                             <div className="flex justify-between items-start mb-2">
                                 <h5 className="text-sm font-bold text-skin-accent">{title}</h5>
                                 <button onClick={() => setIsVisible(false)} className="text-skin-muted hover:text-white">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                 </button>
                             </div>
                             <p className="text-xs text-skin-text leading-relaxed opacity-90">{content}</p>
                             <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-black/95 border-r border-b border-skin-border transform rotate-45"></div>
                         </div>
                    </div>
                </>
            )}
        </div>
    );
};

// Reusable Slider Component
const SliderControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    displayValue: string | number;
    onChange: (val: number) => void;
    tooltipTitle: string;
    tooltipContent: string;
    colorClass?: string;
}> = ({ label, value, min, max, step, displayValue, onChange, tooltipTitle, tooltipContent, colorClass = "from-skin-secondary to-skin-accent" }) => (
    <div className="py-2">
        <div className="flex justify-between items-end mb-3">
            <div className="flex items-center">
                <span className="text-xs font-bold text-skin-muted uppercase tracking-wider">{label}</span>
                <Tooltip title={tooltipTitle} content={tooltipContent} />
            </div>
            <span className="font-mono text-xs font-bold text-skin-accent bg-skin-surface px-2 py-0.5 rounded border border-skin-border min-w-[3rem] text-center">
                {displayValue}
            </span>
        </div>
        <div className="relative h-6 flex items-center group cursor-pointer touch-none">
            <div className="absolute w-full h-1.5 bg-skin-surface rounded-full overflow-hidden border border-skin-border group-hover:border-skin-muted transition-colors">
                <div 
                    className={`h-full bg-gradient-to-r ${colorClass} transition-all duration-100 ease-out`}
                    style={{ width: `${((value - min) / (max - min)) * 100}%` }}
                ></div>
            </div>
            <input 
                type="range" min={min} max={max} step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div 
                className="absolute w-5 h-5 bg-skin-text rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 border-skin-base transition-all duration-75 pointer-events-none transform -translate-x-1/2 group-active:scale-110 group-hover:border-skin-accent"
                style={{ left: `${((value - min) / (max - min)) * 100}%` }}
            ></div>
        </div>
    </div>
);

// Toggle Group Component
const ToggleGroup: React.FC<{
    label: string;
    options: string[];
    value: string;
    onChange: (val: string) => void;
    tooltipTitle: string;
    tooltipContent: string;
}> = ({ label, options, value, onChange, tooltipTitle, tooltipContent }) => (
    <div className="pt-2">
        <div className="flex items-center mb-3">
            <span className="text-xs font-bold text-skin-muted uppercase tracking-wider">{label}</span>
            <Tooltip title={tooltipTitle} content={tooltipContent} />
        </div>
        <div className="flex bg-skin-base rounded-lg p-1 border border-skin-border h-9">
            {options.map((opt) => (
                <button
                    key={opt}
                    onClick={() => onChange(opt)}
                    className={`flex-1 text-[10px] uppercase font-bold rounded transition-all ${value === opt ? 'bg-skin-surface border border-skin-border text-skin-text shadow-sm' : 'text-skin-muted hover:text-skin-text'}`}
                >
                    {opt}
                </button>
            ))}
        </div>
    </div>
);

// Boolean Switch Component
const SwitchControl: React.FC<{
    label: string;
    value: boolean;
    onChange: (val: boolean) => void;
    tooltipTitle: string;
    tooltipContent: string;
}> = ({ label, value, onChange, tooltipTitle, tooltipContent }) => (
    <div className="flex items-center justify-between py-2">
        <div className="flex items-center">
            <span className="text-xs font-bold text-skin-muted uppercase tracking-wider">{label}</span>
            <Tooltip title={tooltipTitle} content={tooltipContent} />
        </div>
        <button 
            onClick={() => onChange(!value)}
            className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${value ? 'bg-skin-accent' : 'bg-skin-surface border border-skin-border'}`}
        >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : ''}`}></div>
        </button>
    </div>
);

export const VoiceSettings: React.FC<VoiceSettingsProps> = ({ 
    isOpen, onClose, profiles, activeProfileId, onSelectProfile, onUpdateProfile, userName, onUpdateUserName 
}) => {
    if (!isOpen) return null;

    const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

    return (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="glass-panel w-full h-[100dvh] md:h-[90vh] md:max-w-6xl md:rounded-2xl shadow-2xl flex flex-col border border-skin-border relative overflow-hidden animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="px-4 py-4 md:px-6 border-b border-skin-border bg-skin-surface/95 backdrop-blur-xl flex justify-between items-center shrink-0 z-20">
                    <h3 className="text-lg md:text-xl font-bold text-skin-text tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-skin-accent/10 rounded-lg border border-skin-accent/20">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-skin-accent">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                            </svg>
                        </div>
                        Voice Tuning Studio
                    </h3>
                    <button 
                        onClick={onClose} 
                        className="p-2 -mr-2 text-skin-muted hover:text-white hover:bg-white/10 rounded-full transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
                    
                    {/* Sidebar: Profiles (Responsive) */}
                    <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-skin-border bg-skin-surface/30 flex-shrink-0 flex flex-col z-10">
                        <div className="hidden md:block px-6 py-4 border-b border-skin-border/50">
                            <h4 className="text-[10px] font-bold text-skin-muted uppercase tracking-widest">Active Persona</h4>
                        </div>
                        
                        <div className="p-4 md:p-0 overflow-x-auto md:overflow-y-auto custom-scrollbar flex md:flex-col gap-3 md:gap-0 h-auto md:h-full">
                            {profiles.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => onSelectProfile(p.id)}
                                    className={`
                                        shrink-0 relative group overflow-hidden transition-all duration-300
                                        rounded-xl md:rounded-none border md:border-0 md:border-b md:border-skin-border/30 text-left
                                        w-40 md:w-full p-3 md:p-5
                                        ${activeProfileId === p.id 
                                            ? 'bg-skin-accent-dim/10 border-skin-accent md:border-b-skin-border/30 ring-1 md:ring-0 ring-skin-accent shadow-inner' 
                                            : 'bg-skin-surface md:bg-transparent border-skin-border md:border-transparent hover:bg-white/5'
                                        }
                                    `}
                                >
                                    {activeProfileId === p.id && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-skin-accent hidden md:block"></div>
                                    )}
                                    <div className={`font-bold text-sm mb-1 truncate pr-2 ${activeProfileId === p.id ? 'text-skin-accent' : 'text-skin-muted group-hover:text-skin-text'}`}>
                                        {p.name}
                                    </div>
                                    <div className="flex items-center justify-between">
                                         <div className="text-[10px] uppercase tracking-wider opacity-70 text-skin-muted">{p.voiceName}</div>
                                         {activeProfileId === p.id && (
                                             <div className="w-1.5 h-1.5 rounded-full bg-skin-accent animate-pulse shadow-glow"></div>
                                         )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main: Controls */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-skin-base/50 p-5 md:p-8 pb-20 md:pb-8">

                        {/* User Identity Block */}
                        <div className="mb-10 bg-gradient-to-br from-skin-surface to-transparent border border-skin-border rounded-xl p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="w-1.5 h-4 bg-white rounded-full shadow-glow"></span>
                                <h4 className="text-sm font-bold text-skin-text">User Identity</h4>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-skin-muted uppercase tracking-wider mb-2">
                                        Your Name (For personalization)
                                    </label>
                                    <input 
                                        type="text" 
                                        value={userName}
                                        onChange={(e) => onUpdateUserName(e.target.value)}
                                        className="w-full glass-input rounded-lg px-4 py-3 text-skin-text focus:ring-1 focus:ring-skin-accent outline-none font-medium text-sm"
                                        placeholder="How should I address you?"
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                            
                            {/* Column 1 */}
                            <div className="space-y-10">
                                
                                {/* Section 1: Human Realism (NEW) */}
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <h4 className="text-sm font-bold text-skin-text mb-6 flex items-center gap-2 border-b border-skin-border pb-3">
                                        <span className="w-1.5 h-4 bg-skin-accent rounded-full shadow-glow"></span>
                                        Human Realism
                                    </h4>
                                    <div className="space-y-4">
                                        <ToggleGroup 
                                            label="Micro-Hesitations"
                                            options={['off', 'low', 'natural']}
                                            value={activeProfile.microHesitation}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { microHesitation: v as any })}
                                            tooltipTitle="Micro-Hesitations"
                                            tooltipContent="Controls small pauses and '...' moments where the AI seems to be searching for a word. 'Natural' adds authentic cognitive pauses."
                                        />
                                        <SwitchControl 
                                            label="Self-Correction"
                                            value={activeProfile.selfCorrection}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { selfCorrection: v })}
                                            tooltipTitle="Self-Correction"
                                            tooltipContent="Allows the model to restart a sentence or reframe a thought mid-stream ('Actually, let me put it this way...')."
                                        />
                                        <SwitchControl 
                                            label="False Start Allowance"
                                            value={activeProfile.falseStartAllowance}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { falseStartAllowance: v })}
                                            tooltipTitle="False Start Allowance"
                                            tooltipContent="Permits conversational messiness where a sentence might be abandoned for a better one, mimicking human thought flow."
                                        />
                                        <SwitchControl 
                                            label="Varied Sentence Completion"
                                            value={activeProfile.sentenceCompletionVariability}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { sentenceCompletionVariability: v })}
                                            tooltipTitle="Sentence Variability"
                                            tooltipContent="Allows sentences to occasionally trail off or end softly, rather than always having a perfect 'landing'."
                                        />
                                    </div>
                                </div>

                                {/* Section 2: Cognitive Timing (NEW) */}
                                <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 delay-100">
                                    <h4 className="text-sm font-bold text-skin-text mb-6 flex items-center gap-2 border-b border-skin-border pb-3">
                                        <span className="w-1.5 h-4 bg-skin-secondary rounded-full shadow-glow"></span>
                                        Cognitive Timing
                                    </h4>
                                    <div className="space-y-4">
                                        <ToggleGroup 
                                            label="Thought-Before-Speech Delay"
                                            options={['off', 'short', 'variable']}
                                            value={activeProfile.thoughtDelay}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { thoughtDelay: v as any })}
                                            tooltipTitle="Thought Delay"
                                            tooltipContent="Simulates 'thinking time' before answering complex questions. 'Variable' scales delay based on question difficulty."
                                        />
                                        <SwitchControl 
                                            label="Mid-Response Adaptation"
                                            value={activeProfile.midResponseAdaptation}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { midResponseAdaptation: v })}
                                            tooltipTitle="Mid-Response Adaptation"
                                            tooltipContent="Allows tone or pacing to shift in the middle of an answer, as if the AI is realizing a new nuance while speaking."
                                        />
                                    </div>
                                </div>

                                {/* Section 3: Imperfection Engine */}
                                <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 delay-150">
                                    <h4 className="text-sm font-bold text-skin-text mb-6 flex items-center gap-2 border-b border-skin-border pb-3">
                                        <span className="w-1.5 h-4 bg-purple-500 rounded-full shadow-glow"></span>
                                        Imperfection Engine
                                    </h4>
                                    <div className="space-y-4">
                                        <ToggleGroup 
                                            label="Natural Fillers"
                                            options={['off', 'rare', 'contextual']}
                                            value={activeProfile.naturalFillers}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { naturalFillers: v as any })}
                                            tooltipTitle="Natural Fillers"
                                            tooltipContent="Injects 'um', 'uh', or 'you know' only when conversationally justified. 'Contextual' is the most advanced setting."
                                        />
                                        <ToggleGroup 
                                            label="Soft Laughter"
                                            options={['off', 'rare']}
                                            value={activeProfile.laughter}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { laughter: v as any })}
                                            tooltipTitle="Laughter"
                                            tooltipContent="Permits occasional light chuckles in reaction to humor. 'Rare' ensures it doesn't become annoying."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Column 2 */}
                            <div className="space-y-10">
                                
                                {/* Section 4: Acoustic Texture */}
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                                    <h4 className="text-sm font-bold text-skin-text mb-6 flex items-center gap-2 border-b border-skin-border pb-3">
                                        <span className="w-1.5 h-4 bg-orange-500 rounded-full shadow-glow"></span>
                                        Acoustic Texture
                                    </h4>
                                    <div className="space-y-6">
                                        <SliderControl 
                                            label="Pace"
                                            value={activeProfile.pace} min={0.8} max={1.5} step={0.05} displayValue={`${activeProfile.pace}x`}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { pace: v })}
                                            tooltipTitle="Pace"
                                            tooltipContent="Baseline speaking rate."
                                            colorClass="from-orange-400 to-red-500"
                                        />
                                        <SliderControl 
                                            label="Pause Density"
                                            value={activeProfile.pauseDensity} min={1} max={10} step={1} displayValue={`${activeProfile.pauseDensity}/10`}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { pauseDensity: v })}
                                            tooltipTitle="Pause Density"
                                            tooltipContent="Frequency of silences. High density feels thoughtful; low feels rehearsed."
                                            colorClass="from-purple-400 to-pink-500"
                                        />
                                        <ToggleGroup 
                                            label="Breath Placement"
                                            options={['off', 'subtle']}
                                            value={activeProfile.breathPlacement}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { breathPlacement: v as any })}
                                            tooltipTitle="Breath Placement"
                                            tooltipContent="Adds subtle intakes of breath before long phrases for physiological realism."
                                        />
                                        <SwitchControl 
                                            label="Prosodic Drift"
                                            value={activeProfile.prosodicDrift}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { prosodicDrift: v })}
                                            tooltipTitle="Prosodic Drift"
                                            tooltipContent="Prevents monotone delivery by allowing pitch to drift naturally over longer responses."
                                        />
                                        <SwitchControl 
                                            label="Emphasis Decay"
                                            value={activeProfile.emphasisDecay}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { emphasisDecay: v })}
                                            tooltipTitle="Emphasis Decay"
                                            tooltipContent="Prevents the 'salesman voice' effect where every key word is over-emphasized. Reduces stress on repeated terms."
                                        />
                                    </div>
                                </div>

                                {/* Section 5: Personality Matrix */}
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
                                    <h4 className="text-sm font-bold text-skin-text mb-6 flex items-center gap-2 border-b border-skin-border pb-3">
                                        <span className="w-1.5 h-4 bg-red-500 rounded-full shadow-glow"></span>
                                        Personality Matrix
                                    </h4>
                                    <div className="space-y-6">
                                        <SliderControl 
                                            label="Warmth"
                                            value={activeProfile.warmth} min={1} max={10} step={1} displayValue={`${activeProfile.warmth}/10`}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { warmth: v })}
                                            tooltipTitle="Warmth"
                                            tooltipContent="Tonal softness and empathy."
                                            colorClass="from-pink-400 to-rose-500"
                                        />
                                        <SliderControl 
                                            label="Firmness"
                                            value={activeProfile.firmness} min={1} max={10} step={1} displayValue={`${activeProfile.firmness}/10`}
                                            onChange={(v) => onUpdateProfile(activeProfile.id, { firmness: v })}
                                            tooltipTitle="Firmness"
                                            tooltipContent="Authoritative weight and certainty."
                                            colorClass="from-slate-400 to-slate-200"
                                        />
                                        
                                        {/* Emotional Drift Toggle */}
                                        <div className="flex items-center justify-between bg-gradient-to-r from-indigo-900/20 to-transparent p-4 rounded-xl border border-skin-border/50 hover:border-skin-accent/30 transition-colors mt-8">
                                            <div className="flex items-center">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 transition-colors ${activeProfile.emotionalDrift ? 'bg-indigo-500 text-white shadow-glow' : 'bg-skin-surface text-skin-muted'}`}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.58 0A6 6 0 0110 8V6a6 6 0 016 0v2a6 6 0 01-1.41 4.37zM14 20H10" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-skin-text uppercase tracking-wider">Emotional Drift</span>
                                                        <Tooltip title="Emotional Drift" content="Allows tone to evolve dynamically within a session based on user sentiment analysis." />
                                                    </div>
                                                    <span className="text-[10px] text-skin-muted">{activeProfile.emotionalDrift ? 'Dynamic Adaptation Active' : 'Consistent Persona Locked'}</span>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => onUpdateProfile(activeProfile.id, { emotionalDrift: !activeProfile.emotionalDrift })}
                                                className={`relative w-12 h-6 rounded-full transition-all duration-300 ${activeProfile.emotionalDrift ? 'bg-indigo-500 shadow-inner' : 'bg-skin-surface border border-skin-border'}`}
                                            >
                                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm ${activeProfile.emotionalDrift ? 'translate-x-6' : ''}`}></div>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
