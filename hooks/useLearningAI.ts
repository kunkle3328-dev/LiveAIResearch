
import { useState, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { LearningSource, PodcastScriptLine } from '../types';
import { mergeBase64PCM } from '../utils/audioUtils';

const MODEL_TEXT = 'gemini-3-pro-preview'; 
const MODEL_AUDIO = 'gemini-2.5-flash-preview-tts';
const MODEL_IMAGE = 'gemini-2.5-flash-image';

export const useLearningAI = () => {
  const [generatingCount, setGeneratingCount] = useState(0);
  const isGenerating = generatingCount > 0;

  const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

  const cleanJson = (text: string) => {
    if (!text) return '';
    const markdownMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) return markdownMatch[1].trim();
    
    const firstOpen = text.indexOf('{');
    const lastClose = text.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose !== -1) return text.substring(firstOpen, lastClose + 1);
    
    return text.trim();
  };

  const generatePodcastScript = useCallback(async (
    topic: string,
    style: string,
    sources: LearningSource[]
  ): Promise<{ title: string; script: PodcastScriptLine[] } | null> => {
    setGeneratingCount(c => c + 1);
    try {
      const ai = getClient();
      const sourceContext = sources.map(s => `SOURCE (${s.title}): ${s.content.substring(0, 25000)}...`).join('\n\n');
      
      const prompt = `
        You are an expert educational podcast producer.
        TOPIC: ${topic}
        STYLE: ${style}
        
        SOURCES:
        ${sourceContext}
        
        Task: Create a deep-dive podcast script between "Host" (Energetic) and "Expert" (Calm).
        
        LENGTH REQUIREMENTS:
        - The episode MUST be substantial (approx 5-15 minutes spoken).
        - Aim for 800 to 2000 words total.
        - Create 40-60 exchanges.
        
        STRUCTURE:
        1. Hook: Grab attention immediately.
        2. Deep Dive: Explore the "Why" and "How", not just the "What".
        3. Examples: Use specific details from the sources.
        4. Key Takeaways: Summarize actionable points.
        
        OUTPUT FORMAT:
        Return ONLY valid JSON.
        {
          "title": "Episode Title",
          "script": [
            { "speaker": "Host", "text": "..." },
            { "speaker": "Expert", "text": "..." }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 2048 },
        }
      });

      const rawText = response.text;
      if (!rawText) return null;

      const cleaned = cleanJson(rawText);
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        console.error("JSON Parse Error", e);
        return null;
      }

      if (parsed.podcast) parsed = parsed.podcast;

      if (!parsed || !parsed.script || !Array.isArray(parsed.script)) {
        return null;
      }

      return parsed;
    } catch (e) {
      console.error("Script Gen Error:", e);
      return null;
    } finally {
      setGeneratingCount(c => Math.max(0, c - 1));
    }
  }, []);

  // Updated Audio Synthesis with Concurrency Control
  const synthesizePodcastAudio = useCallback(async (
    script: PodcastScriptLine[],
    onProgress?: (percentage: number) => void
  ): Promise<string | null> => {
    setGeneratingCount(c => c + 1);
    try {
      if (!script || !script.length) throw new Error("Empty script");

      const ai = getClient();
      const CHUNK_SIZE = 3; 
      const chunks: PodcastScriptLine[][] = [];
      for (let i = 0; i < script.length; i += CHUNK_SIZE) {
        chunks.push(script.slice(i, i + CHUNK_SIZE));
      }

      const results: string[] = new Array(chunks.length).fill('');
      let completed = 0;
      
      // Concurrency limit
      const MAX_CONCURRENT = 3;
      
      const processChunk = async (chunkIndex: number) => {
          const chunk = chunks[chunkIndex];
          const conversationText = chunk.map(line => `${line.speaker}: ${line.text}`).join('\n');
          const prompt = `TTS the following conversation:\n\n${conversationText}`;

          let retries = 0;
          while (retries < 3) {
              try {
                  const response = await ai.models.generateContent({
                      model: MODEL_AUDIO,
                      contents: [{ parts: [{ text: prompt }] }],
                      config: {
                          responseModalities: [Modality.AUDIO],
                          speechConfig: {
                              multiSpeakerVoiceConfig: {
                                  speakerVoiceConfigs: [
                                      { speaker: 'Host', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } } },
                                      { speaker: 'Expert', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } }
                                  ]
                              }
                          }
                      }
                  });
                  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                  if (audioData) {
                      results[chunkIndex] = audioData;
                      return;
                  }
                  throw new Error("No audio data");
              } catch (e) {
                  console.warn(`Chunk ${chunkIndex} fail (try ${retries+1})`, e);
                  retries++;
                  await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
              }
          }
          console.error(`Chunk ${chunkIndex} failed permanently.`);
          // We intentionally leave it empty or insert a silent placeholder if desired, 
          // but for now we skip to avoid breaking the whole merge.
      };

      // Simple concurrency queue
      const queue = chunks.map((_, i) => i);
      const workers = Array(Math.min(MAX_CONCURRENT, chunks.length)).fill(null).map(async () => {
          while (queue.length > 0) {
              const idx = queue.shift();
              if (idx !== undefined) {
                  await processChunk(idx);
                  completed++;
                  if (onProgress) onProgress(Math.round((completed / chunks.length) * 100));
              }
          }
      });

      await Promise.all(workers);

      // Filter out empty results if any failed
      const validAudioParts = results.filter(r => !!r);
      if (validAudioParts.length === 0) return null;

      return mergeBase64PCM(validAudioParts);

    } catch (e) {
      console.error("Audio Gen Error:", e);
      return null;
    } finally {
      setGeneratingCount(c => Math.max(0, c - 1));
    }
  }, []);

  const generateCoverImage = useCallback(async (topic: string, style: string): Promise<string | null> => {
    setGeneratingCount(c => c + 1);
    try {
      const ai = getClient();
      const prompt = `Abstract, cinematic 3D render for a podcast cover about "${topic}". 
      Style: ${style}, Futuristic, Enterprise Tech, Dark Mode, Neon accents. 
      High contrast, 8k resolution, minimalist but detailed. Center composition.`;

      const response = await ai.models.generateContent({
        model: MODEL_IMAGE,
        contents: { parts: [{ text: prompt }] }
      });

      let imageBase64 = null;
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts) {
             if (part.inlineData && part.inlineData.mimeType.startsWith('image')) {
                 imageBase64 = part.inlineData.data;
                 break;
             }
        }
        if (imageBase64) break;
      }
      return imageBase64;
    } catch (e) {
      console.error("Image Gen Error:", e);
      return null;
    } finally {
      setGeneratingCount(c => Math.max(0, c - 1));
    }
  }, []);

  const chatWithSources = useCallback(async (
    question: string,
    sources: LearningSource[],
    history: { role: 'user' | 'model', text: string }[]
  ): Promise<string | null> => {
     const ai = getClient();
     const context = sources.map(s => {
         let content = s.content;
         if (!content && s.url) {
             content = `[URL Reference: ${s.url}]`; 
         }
         return `SOURCE: ${s.title}\nCONTENT: ${content.substring(0, 20000)}...`;
     }).join('\n\n');

     const prompt = `You are a helpful AI Tutor. Your goal is to answer the user's question comprehensively.
     
     INSTRUCTIONS:
     1. FIRST, check the provided SOURCES below.
     2. IF the answer is found in the sources, cite them and answer.
     3. IF the answer is NOT in the sources, OR if the sources are just URL references/empty, you MUST use the googleSearch tool to find the answer.
     
     SOURCES:
     ${context}
     
     Question: ${question}`;

     const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }] 
        }
     });
     return response.text || '';
  }, []);

  return {
    isGenerating,
    generatePodcastScript,
    synthesizePodcastAudio,
    generateCoverImage,
    chatWithSources
  };
};
