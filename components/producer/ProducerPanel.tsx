
import React, { useState } from 'react';
import { useProducer } from '../../context/ProducerContext';
import { CallRequest, TranscriptionItem } from '../../types';

interface ProducerPanelProps {
    startAudio: () => Promise<void>;
    stopAudio: () => void;
    liveTranscripts: TranscriptionItem[];
}

export const ProducerPanel: React.FC<ProducerPanelProps> = ({ startAudio, stopAudio, liveTranscripts }) => {
    const { state, acceptCall, declineCall, endActiveCall, screenCall, generateAnswerCard } = useProducer();
    const [view, setView] = useState<'queue' | 'live'>('queue');
    
    // Automatically switch view if live
    React.useEffect(() => {
        if (state.activeCallId) setView('live');
        else setView('queue');
    }, [state.activeCallId]);

    const activeCall = state.queue.find(c => c.id === state.activeCallId);

    const formatTime = (date: Date) => {
        return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="h-full flex flex-col bg-slate-900/80 border-l border-white/5 backdrop-blur-xl">
            {/* Header Tabs */}
            <div className="flex border-b border-white/5">
                <button 
                    onClick={() => setView('queue')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'queue' ? 'bg-white/5 text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-white'}`}
                >
                    Call Queue ({state.queue.filter(c => c.status === 'queued').length})
                </button>
                <button 
                    onClick={() => setView('live')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${view === 'live' ? 'bg-white/5 text-red-400 border-b-2 border-red-400' : 'text-slate-500 hover:text-white'}`}
                >
                    Live Studio {state.activeCallId && <span className="animate-pulse ml-1">●</span>}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative">
                
                {view === 'queue' && (
                    <div className="space-y-3">
                        {state.queue.filter(c => c.status !== 'ended' && c.status !== 'declined').map(call => (
                            <div key={call.id} className={`p-4 rounded-xl border transition-all ${call.status === 'live' ? 'bg-red-500/10 border-red-500/50' : 'bg-slate-800/60 border-white/10'}`}>
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-bold text-white text-sm">{call.callerName}</div>
                                    <div className="text-[10px] font-mono text-slate-500">{formatTime(call.createdAt)}</div>
                                </div>
                                <div className="text-xs text-slate-300 mb-3 line-clamp-2">{call.topic}</div>
                                
                                {call.aiSummary && (
                                    <div className="mb-3 p-2 bg-indigo-500/10 rounded border border-indigo-500/20 text-[10px] text-indigo-300">
                                        <span className="font-bold">AI SCREEN:</span> {call.aiSummary}
                                    </div>
                                )}

                                {call.status === 'live' ? (
                                    <button 
                                        onClick={() => endActiveCall(stopAudio)}
                                        className="w-full py-2 bg-red-500 text-white font-bold text-xs uppercase rounded shadow-lg hover:bg-red-600 transition-colors"
                                    >
                                        End Broadcast
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => acceptCall(call.id, startAudio)}
                                            disabled={!!state.activeCallId}
                                            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white font-bold text-xs uppercase rounded disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            Accept
                                        </button>
                                        <button 
                                            onClick={() => screenCall(call.id)}
                                            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs uppercase rounded"
                                        >
                                            Screen
                                        </button>
                                        <button 
                                            onClick={() => declineCall(call.id)}
                                            className="px-3 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold text-xs uppercase rounded"
                                        >
                                            X
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {state.queue.filter(c => c.status === 'queued').length === 0 && (
                            <div className="text-center py-10 text-slate-500 text-xs uppercase tracking-widest">
                                Queue Empty
                            </div>
                        )}
                    </div>
                )}

                {view === 'live' && (
                    <div className="h-full flex flex-col">
                         {!activeCall ? (
                             <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                                 <div className="w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center mb-4">
                                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                                     </svg>
                                 </div>
                                 <span className="text-xs uppercase tracking-widest">No Active Call</span>
                             </div>
                         ) : (
                             <>
                                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl mb-4 flex justify-between items-center shrink-0">
                                    <div>
                                        <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-0.5">ON AIR</div>
                                        <div className="text-sm font-bold text-white">{activeCall.callerName}</div>
                                    </div>
                                    <button 
                                        onClick={() => endActiveCall(stopAudio)}
                                        className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase rounded shadow-lg"
                                    >
                                        End Call
                                    </button>
                                </div>

                                {/* Live Transcript Stream */}
                                <div className="flex-1 overflow-y-auto bg-black/20 rounded-lg p-3 space-y-3 mb-4 custom-scrollbar">
                                    {liveTranscripts.map(t => (
                                        <div key={t.id} className="text-xs">
                                            <span className={`font-bold uppercase mr-2 ${t.role === 'user' ? 'text-cyan-400' : 'text-indigo-400'}`}>
                                                {t.role === 'user' ? 'Caller' : 'AI Host'}:
                                            </span>
                                            <span className="text-slate-300">{t.text}</span>
                                        </div>
                                    ))}
                                    <div className="text-[10px] text-slate-600 italic animate-pulse">Listening...</div>
                                </div>

                                {/* Action Deck */}
                                <div className="grid grid-cols-2 gap-2 shrink-0">
                                    <button 
                                        onClick={generateAnswerCard}
                                        className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase shadow-lg transition-all"
                                    >
                                        Gen Answer Card
                                    </button>
                                    <button className="p-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold uppercase transition-all">
                                        Flag for Follow-up
                                    </button>
                                </div>

                                {/* Generated Cards */}
                                {activeCall.answerCards && activeCall.answerCards.length > 0 && (
                                    <div className="mt-4 space-y-2">
                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Answer Cards</div>
                                        {activeCall.answerCards.map(card => (
                                            <div key={card.id} className="bg-slate-800 p-3 rounded-lg border border-white/10">
                                                <div className="text-xs font-bold text-indigo-300 mb-1">{card.title}</div>
                                                <div className="text-[10px] text-slate-400 line-clamp-2">{card.summary}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                             </>
                         )}
                    </div>
                )}
            </div>
        </div>
    );
};
