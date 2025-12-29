import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, TranscriptionItem } from '../types';
import { pcmToGeminiBlob, base64ToFloat32, createAudioBuffer, PCM_SAMPLE_RATE } from '../utils/audioUtils';

// Gemini Model Configuration
const MODEL_NAME = 'gemini-2.0-flash-exp';
const OUTPUT_SAMPLE_RATE = 24000;
const API_KEY = process.env.API_KEY as string;

interface UseGeminiLiveProps {
  systemInstruction: string;
  voiceName: string;
}

export const useGeminiLive = ({ systemInstruction, voiceName }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptionItem[]>([]);
  const [volume, setVolume] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Audio Nodes
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // Analysers for Visualization
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const volumeAnimationRef = useRef<number | null>(null);

  // Session Ref
  const activeSessionRef = useRef<any>(null);
  
  // Playback state
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Mute Ref (to avoid closure staleness in audio loop)
  const isMicMutedRef = useRef(false);

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

  // Volume Analysis Loop (Combines Input & Output)
  const startVolumeAnalysis = useCallback(() => {
      const analyze = () => {
          let maxVol = 0;
          const data = new Uint8Array(32); // Small FFT size for performance

          // Check Input (User)
          if (inputAnalyserRef.current) {
              inputAnalyserRef.current.getByteFrequencyData(data);
              let sum = 0;
              for(let i=0; i<data.length; i++) sum += data[i];
              const avg = sum / data.length;
              maxVol = Math.max(maxVol, avg / 255);
          }

          // Check Output (AI)
          if (outputAnalyserRef.current) {
              outputAnalyserRef.current.getByteFrequencyData(data);
              let sum = 0;
              for(let i=0; i<data.length; i++) sum += data[i];
              const avg = sum / data.length;
              maxVol = Math.max(maxVol, avg / 255);
          }

          // Apply some gain/sensitivity and set state
          setVolume(Math.min(1, maxVol * 1.5)); 

          volumeAnimationRef.current = requestAnimationFrame(analyze);
      };
      analyze();
  }, []);

  const connect = useCallback(async () => {
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);
      
      ensureAudioContexts();
      
      if (inputContextRef.current?.state === 'suspended') await inputContextRef.current.resume();
      if (outputContextRef.current?.state === 'suspended') await outputContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Reset mute state
      setIsMicMuted(false);
      isMicMutedRef.current = false;

      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      // --- Setup Output Audio Chain (AI Voice) ---
      const outputCtx = outputContextRef.current!;
      
      // Create Analyser for Output
      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 64;
      outputAnalyser.smoothingTimeConstant = 0.5;
      outputAnalyserRef.current = outputAnalyser;

      // Create Gain Node (Master Output)
      outputNodeRef.current = outputCtx.createGain();
      
      // Connect: OutputGain -> Analyser -> Destination
      outputNodeRef.current.connect(outputAnalyser);
      outputAnalyser.connect(outputCtx.destination);
      
      nextStartTimeRef.current = outputCtx.currentTime;


      // --- Setup Input Audio Chain (Mic) ---
      const inputCtx = inputContextRef.current!;
      
      // Create Analyser for Input
      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 64;
      inputAnalyser.smoothingTimeConstant = 0.5;
      inputAnalyserRef.current = inputAnalyser;

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      // Connect: Mic -> Analyser -> Processor -> Destination
      source.connect(inputAnalyser);
      inputAnalyser.connect(processor);
      processor.connect(inputCtx.destination);
      
      inputSourceRef.current = source;
      processorRef.current = processor;

      // Start Volume Loop
      startVolumeAnalysis();

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
          },
          systemInstruction: systemInstruction,
          // inputAudioTranscription: {}, 
          // outputAudioTranscription: {}, 
          // tools: [{ googleSearch: {} }],
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Connection Opened');
            setConnectionState(ConnectionState.CONNECTED);
            setTranscripts(prev => [...prev, {
              id: Date.now().toString(),
              role: 'system',
              text: 'Connected to Nexus Voice.',
              timestamp: new Date()
            }]);

            // Audio Streaming
            processor.onaudioprocess = (e) => {
              // Critical: Do not send data if muted
              if (isMicMutedRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = pcmToGeminiBlob(inputData, PCM_SAMPLE_RATE);
              sessionPromise.then(session => {
                activeSessionRef.current = session;
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Transcriptions
            if (msg.serverContent?.outputTranscription?.text) {
               setTranscripts(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                    return [...prev.slice(0, -1), { ...last, text: last.text + msg.serverContent!.outputTranscription!.text }];
                }
                return [...prev, { id: Date.now().toString(), role: 'assistant', text: msg.serverContent!.outputTranscription!.text, timestamp: new Date() }];
               });
            }
            if (msg.serverContent?.inputTranscription?.text) {
               setTranscripts(prev => {
                   const last = prev[prev.length - 1];
                   if (last && last.role === 'user') {
                       return [...prev.slice(0, -1), { ...last, text: last.text + msg.serverContent!.inputTranscription!.text }];
                   }
                   return [...prev, { id: Date.now().toString(), role: 'user', text: msg.serverContent!.inputTranscription!.text, timestamp: new Date() }];
               });
            }

            // Interruptions (Barge-in)
            if (msg.serverContent?.interrupted) {
              console.log('Interrupted');
              
              // 1. Stop all currently playing sources instantly
              activeSourcesRef.current.forEach(source => { 
                  try { source.stop(); } catch (e) {} 
              });
              activeSourcesRef.current.clear();
              
              // 2. Reset Audio Output Context Time Cursor
              // This ensures we don't schedule the next chunk way in the future if we just cancelled a long response
              if (outputContextRef.current) {
                  // Add a tiny buffer to avoid overlap artifacts
                  nextStartTimeRef.current = outputContextRef.current.currentTime + 0.01;
              }

              // 3. Cancel scheduled values on gain node to stop ringing
              if (outputNodeRef.current && outputContextRef.current) {
                  outputNodeRef.current.gain.cancelScheduledValues(outputContextRef.current.currentTime);
                  outputNodeRef.current.gain.setValueAtTime(1, outputContextRef.current.currentTime);
              }
              return;
            }

            // Audio Output
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              if (!outputContextRef.current) return;
              const outputCtx = outputContextRef.current;
              const float32Data = base64ToFloat32(audioData);
              const audioBuffer = createAudioBuffer(outputCtx, float32Data, OUTPUT_SAMPLE_RATE);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current!);
              
              const now = outputCtx.currentTime;
              const startAt = Math.max(nextStartTimeRef.current, now + 0.02); // Lower buffer for lower latency
              source.start(startAt);
              nextStartTimeRef.current = startAt + audioBuffer.duration;
              
              activeSourcesRef.current.add(source);
              source.onended = () => activeSourcesRef.current.delete(source);
            }
          },
          onclose: () => {
            console.log('Connection closed');
            setConnectionState(ConnectionState.DISCONNECTED);
            activeSessionRef.current = null;
          },
          onerror: (err) => {
            console.error('Connection error:', err);
            setError(err instanceof Error ? err.message : "Connection failed");
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
  }, [ensureAudioContexts, startVolumeAnalysis, systemInstruction, voiceName]);

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
    if (inputAnalyserRef.current) {
        inputAnalyserRef.current.disconnect();
        inputAnalyserRef.current = null;
    }
    if (outputAnalyserRef.current) {
        outputAnalyserRef.current.disconnect();
        outputAnalyserRef.current = null;
    }
    
    if (volumeAnimationRef.current) {
        cancelAnimationFrame(volumeAnimationRef.current);
        volumeAnimationRef.current = null;
    }
    setVolume(0);

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
    setTranscripts(prev => [...prev, { id: Date.now().toString(), role: 'system', text: 'Session ended.', timestamp: new Date() }]);
  }, []);
  
  const sendVideoFrame = useCallback((base64Data: string) => {
    if (connectionState === ConnectionState.CONNECTED && activeSessionRef.current) {
      try {
        activeSessionRef.current.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64Data } });
      } catch (e) {
          console.error("Error sending video frame:", e);
      }
    }
  }, [connectionState]);

  const toggleMic = useCallback(() => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const shouldEnable = !audioTracks[0].enabled;
        audioTracks.forEach(track => {
            track.enabled = shouldEnable;
        });
        
        // Update both state and ref
        const newMutedState = !shouldEnable;
        setIsMicMuted(newMutedState);
        isMicMutedRef.current = newMutedState;
      }
    }
  }, []);

  return {
    connectionState,
    error,
    transcripts,
    volume,
    connect,
    disconnect,
    sendVideoFrame,
    isMicMuted,
    toggleMic
  };
};