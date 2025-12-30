
import React, { useState, useEffect } from 'react';
import { AdminConfig, MemoryLayer, TelemetryLevel } from '../types';

interface AdminDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    config: AdminConfig;
    onUpdateConfig: (newConfig: AdminConfig) => void;
    memory: MemoryLayer;
    onWipeMemory: () => void;
}

// Simulated Graph Data Helper
const generateData = (length: number, min: number, max: number) => {
    return Array.from({ length }, () => Math.floor(Math.random() * (max - min + 1) + min));
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
    isOpen, onClose, config, onUpdateConfig, memory, onWipeMemory 
}) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'neural' | 'system' | 'logs'>('overview');
    const [stats, setStats] = useState({
        latency: generateData(20, 20, 150),
        tokens: generateData(20, 10, 500),
        cost: 0.042 // Fake cost accumulator
    });
    
    // Simulate live data updates
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            setStats(prev => ({
                latency: [...prev.latency.slice(1), Math.floor(Math.random() * 100 + 40)],
                tokens: [...prev.tokens.slice(1), Math.random() > 0.8 ? Math.floor(Math.random() * 800) : 0],
                cost: prev.cost + 0.0001
            }));
        }, 1000);
        return () => clearInterval(interval);
    }, [isOpen]);

    if (!isOpen) return null;

    // Mini Graph Component
    const Sparkline = ({ data, color, height = 40 }: { data: number[], color: string, height?: number }) => {
        const max = Math.max(...data, 1);
        const points = data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - (d / max) * 100;
            return `${x},${y}`;
        }).join(' ');

        return (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                <polyline 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="2" 
                    points={points} 
                    vectorEffect="non-scaling-stroke"
                />
                <polygon 
                    fill={color} 
                    fillOpacity="0.1" 
                    points={`0,100 ${points} 100,100`} 
                />
            </svg>
        );
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black text-xs font-mono animate-in fade-in duration-200 flex flex-col">
            {/* Top Bar */}
            <div className="h-12 border-b border-white/10 flex justify-between items-center px-4 bg-slate-950 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-red-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                        </svg>
                        <span className="font-bold tracking-widest text-sm">NEXUS CONTROL</span>
                    </div>
                    <div className="h-4 w-px bg-white/10"></div>
                    <span className="text-slate-500">v.2.5.0-admin</span>
                </div>
                
                <div className="flex items-center gap-4">
                    {config.godMode && <span className="text-red-500 animate-pulse font-bold">GOD MODE ACTIVE</span>}
                    <button 
                        onClick={onClose}
                        className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/5 rounded transition-colors"
                    >
                        EXIT CONSOLE
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <div className="w-48 md:w-64 bg-slate-900 border-r border-white/10 flex flex-col shrink-0">
                    <div className="p-4 border-b border-white/5">
                        <div className="text-[10px] uppercase text-slate-500 font-bold mb-2">Navigation</div>
                        <nav className="space-y-1">
                            {[
                                { id: 'overview', label: 'Dashboard Overview', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
                                { id: 'neural', label: 'Neural Configuration', icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM9.5 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 9a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0-9a1.5 1.5 0 110 3 1.5 1.5 0 010-3z' },
                                { id: 'system', label: 'System & Network', icon: 'M2 12C2 6.48 6.48 2 12 2s10 4.48 10 10-4.48 10-10 10S2 17.52 2 12zm10 6c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6z' },
                                { id: 'logs', label: 'Live Logs', icon: 'M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h7v2H4v-2z' },
                            ].map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id as any)}
                                    className={`w-full text-left px-3 py-2 rounded flex items-center gap-3 transition-colors ${activeTab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d={item.icon}/></svg>
                                    {item.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                    
                    <div className="mt-auto p-4 border-t border-white/5">
                        <div className="bg-slate-800 rounded p-3 mb-3">
                            <div className="text-[10px] text-slate-500 uppercase mb-1">Session Cost</div>
                            <div className="text-xl text-green-400 font-bold">${stats.cost.toFixed(4)}</div>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            System Operational
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-y-auto bg-slate-950 p-6 custom-scrollbar">
                    
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                            <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">Real-Time Telemetry</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-slate-900 border border-white/10 p-4 rounded-lg">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="text-slate-500 text-[10px] uppercase">Est. Latency</div>
                                            <div className="text-2xl font-bold text-white">{stats.latency[stats.latency.length-1]} ms</div>
                                        </div>
                                        <div className="text-green-500 text-xs">OK</div>
                                    </div>
                                    <div className="h-12">
                                        <Sparkline data={stats.latency} color="#22c55e" />
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-white/10 p-4 rounded-lg">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="text-slate-500 text-[10px] uppercase">Token Throughput</div>
                                            <div className="text-2xl font-bold text-white">{stats.tokens[stats.tokens.length-1]} t/s</div>
                                        </div>
                                        <div className="text-indigo-400 text-xs">High</div>
                                    </div>
                                    <div className="h-12">
                                        <Sparkline data={stats.tokens} color="#6366f1" />
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-white/10 p-4 rounded-lg">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="text-slate-500 text-[10px] uppercase">CPU Load (Sim)</div>
                                            <div className="text-2xl font-bold text-white">12%</div>
                                        </div>
                                        <div className="text-blue-400 text-xs">Stable</div>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-800 rounded-full mt-6 overflow-hidden">
                                        <div className="h-full bg-blue-500 w-[12%]"></div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900 border border-white/10 p-6 rounded-lg">
                                <h3 className="text-sm font-bold text-white mb-4">Memory State Inspector</h3>
                                <div className="bg-black border border-white/10 rounded p-4 font-mono text-xs text-green-400 overflow-x-auto">
                                    {JSON.stringify(memory, null, 2)}
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <button 
                                        onClick={onWipeMemory}
                                        className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 rounded transition-colors uppercase font-bold text-xs"
                                    >
                                        Wipe Session Memory
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* NEURAL CONFIG TAB */}
                    {activeTab === 'neural' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                             <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                <h2 className="text-xl font-bold text-white">Neural Hyperparameters</h2>
                                <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/20">Caution: Live Updates</span>
                            </div>

                            {/* GOD MODE CONTROL */}
                            <div className="bg-slate-900 border border-red-500/30 p-6 rounded-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <svg className="w-24 h-24 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2zm0-6h2v4h-2z"/></svg>
                                </div>
                                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                                            GOD MODE
                                            {config.godMode && <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>}
                                        </h3>
                                        <p className="text-slate-400 mt-1 max-w-lg">
                                            Bypasses all System Instructions, Safety Guardrails, and Persona constraints. 
                                            The model will operate in raw, unfiltered mode. 
                                            <span className="text-red-400 font-bold block mt-1">USE WITH EXTREME CAUTION.</span>
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => onUpdateConfig({...config, godMode: !config.godMode})}
                                        className={`px-8 py-4 rounded font-bold text-sm tracking-widest transition-all ${
                                            config.godMode 
                                            ? 'bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.5)] scale-105' 
                                            : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-red-500/50 hover:text-red-400'
                                        }`}
                                    >
                                        {config.godMode ? 'ENABLED' : 'DISABLED'}
                                    </button>
                                </div>
                            </div>

                            {/* Parameters */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-900 border border-white/10 p-5 rounded-lg">
                                    <div className="flex justify-between mb-2">
                                        <label className="text-slate-400 font-bold uppercase">Temperature</label>
                                        <span className="text-cyan-400 font-mono">{config.temperature || 0.7}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="2" step="0.1"
                                        value={config.temperature || 0.7}
                                        onChange={(e) => onUpdateConfig({...config, temperature: parseFloat(e.target.value)})}
                                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-2">Controls randomness. 0.0 is deterministic, 2.0 is highly creative/chaotic.</p>
                                </div>

                                <div className="bg-slate-900 border border-white/10 p-5 rounded-lg">
                                    <div className="flex justify-between mb-4">
                                        <label className="text-slate-400 font-bold uppercase">Safety Filters</label>
                                        <span className={`text-xs uppercase px-2 py-0.5 rounded ${
                                            config.safetyFilters === 'strict' ? 'bg-green-500/20 text-green-400' :
                                            config.safetyFilters === 'relaxed' ? 'bg-yellow-500/20 text-yellow-400' :
                                            'bg-red-500/20 text-red-400'
                                        }`}>{config.safetyFilters}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        {['strict', 'relaxed', 'off'].map((opt) => (
                                            <button
                                                key={opt}
                                                onClick={() => onUpdateConfig({...config, safetyFilters: opt as any})}
                                                className={`flex-1 py-2 rounded text-xs uppercase font-bold border ${
                                                    config.safetyFilters === opt 
                                                    ? 'bg-indigo-600 border-indigo-500 text-white' 
                                                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
                                                }`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SYSTEM TAB */}
                    {activeTab === 'system' && (
                         <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                             <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">System Controls</h2>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-900 border border-white/10 p-5 rounded-lg">
                                    <h3 className="text-sm font-bold text-white mb-4">Maintenance Mode</h3>
                                    <p className="text-slate-400 text-xs mb-4">
                                        If enabled, all non-admin users will be disconnected and shown a maintenance screen.
                                    </p>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${config.maintenanceMode ? 'bg-yellow-500' : 'bg-slate-700'}`} onClick={() => onUpdateConfig({...config, maintenanceMode: !config.maintenanceMode})}>
                                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${config.maintenanceMode ? 'translate-x-6' : ''}`}></div>
                                        </div>
                                        <span className="font-bold">{config.maintenanceMode ? 'ACTIVE' : 'INACTIVE'}</span>
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-white/10 p-5 rounded-lg">
                                    <h3 className="text-sm font-bold text-white mb-4">Global Broadcast</h3>
                                    <input 
                                        type="text" 
                                        placeholder="Enter system message..." 
                                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-white mb-3 focus:border-indigo-500 outline-none"
                                        onChange={(e) => onUpdateConfig({...config, systemBroadcast: e.target.value})}
                                        value={config.systemBroadcast || ''}
                                    />
                                    <div className="flex justify-end">
                                        <button className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs uppercase font-bold">Send</button>
                                    </div>
                                </div>
                             </div>

                             <div className="bg-slate-900 border border-white/10 p-5 rounded-lg">
                                 <h3 className="text-sm font-bold text-white mb-4">Danger Zone</h3>
                                 <div className="flex gap-4">
                                     <button className="px-4 py-2 bg-red-900/20 border border-red-500/50 text-red-400 hover:bg-red-900/40 rounded uppercase font-bold text-xs">
                                         Force Disconnect All
                                     </button>
                                     <button className="px-4 py-2 bg-red-900/20 border border-red-500/50 text-red-400 hover:bg-red-900/40 rounded uppercase font-bold text-xs">
                                         Flush Redis Cache
                                     </button>
                                 </div>
                             </div>
                         </div>
                    )}

                    {/* LOGS TAB (Placeholder) */}
                    {activeTab === 'logs' && (
                        <div className="h-full flex flex-col">
                            <h2 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">System Logs</h2>
                            <div className="flex-1 bg-black border border-white/10 rounded p-4 font-mono text-[10px] text-slate-300 overflow-y-auto">
                                <div className="text-green-500">[SYSTEM] Admin Console Initialized</div>
                                <div className="text-slate-500">[INFO] WebSocket connected pool: 1</div>
                                <div className="text-slate-500">[INFO] Telemetry stream active</div>
                                {stats.latency.map((l, i) => (
                                    <div key={i} className="text-slate-500">
                                        [METRIC] Latency sample: {l}ms - {new Date().toISOString()}
                                    </div>
                                )).slice(-10)}
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
