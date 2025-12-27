
import { useState, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { LearningSource, PodcastScriptLine, PodcastBlueprint, PodcastType } from '../types';
import { mergeBase64PCM } from '../utils/audioUtils';

const MODEL_TEXT = 'gemini-2.0-flash-exp'; 
const MODEL_AUDIO = 'gemini-2.5-flash-preview-tts'; // TTS is specific, keep if working, otherwise 2.0-flash-exp
const MODEL_IMAGE = 'gemini-2.0-flash-exp'; // Use multimodal capability for image

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

  // 1. Generate Blueprint (Teaching Mode)
  const generateBlueprint = useCallback(async (
    topic: string,
    audience: string,
    sources: LearningSource[]
  ): Promise<PodcastBlueprint | null> => {
    setGeneratingCount(c => c + 1);
    try {
      const ai = getClient();
      const sourceContext = sources.map(s => `SOURCE (${s.title}): ${s.content.substring(0, 15000)}...`).join('\n\n');
      
      const prompt = `
        You are an expert instructional designer creating a "Teaching Podcast" blueprint.
        TOPIC: ${topic}
        TARGET AUDIENCE: ${audience}
        
        SOURCES:
        ${sourceContext}
        
        TASK:
        Create a structured learning plan.
        1. Define 3-5 clear Learning Objectives.
        2. Outline 4-6 Chapters that logically progress from basics to advanced.
        3. Extract 3-5 key glossary terms from the sources.
        
        OUTPUT JSON:
        {
          "learningObjectives": ["string"],
          "targetAudience": "${audience}",
          "teachingStyle": "Socratic",
          "chapters": [
            {
              "title": "string",
              "objective": "string",
              "keyPoints": ["string"]
            }
          ],
          "glossary": [
            { "term": "string", "definition": "string" }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const parsed = JSON.parse(cleanJson(response.text || '{}'));
      return parsed.chapters ? parsed : null;
    } catch (e) {
      console.error("Blueprint Gen Error:", e);
      return null;
    } finally {
      setGeneratingCount(c => Math.max(0, c - 1));
    }
  }, []);

  // 2. Generate Script (Standard or Teaching)
  const generatePodcastScript = useCallback(async (
    topic: string,
    style: string,
    type: PodcastType,
    sources: LearningSource[],
    blueprint?: PodcastBlueprint
  ): Promise<{ title: string; script: PodcastScriptLine[] } | null> => {
    setGeneratingCount(c => c + 1);
    try {
      const ai = getClient();
      const sourceContext = sources.map(s => `SOURCE (${s.title}): ${s.content.substring(0, 25000)}...`).join('\n\n');
      
      let prompt = '';

      if (type === 'Teaching' && blueprint) {
         prompt = `
            You are a "Teaching Podcast" host pair: Host (Energetic) and Expert (Calm).
            
            BLUEPRINT:
            ${JSON.stringify(blueprint)}
            
            SOURCES:
            ${sourceContext}
            
            TASK:
            Write a COMPREHENSIVE, WORD-FOR-WORD script.
            The script MUST be sufficiently long (aim for 2500 words or ~40-50 dialogue turns).
            
            STRUCTURE:
            - Iterate through EVERY chapter in the blueprint.
            - For EACH chapter:
              1. Host introduces the concept clearly.
              2. Expert explains it in deep detail using the sources.
              3. Provide multiple specific examples from the text.
              4. Have a back-and-forth discussion.
              5. Host asks a "Checkpoint" question to the listener.
            
            IMPORTANT:
            - Do not summarize quickly.
            - Do not skip chapters.
            - This is a full lesson.
            
            OUTPUT JSON:
            {
              "title": "Episode Title",
              "script": [
                { "speaker": "Host", "text": "..." },
                { "speaker": "Expert", "text": "..." }
              ]
            }
         `;
      } else {
         // Standard Podcast Prompt
         prompt = `
            You are an expert educational podcast producer.
            TOPIC: ${topic}
            STYLE: ${style}
            
            SOURCES:
            ${sourceContext}
            
            Task: Create a deep-dive podcast script between "Host" (Energetic) and "Expert" (Calm).
            Aim for 2000+ words to create a substantial episode (10+ minutes).
            Cover the topic exhaustively.
            
            OUTPUT JSON:
            {
              "title": "Episode Title",
              "script": [
                { "speaker": "Host", "text": "..." },
                { "speaker": "Expert", "text": "..." }
              ]
            }
         `;
      }

      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          // Removed thinkingConfig as it might not be supported on 2.0-flash-exp yet in all regions
        }
      });

      const parsed = JSON.parse(cleanJson(response.text || '{}'));
      const data = parsed.podcast || parsed;
      
      if (!data.script || !Array.isArray(data.script)) return null;
      return data;
    } catch (e) {
      console.error("Script Gen Error:", e);
      return null;
    } finally {
      setGeneratingCount(c => Math.max(0, c - 1));
    }
  }, []);

  const synthesizePodcastAudio = useCallback(async (
    script: PodcastScriptLine[],
    onProgress?: (percentage: number) => void
  ): Promise<string | null> => {
    setGeneratingCount(c => c + 1);
    try {
      if (!script || !script.length) throw new Error("Empty script");

      const ai = getClient();
      
      // CRITICAL CHANGE: Sequential processing.
      // Parallel processing often hits rate limits or token limits per minute, resulting in dropped chunks.
      // Sequential is slower but guarantees completeness for long scripts.
      
      // Chunking: Process 1 line at a time to ensure maximum stability, 
      // or small groups if lines are very short. 
      // Given "Teaching" mode usually has long paragraphs, 1 line per chunk is safer.
      const CHUNK_SIZE = 1; 
      const chunks: PodcastScriptLine[][] = [];
      for (let i = 0; i < script.length; i += CHUNK_SIZE) {
        chunks.push(script.slice(i, i + CHUNK_SIZE));
      }

      const results: string[] = new Array(chunks.length).fill('');
      let completed = 0;
      
      for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const conversationText = chunk.map(line => `${line.speaker}: ${line.text}`).join('\n');
          const prompt = `TTS the following conversation:\n\n${conversationText}`;

          let retries = 0;
          let success = false;
          
          while (retries < 4 && !success) {
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
                      results[i] = audioData;
                      success = true;
                  } else {
                      throw new Error("Empty audio response");
                  }
              } catch (e) {
                  retries++;
                  // Exponential backoff
                  const delay = 1000 * Math.pow(2, retries);
                  console.warn(`Chunk ${i} failed (Attempt ${retries}). Retrying in ${delay}ms...`);
                  await new Promise(r => setTimeout(r, delay));
              }
          }
          
          if (!success) {
              console.error(`Failed to generate audio for chunk ${i} after retries.`);
              // We continue, but this will result in a gap. 
              // Alternatively, aborting might be better, but for UX, a gap is better than total failure.
          }

          completed++;
          if (onProgress) onProgress(Math.round((completed / chunks.length) * 100));
      }

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

      // NOTE: Using 2.0-flash-exp to ensure availability if image model is flaky
      // Ideally use imagen-3.0-generate-001 if available
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
        model: MODEL_TEXT,
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }] 
        }
     });
     return response.text || '';
  }, []);

  return {
    isGenerating,
    generateBlueprint,
    generatePodcastScript,
    synthesizePodcastAudio,
    generateCoverImage,
    chatWithSources
  };
};
