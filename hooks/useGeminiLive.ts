
import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, TranscriptionItem, VoiceState } from '../types';
import { pcmToGeminiBlob, base64ToFloat32, createAudioBuffer, PCM_SAMPLE_RATE } from '../utils/audioUtils';

// Gemini Model Configuration
const MODEL_NAME = 'gemini-2.5-flash-native-audio-preview-09-2025';
const OUTPUT_SAMPLE_RATE = 24000;
const API_KEY = process.env.API_KEY as string;

interface UseGeminiLiveProps {
  systemInstruction: string;
  voiceName: string;
}

export const useGeminiLive = ({ systemInstruction, voiceName }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.IDLE);
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
  const connectionStateRef = useRef<ConnectionState>(ConnectionState.DISCONNECTED);
  const connectAttemptRef = useRef<number>(0);
  
  // Playback state
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Mute Ref
  const isMicMutedRef = useRef(false);

  // Sync ref
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

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

  // Volume Analysis Loop
  const startVolumeAnalysis = useCallback(() => {
      const analyze = () => {
          let maxVol = 0;
          const data = new Uint8Array(32); 

          if (inputAnalyserRef.current) {
              inputAnalyserRef.current.getByteFrequencyData(data);
              let sum = 0;
              for(let i=0; i<data.length; i++) sum += data[i];
              maxVol = Math.max(maxVol, (sum / data.length) / 255);
          }

          if (outputAnalyserRef.current) {
              outputAnalyserRef.current.getByteFrequencyData(data);
              let sum = 0;
              for(let i=0; i<data.length; i++) sum += data[i];
              const outVol = (sum / data.length) / 255;
              maxVol = Math.max(maxVol, outVol);
          }

          setVolume(Math.min(1, maxVol * 1.5)); 
          volumeAnimationRef.current = requestAnimationFrame(analyze);
      };
      analyze();
  }, []);

  // Handle Interruptions (Barge-In)
  const handleInterruption = useCallback(() => {
      // console.log('--- INTERRUPTION DETECTED ---');
      setVoiceState(VoiceState.INTERRUPTED);
      
      // 1. Stop all currently playing sources instantly
      activeSourcesRef.current.forEach(source => { 
          try { source.stop(); } catch (e) {} 
      });
      activeSourcesRef.current.clear();
      
      // 2. Reset Audio Output Context Time Cursor
      if (outputContextRef.current) {
          nextStartTimeRef.current = outputContextRef.current.currentTime + 0.01;
      }

      // 3. Cancel scheduled values on gain node to stop ringing
      if (outputNodeRef.current && outputContextRef.current) {
          outputNodeRef.current.gain.cancelScheduledValues(outputContextRef.current.currentTime);
          outputNodeRef.current.gain.setValueAtTime(1, outputContextRef.current.currentTime);
      }

      // 4. Transition back to Listening shortly after
      setTimeout(() => {
          setVoiceState(VoiceState.LISTENING);
      }, 500);
  }, []);

  const cleanupAudioNodes = useCallback(() => {
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
      }
      if (processorRef.current) {
          processorRef.current.disconnect();
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
  }, []);

  const disconnect = useCallback(() => {
    connectAttemptRef.current += 1; // Invalidate any pending connection attempts
    cleanupAudioNodes();
    setVolume(0);

    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e){}
    });
    activeSourcesRef.current.clear();

    if (inputContextRef.current?.state !== 'closed') inputContextRef.current?.close();
    if (outputContextRef.current?.state !== 'closed') outputContextRef.current?.close();
    inputContextRef.current = null;
    outputContextRef.current = null;
    
    // Close the session if it exists
    if (activeSessionRef.current) {
        // try { activeSessionRef.current.close(); } catch(e) {} // Assuming close method exists if strictly needed, but SDK usually handles cleanup on disconnect or we just drop reference
        // Note: The GenAI SDK LiveSession doesn't explicitly expose a public close() method in all versions, 
        // but dropping the reference and stopping the stream is usually enough.
        activeSessionRef.current = null;
    }

    setConnectionState(ConnectionState.DISCONNECTED);
    setVoiceState(VoiceState.IDLE);
    setTranscripts(prev => [...prev, { id: Date.now().toString(), role: 'system', text: 'Session ended.', timestamp: new Date() }]);
  }, [cleanupAudioNodes]);

  const connect = useCallback(async () => {
    if (!API_KEY) {
        setError("API Key is missing. Check process.env.API_KEY");
        setConnectionState(ConnectionState.ERROR);
        return;
    }

    const currentAttemptId = connectAttemptRef.current + 1;
    connectAttemptRef.current = currentAttemptId;

    try {
      setConnectionState(ConnectionState.CONNECTING);
      setVoiceState(VoiceState.IDLE);
      setError(null);
      
      ensureAudioContexts();
      
      // Resume contexts if suspended (user interaction requirement)
      if (inputContextRef.current?.state === 'suspended') await inputContextRef.current.resume();
      if (outputContextRef.current?.state === 'suspended') await outputContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // If user cancelled or another connect happened, abort
      if (connectAttemptRef.current !== currentAttemptId) {
          stream.getTracks().forEach(t => t.stop());
          return;
      }

      streamRef.current = stream;
      setIsMicMuted(false);
      isMicMutedRef.current = false;

      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      // --- Setup Output Audio Chain (AI Voice) ---
      const outputCtx = outputContextRef.current!;
      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 64;
      outputAnalyser.smoothingTimeConstant = 0.5;
      outputAnalyserRef.current = outputAnalyser;
      outputNodeRef.current = outputCtx.createGain();
      outputNodeRef.current.connect(outputAnalyser);
      outputAnalyser.connect(outputCtx.destination);
      nextStartTimeRef.current = outputCtx.currentTime;

      // --- Setup Input Audio Chain (Mic) ---
      const inputCtx = inputContextRef.current!;
      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 64;
      inputAnalyser.smoothingTimeConstant = 0.5;
      inputAnalyserRef.current = inputAnalyser;
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      source.connect(inputAnalyser);
      inputAnalyser.connect(processor);
      processor.connect(inputCtx.destination);
      inputSourceRef.current = source;
      processorRef.current = processor;

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
        },
        callbacks: {
          onopen: () => {
            if (connectAttemptRef.current !== currentAttemptId) return;
            console.log('Gemini Live Connection Opened');
            setConnectionState(ConnectionState.CONNECTED);
            setVoiceState(VoiceState.LISTENING);
            
            setTranscripts(prev => [...prev, {
              id: Date.now().toString(),
              role: 'system',
              text: 'Connected to Nexus Voice.',
              timestamp: new Date()
            }]);

            // Audio Streaming
            processor.onaudioprocess = (e) => {
              if (isMicMutedRef.current) return;
              // Strict Guard: Only process if connected and this is the active attempt
              if (connectionStateRef.current !== ConnectionState.CONNECTED) return;
              if (connectAttemptRef.current !== currentAttemptId) return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = pcmToGeminiBlob(inputData, PCM_SAMPLE_RATE);
              
              sessionPromise.then(session => {
                // Double Check inside the microtask
                if (connectionStateRef.current !== ConnectionState.CONNECTED) return;
                
                // If we have a session ref, use it directly (faster), otherwise use the resolved one
                const currentSession = activeSessionRef.current || session;
                
                try {
                    currentSession.sendRealtimeInput({ media: pcmBlob });
                } catch(e) {
                    console.warn("Send failed", e);
                }
              }).catch(e => {
                  // Silently ignore interruptions in the promise chain
              });
            };
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (connectAttemptRef.current !== currentAttemptId) return;

            // State: User Turn Complete -> Thinking
            if (msg.serverContent?.turnComplete) {
                setVoiceState(VoiceState.THINKING);
            }

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
               // User is speaking
               if (voiceState !== VoiceState.INTERRUPTED && voiceState !== VoiceState.SPEAKING) {
                   setVoiceState(VoiceState.LISTENING); 
               }
               setTranscripts(prev => {
                   const last = prev[prev.length - 1];
                   if (last && last.role === 'user') {
                       return [...prev.slice(0, -1), { ...last, text: last.text + msg.serverContent!.inputTranscription!.text }];
                   }
                   return [...prev, { id: Date.now().toString(), role: 'user', text: msg.serverContent!.inputTranscription!.text, timestamp: new Date() }];
               });
            }

            // Interruptions
            if (msg.serverContent?.interrupted) {
              handleInterruption();
              return;
            }

            // Audio Output
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              if (voiceState !== VoiceState.INTERRUPTED) {
                  setVoiceState(VoiceState.SPEAKING);
              }

              if (!outputContextRef.current) return;
              const outputCtx = outputContextRef.current;
              const float32Data = base64ToFloat32(audioData);
              const audioBuffer = createAudioBuffer(outputCtx, float32Data, OUTPUT_SAMPLE_RATE);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current!);
              
              const now = outputCtx.currentTime;
              const startAt = Math.max(nextStartTimeRef.current, now + 0.02);
              source.start(startAt);
              nextStartTimeRef.current = startAt + audioBuffer.duration;
              
              activeSourcesRef.current.add(source);
              source.onended = () => {
                  activeSourcesRef.current.delete(source);
                  if (activeSourcesRef.current.size === 0) {
                      setTimeout(() => {
                          if (activeSourcesRef.current.size === 0) {
                              setVoiceState(VoiceState.LISTENING);
                          }
                      }, 200); 
                  }
              };
            }
          },
          onclose: () => {
            console.log('Connection closed');
            if (connectAttemptRef.current === currentAttemptId) {
                setConnectionState(ConnectionState.DISCONNECTED);
                setVoiceState(VoiceState.IDLE);
                activeSessionRef.current = null;
            }
          },
          onerror: (err) => {
            console.error('Connection error:', err);
            if (connectAttemptRef.current === currentAttemptId) {
                setError(err instanceof Error ? err.message : "Connection failed");
                setConnectionState(ConnectionState.ERROR);
                setVoiceState(VoiceState.IDLE);
                activeSessionRef.current = null;
                cleanupAudioNodes();
            }
          }
        }
      });
      
      // Resolve session for later use
      sessionPromise.then(sess => {
          if (connectAttemptRef.current === currentAttemptId) {
              activeSessionRef.current = sess;
          }
      }).catch(err => {
          console.error("Session connection failed:", err);
          if (connectAttemptRef.current === currentAttemptId) {
              setError(err.message || "Network Error");
              setConnectionState(ConnectionState.ERROR);
              setVoiceState(VoiceState.IDLE);
              cleanupAudioNodes();
          }
      });

    } catch (err) {
      console.error(err);
      if (connectAttemptRef.current === currentAttemptId) {
          setError(err instanceof Error ? err.message : "Failed to connect");
          setConnectionState(ConnectionState.ERROR);
          cleanupAudioNodes();
      }
    }
  }, [ensureAudioContexts, startVolumeAnalysis, handleInterruption, systemInstruction, voiceName, cleanupAudioNodes]);

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
        audioTracks.forEach(track => { track.enabled = shouldEnable; });
        setIsMicMuted(!shouldEnable);
        isMicMutedRef.current = !shouldEnable;
      }
    }
  }, []);

  return {
    connectionState,
    voiceState,
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
