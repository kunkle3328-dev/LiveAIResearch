
import React, { useState, useEffect } from 'react';
import { PROMPT_MODULES } from '../utils/prompts';

interface SystemPromptEditorProps {
  isOpen: boolean;
  onClose: () => void;
  config: {
    modules: { [key: string]: boolean };
    customInstruction: string;
  };
  onApply: (config: { modules: { [key: string]: boolean }; customInstruction: string }) => void;
}

export const SystemPromptEditor: React.FC<SystemPromptEditorProps> = ({ isOpen, onClose, config, onApply }) => {
  const [localConfig, setLocalConfig] = useState(config);
  const [activeTab, setActiveTab] = useState<'configure' | 'preview'>('configure');

  // Reset local state when opening
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const toggleModule = (key: string) => {
    setLocalConfig(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [key]: !prev.modules[key]
      }
    }));
  };

  const getPreviewText = () => {
    let parts: string[] = [];
    Object.entries(localConfig.modules).forEach(([key, enabled]) => {
      if (enabled && PROMPT_MODULES[key as keyof typeof PROMPT_MODULES]) {
        parts.push(PROMPT_MODULES[key as keyof typeof PROMPT_MODULES].content);
      }
    });
    if (localConfig.customInstruction.trim()) {
      parts.push(`CUSTOM OPERATIONAL INSTRUCTIONS:\n${localConfig.customInstruction}`);
    }
    return parts.join('\n\n');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col border border-skin-border relative overflow-hidden animate-in zoom-in-95 duration-300 h-[85vh]">
        
        {/* Header with Gradient */}
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-skin-accent via-skin-secondary to-skin-accent"></div>
        
        <div className="px-6 py-4 border-b border-skin-border flex justify-between items-center bg-skin-surface shrink-0">
          <h3 className="text-lg font-bold text-skin-text tracking-tight flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-skin-accent">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
            System Prompt Configuration
          </h3>
          <button onClick={onClose} className="text-skin-muted hover:text-skin-text transition-colors p-2 hover:bg-white/5 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-skin-border bg-skin-base/30 shrink-0">
            <button 
                onClick={() => setActiveTab('configure')}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'configure' ? 'text-skin-text border-b-2 border-skin-accent bg-skin-surface' : 'text-skin-muted hover:text-skin-text'}`}
            >
                Configuration
            </button>
            <button 
                onClick={() => setActiveTab('preview')}
                className={`px-6 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'preview' ? 'text-skin-text border-b-2 border-skin-secondary bg-skin-surface' : 'text-skin-muted hover:text-skin-text'}`}
            >
                Preview Output
            </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
            
            {activeTab === 'configure' && (
                <div className="absolute inset-0 p-6 overflow-y-auto custom-scrollbar flex flex-col md:flex-row gap-6">
                    {/* Left: Modules */}
                    <div className="w-full md:w-1/3 shrink-0 space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-skin-muted uppercase tracking-widest">Active Modules</h4>
                            <span className="text-[10px] text-skin-text bg-skin-surface-hover px-2 py-0.5 rounded-full border border-skin-border">{Object.values(localConfig.modules).filter(Boolean).length} / {Object.keys(PROMPT_MODULES).length}</span>
                        </div>
                        <div className="space-y-2">
                           {Object.entries(PROMPT_MODULES).map(([key, module]) => (
                               <label key={key} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all group ${localConfig.modules[key] ? 'bg-skin-accent-dim border-skin-accent' : 'bg-skin-surface border-skin-border hover:bg-skin-surface-hover'}`}>
                                  <span className={`text-sm font-medium ${localConfig.modules[key] ? 'text-skin-text' : 'text-skin-muted group-hover:text-skin-text'}`}>{module.label}</span>
                                  <div className="relative inline-flex items-center cursor-pointer pointer-events-none">
                                    <input 
                                      type="checkbox" 
                                      className="sr-only peer"
                                      checked={localConfig.modules[key]}
                                      onChange={() => toggleModule(key)}
                                    />
                                    <div className="w-9 h-5 bg-skin-surface-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-skin-base after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-skin-text after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-skin-accent"></div>
                                  </div>
                               </label>
                           ))}
                        </div>
                    </div>

                    {/* Right: Custom Instruction */}
                    <div className="flex-1 flex flex-col h-full min-h-[400px] md:min-h-0">
                        <h4 className="text-xs font-bold text-skin-muted uppercase tracking-widest mb-4">Custom Instructions</h4>
                        <div className="flex-1 relative w-full h-full">
                            <textarea 
                                value={localConfig.customInstruction}
                                onChange={(e) => setLocalConfig(prev => ({ ...prev, customInstruction: e.target.value }))}
                                className="absolute inset-0 w-full h-full bg-skin-base border border-skin-border rounded-xl p-4 text-sm font-mono text-skin-text focus:ring-1 focus:ring-skin-accent outline-none resize-none leading-relaxed custom-scrollbar placeholder-skin-muted"
                                placeholder="Enter specific behavioral instructions here. These will be appended to the active modules..."
                            />
                        </div>
                        <p className="text-[10px] text-skin-muted mt-2">
                            Tip: These instructions override module defaults if there is a conflict.
                        </p>
                    </div>
                </div>
            )}

            {activeTab === 'preview' && (
                <div className="absolute inset-0 p-6 overflow-hidden flex flex-col">
                    <div className="flex-1 bg-skin-base rounded-xl border border-skin-border overflow-y-auto custom-scrollbar p-4">
                        <pre className="text-xs font-mono text-skin-text whitespace-pre-wrap leading-relaxed">
                            {getPreviewText()}
                        </pre>
                    </div>
                    <p className="text-[10px] text-skin-muted mt-2 text-center">
                        This preview shows the static prompt components. Dynamic user context and director notes are injected at runtime.
                    </p>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-skin-border bg-skin-surface flex justify-end gap-3 shrink-0">
             <button 
                onClick={onClose}
                className="px-4 py-2 text-skin-muted hover:text-skin-text text-xs font-bold uppercase transition-colors"
             >
                Cancel
             </button>
             <button 
                onClick={() => onApply(localConfig)}
                className="btn-glow px-6 py-2 rounded-lg text-xs font-bold uppercase"
             >
                Apply Configuration
             </button>
        </div>
      </div>
    </div>
  );
};
