
import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, TranscriptionItem } from '../types';
import { pcmToGeminiBlob, base64ToFloat32, createAudioBuffer, PCM_SAMPLE_RATE, calculateVolume } from '../utils/audioUtils';

// Gemini Model Configuration - Updated to correct stable preview version
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const OUTPUT_SAMPLE_RATE = 24000; // Gemini default output

interface UseGeminiLiveProps {
  systemInstruction: string;
  voiceName: string;
}

export const useGeminiLive = ({ systemInstruction, voiceName }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptionItem[]>([]);
  
  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Audio Nodes
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // Session Ref for sending data outside the audio loop
  const activeSessionRef = useRef<any>(null);
  
  // Playback state
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Visualizer State
  const [volume, setVolume] = useState(0);

  // Initialize Audio Contexts
  const ensureAudioContexts = useCallback(() => {
    if (!inputContextRef.current) {
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: PCM_SAMPLE_RATE,
      });
    }
    if (!outputContextRef.current) {
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
    }
  }, []);

  const connect = useCallback(async () => {
    if (!process.env.API_KEY) {
      setError("API Key not found in environment variables.");
      return;
    }

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);
      
      ensureAudioContexts();
      
      // Resume contexts if suspended (browser autoplay policy)
      if (inputContextRef.current?.state === 'suspended') await inputContextRef.current.resume();
      if (outputContextRef.current?.state === 'suspended') await outputContextRef.current.resume();

      // Get Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Setup Output Node (Speaker)
      const outputCtx = outputContextRef.current!;
      outputNodeRef.current = outputCtx.createGain();
      outputNodeRef.current.connect(outputCtx.destination);
      nextStartTimeRef.current = outputCtx.currentTime;

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
          },
          systemInstruction: systemInstruction,
          inputAudioTranscription: {}, // Request transcription for user
          outputAudioTranscription: {}, // Request transcription for model
          tools: [{ googleSearch: {} }],
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Connection Opened');
            setConnectionState(ConnectionState.CONNECTED);
            setTranscripts(prev => [...prev, {
              id: Date.now().toString(),
              role: 'system',
              text: 'Connected to Gemini Live Enterprise Assistant.',
              timestamp: new Date()
            }]);

            // Start Audio Streaming Pipeline
            if (!inputContextRef.current) return;
            const inputCtx = inputContextRef.current;
            const source = inputCtx.createMediaStreamSource(stream);
            // ScriptProcessor is deprecated but reliable for getting raw PCM data across browsers for this purpose
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate volume for visualizer
              const vol = calculateVolume(inputData);
              setVolume(vol);

              const pcmBlob = pcmToGeminiBlob(inputData, PCM_SAMPLE_RATE);
              
              // Send to Gemini
              sessionPromise.then(session => {
                activeSessionRef.current = session;
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
            
            inputSourceRef.current = source;
            processorRef.current = processor;
          },
          onmessage: async (msg: LiveServerMessage) => {
            // 1. Handle Transcriptions
            if (msg.serverContent?.outputTranscription?.text) {
               setTranscripts(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                    return [
                        ...prev.slice(0, -1),
                        { ...last, text: last.text + msg.serverContent!.outputTranscription!.text }
                    ];
                }
                return [...prev, {
                    id: Date.now().toString(),
                    role: 'assistant',
                    text: msg.serverContent!.outputTranscription!.text,
                    timestamp: new Date()
                }];
               });
            }
            if (msg.serverContent?.inputTranscription?.text) {
               setTranscripts(prev => {
                   const last = prev[prev.length - 1];
                   if (last && last.role === 'user') {
                       return [
                           ...prev.slice(0, -1),
                           { ...last, text: last.text + msg.serverContent!.inputTranscription!.text }
                       ];
                   }
                   return [...prev, {
                       id: Date.now().toString(),
                       role: 'user',
                       text: msg.serverContent!.inputTranscription!.text,
                       timestamp: new Date()
                   }];
               });
            }

            // 2. Handle Interruption (Barge-in)
            const interrupted = msg.serverContent?.interrupted;
            if (interrupted) {
              console.log('Interruption signal received');
              // Stop all currently playing audio
              activeSourcesRef.current.forEach(source => {
                try { source.stop(); } catch (e) {}
              });
              activeSourcesRef.current.clear();
              
              if (outputContextRef.current) {
                nextStartTimeRef.current = outputContextRef.current.currentTime;
              }
              return;
            }

            // 3. Handle Audio Output
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              if (!outputContextRef.current) return;
              const outputCtx = outputContextRef.current;
              
              const float32Data = base64ToFloat32(audioData);
              const audioBuffer = createAudioBuffer(outputCtx, float32Data, OUTPUT_SAMPLE_RATE);
              
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current!);
              
              // Schedule playback
              // Ensure we don't schedule in the past
              const now = outputCtx.currentTime;
              const startAt = Math.max(nextStartTimeRef.current, now + 0.05);
              
              source.start(startAt);
              
              // Update queue cursor
              nextStartTimeRef.current = startAt + audioBuffer.duration;
              
              // Track active source for cancellation
              activeSourcesRef.current.add(source);
              source.onended = () => {
                activeSourcesRef.current.delete(source);
              };
            }
          },
          onclose: () => {
            console.log('Connection closed');
            setConnectionState(ConnectionState.DISCONNECTED);
            activeSessionRef.current = null;
          },
          onerror: (err) => {
            console.error('Connection error:', err);
            // Handle Network Errors specifically
            const errorMsg = err instanceof Error ? err.message : 'Unknown connection error';
            if (errorMsg.includes('Network error') || errorMsg.includes('WebSocket')) {
                 setError('Connection failed. Please check your firewall or API key.');
            } else {
                 setError(errorMsg);
            }
            setConnectionState(ConnectionState.ERROR);
            activeSessionRef.current = null;
          }
        }
      });

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to connect");
      setConnectionState(ConnectionState.ERROR);
    }
  }, [ensureAudioContexts, systemInstruction, voiceName]);

  const disconnect = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }
    
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e){}
    });
    activeSourcesRef.current.clear();

    if (inputContextRef.current?.state !== 'closed') inputContextRef.current?.close();
    if (outputContextRef.current?.state !== 'closed') outputContextRef.current?.close();
    inputContextRef.current = null;
    outputContextRef.current = null;
    
    activeSessionRef.current = null;

    setConnectionState(ConnectionState.DISCONNECTED);
    setTranscripts(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        text: 'Session ended.',
        timestamp: new Date()
    }]);
    
  }, []);
  
  const sendVideoFrame = useCallback((base64Data: string) => {
    if (connectionState === ConnectionState.CONNECTED && activeSessionRef.current) {
      try {
        activeSessionRef.current.sendRealtimeInput({
            media: {
                mimeType: 'image/jpeg',
                data: base64Data
            }
        });
      } catch (e) {
          console.error("Error sending video frame:", e);
      }
    }
  }, [connectionState]);

  return {
    connectionState,
    error,
    transcripts,
    volume,
    connect,
    disconnect,
    sendVideoFrame
  };
};
