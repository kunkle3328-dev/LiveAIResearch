
import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { CallRequest, CallStatus, TranscriptionItem, AnswerCard } from '../types';
import { AudioSessionManager } from '../services/AudioSessionManager';

// Mock Data for Demo
const MOCK_CALLS: CallRequest[] = [
    { id: 'c1', callerName: 'Sarah Jenkins', topic: 'Clarification on Module 3 Safety', rawPromptOrText: '', status: 'queued', createdAt: new Date() },
    { id: 'c2', callerName: 'Unknown Caller', topic: 'Question about API limits', rawPromptOrText: '', status: 'queued', createdAt: new Date(Date.now() - 60000) },
];

interface ProducerState {
    queue: CallRequest[];
    activeCallId: string | null;
    isScreening: boolean;
}

type Action = 
    | { type: 'ADD_CALL'; payload: CallRequest }
    | { type: 'SET_STATUS'; payload: { id: string; status: CallStatus } }
    | { type: 'SET_SCREENING'; payload: boolean }
    | { type: 'UPDATE_CALL_DATA'; payload: { id: string; data: Partial<CallRequest> } };

const ProducerContext = createContext<{
    state: ProducerState;
    acceptCall: (id: string, startAudio: () => Promise<void>) => Promise<void>;
    declineCall: (id: string) => void;
    endActiveCall: (stopAudio: () => void) => void;
    screenCall: (id: string) => Promise<void>;
    addTranscript: (text: string, role: 'user'|'assistant') => void;
    addAnswerCard: (card: AnswerCard) => void;
    generateAnswerCard: () => Promise<void>; // Trigger AI generation
} | null>(null);

const reducer = (state: ProducerState, action: Action): ProducerState => {
    switch (action.type) {
        case 'ADD_CALL':
            return { ...state, queue: [...state.queue, action.payload] };
        case 'SET_STATUS':
            const newQueue = state.queue.map(c => 
                c.id === action.payload.id ? { ...c, status: action.payload.status } : c
            );
            // If setting to live, update active ID
            const activeId = action.payload.status === 'live' ? action.payload.id : 
                             (action.payload.status === 'ended' && state.activeCallId === action.payload.id) ? null : state.activeCallId;
            return { ...state, queue: newQueue, activeCallId: activeId };
        case 'SET_SCREENING':
            return { ...state, isScreening: action.payload };
        case 'UPDATE_CALL_DATA':
            return {
                ...state,
                queue: state.queue.map(c => c.id === action.payload.id ? { ...c, ...action.payload.data } : c)
            };
        default:
            return state;
    }
};

export const ProducerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, {
        queue: MOCK_CALLS,
        activeCallId: null,
        isScreening: false
    });

    const sessionManager = AudioSessionManager.getInstance();

    const acceptCall = useCallback(async (id: string, startAudio: () => Promise<void>) => {
        if (state.activeCallId) {
            sessionManager.log('warn', 'producer', 'Cannot accept call: Another call is live');
            return;
        }
        
        await sessionManager.startCallSession(async () => {
            dispatch({ type: 'SET_STATUS', payload: { id, status: 'live' } });
            await startAudio();
        });
    }, [state.activeCallId]);

    const declineCall = useCallback((id: string) => {
        dispatch({ type: 'SET_STATUS', payload: { id, status: 'declined' } });
        sessionManager.log('info', 'producer', `Call ${id} declined`);
    }, []);

    const endActiveCall = useCallback((stopAudio: () => void) => {
        if (!state.activeCallId) return;
        const id = state.activeCallId;
        
        sessionManager.endCallSession(() => {
            stopAudio();
            dispatch({ type: 'SET_STATUS', payload: { id, status: 'ended' } });
        });
    }, [state.activeCallId]);

    const screenCall = useCallback(async (id: string) => {
        // Mock screening AI delay
        dispatch({ type: 'SET_SCREENING', payload: true });
        dispatch({ type: 'SET_STATUS', payload: { id, status: 'screening' } });
        
        setTimeout(() => {
            dispatch({ type: 'UPDATE_CALL_DATA', payload: { id, data: {
                aiSummary: "User is asking about compliance limits regarding API throttling in the new release.",
                suggestedResponses: ["Explain rate limits (100/min)", "Offer enterprise upgrade path", "Direct to docs page 4"]
            }}});
            dispatch({ type: 'SET_SCREENING', payload: false });
        }, 1500);
    }, []);

    const addTranscript = useCallback((text: string, role: 'user'|'assistant') => {
        if (!state.activeCallId) return;
        // In a real app, we'd append to the specific call's transcript array
        // For this demo, we assume the UI reads from the hook directly, 
        // OR we update the call object here. Let's update the call object for persistence.
        const call = state.queue.find(c => c.id === state.activeCallId);
        if (call) {
             const newItem: TranscriptionItem = {
                 id: Date.now().toString(),
                 role,
                 text,
                 timestamp: new Date()
             };
             const currentTranscript = call.transcript || [];
             dispatch({ type: 'UPDATE_CALL_DATA', payload: { id: state.activeCallId, data: { transcript: [...currentTranscript, newItem] } } });
        }
    }, [state.activeCallId, state.queue]);

    const addAnswerCard = useCallback((card: AnswerCard) => {
        if (!state.activeCallId) return;
        const call = state.queue.find(c => c.id === state.activeCallId);
        if (call) {
             const cards = call.answerCards || [];
             dispatch({ type: 'UPDATE_CALL_DATA', payload: { id: state.activeCallId, data: { answerCards: [...cards, card] } } });
             sessionManager.log('info', 'producer', 'Answer card generated', { cardId: card.id });
        }
    }, [state.activeCallId, state.queue]);

    // Mock Generation
    const generateAnswerCard = useCallback(async () => {
         // In reality, call LLM with transcript
         const newCard: AnswerCard = {
             id: Date.now().toString(),
             title: "API Rate Limits",
             summary: "The user is hitting the default 100 req/min limit.",
             steps: ["Check current usage in dashboard", "Request quota increase form", "Implement exponential backoff"],
             pitfalls: ["Don't disable retries", "Don't share API keys"],
             nextActions: ["Send documentation link"],
             createdAt: new Date()
         };
         addAnswerCard(newCard);
    }, [addAnswerCard]);

    return (
        <ProducerContext.Provider value={{ 
            state, acceptCall, declineCall, endActiveCall, screenCall, addTranscript, addAnswerCard, generateAnswerCard 
        }}>
            {children}
        </ProducerContext.Provider>
    );
};

export const useProducer = () => {
    const ctx = useContext(ProducerContext);
    if (!ctx) throw new Error("useProducer must be used within ProducerProvider");
    return ctx;
};
