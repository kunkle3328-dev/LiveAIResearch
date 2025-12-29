
import React, { useEffect, useState, useRef } from 'react';
import { AudioSessionManager, InterruptMode } from '../../services/AudioSessionManager';
import { AudioTelemetryEvent } from '../../types';

export const AudioDashboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const manager = useRef(AudioSessionManager.getInstance()).current;
    const [logs, setLogs] = useState<AudioTelemetryEvent[]>([]);
    const [debugState, setDebugState] = useState<any>({});
    const [activeTab, setActiveTab] = useState<'logs' | 'state'>('logs');

    useEffect(() => {
        // Poll for updates (in a real app, we'd use an event emitter or subscription)
        const interval = setInterval(() => {
            setLogs(manager.getLogs().reverse());
            setDebugState(manager.getDebugState());
        }, 500);
        return () => clearInterval(interval);
    }, [manager]);

    const handleExport = () => {
        manager.exportDebugBundle();
    };

    const handleModeToggle = () => {
        const newMode: InterruptMode = debugState.interruptMode === 'pause' ? 'duck' : 'pause';
        manager.setInterruptMode(newMode);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden font-mono text-sm">
                {/* Header */}
                <div className="bg-slate-950 p-4 border-b border-white/10 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                         <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                         <h2 className="text-white font-bold uppercase tracking-widest">Audio Reliability Dashboard</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">Close</button>
                </div>

                {/* Toolbar */}
                <div className="bg-slate-900 p-2 border-b border-white/5 flex gap-2">
                    <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded text-xs uppercase font-bold ${activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>Event Logs</button>
                    <button onClick={() => setActiveTab('state')} className={`px-4 py-2 rounded text-xs uppercase font-bold ${activeTab === 'state' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>System State</button>
                    <div className="flex-1"></div>
                    <button onClick={handleExport} className="px-4 py-2 bg-cyan-900/50 text-cyan-400 border border-cyan-500/30 rounded text-xs uppercase font-bold hover:bg-cyan-900/80">Export Bundle</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-black p-4 text-xs">
                    
                    {activeTab === 'logs' && (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-slate-500 border-b border-white/10">
                                    <th className="p-2 w-24">Time</th>
                                    <th className="p-2 w-20">Level</th>
                                    <th className="p-2 w-24">Category</th>
                                    <th className="p-2">Message</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="p-2 text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                        <td className={`p-2 font-bold uppercase ${
                                            log.level === 'error' ? 'text-red-500' : 
                                            log.level === 'warn' ? 'text-yellow-500' : 'text-green-500'
                                        }`}>{log.level}</td>
                                        <td className="p-2 text-indigo-400">{log.category}</td>
                                        <td className="p-2 text-slate-300">{log.message}
                                            {log.data && <pre className="mt-1 text-slate-500 opacity-50">{JSON.stringify(log.data)}</pre>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {activeTab === 'state' && (
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-slate-500 uppercase font-bold mb-4">Playback Coordinator</h3>
                                <div className="space-y-2 text-slate-300">
                                    <div className="flex justify-between border-b border-white/5 pb-1"><span>Current Focus:</span> <span className="text-white font-bold">{debugState.focus}</span></div>
                                    <div className="flex justify-between border-b border-white/5 pb-1"><span>Podcast Playing:</span> <span className={debugState.hasController ? 'text-green-500' : 'text-red-500'}>{debugState.hasController ? 'Yes' : 'No'}</span></div>
                                    <div className="flex justify-between border-b border-white/5 pb-1"><span>Resume Pending:</span> <span>{debugState.resumeNeeded ? 'True' : 'False'}</span></div>
                                    <div className="flex justify-between border-b border-white/5 pb-1"><span>Current Time:</span> <span>{debugState.podcastTime?.toFixed(2)}s</span></div>
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-slate-500 uppercase font-bold mb-4">Configuration</h3>
                                <div className="space-y-4">
                                     <div className="flex justify-between items-center bg-slate-800 p-3 rounded">
                                         <span>Interrupt Mode</span>
                                         <button onClick={handleModeToggle} className="px-3 py-1 bg-white/10 rounded uppercase text-[10px] font-bold border border-white/10">
                                             {debugState.interruptMode}
                                         </button>
                                     </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
