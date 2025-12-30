
import { useState, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { LearningSource, PodcastScriptLine, PodcastBlueprint, PodcastType, PodcastChapter } from '../types';
import { mergeBase64PCM } from '../utils/audioUtils';

const MODEL_TEXT = 'gemini-3-flash-preview'; 
const MODEL_AUDIO = 'gemini-2.5-flash-preview-tts'; 
const MODEL_IMAGE = 'gemini-2.5-flash-image'; 
const API_KEY = process.env.API_KEY as string;

export const useLearningAI = () => {
  const [generatingCount, setGeneratingCount] = useState(0);
  const isGenerating = generatingCount > 0;

  const getClient = () => new GoogleGenAI({ apiKey: API_KEY });

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
        3. Identify 3-5 "Common Misconceptions" that learners often have about this topic.
        4. Create 3 "Checkpoint Questions" to facilitate reflection.
        5. Extract 3-5 key glossary terms.
        
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
          "checkpoints": ["string"],
          "misconceptions": ["string"],
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
            You are a "Teaching Podcast" host pair: Host (Energetic, Curious) and Expert (Calm, Authoritative).
            
            BLUEPRINT:
            ${JSON.stringify(blueprint)}
            
            SOURCES:
            ${sourceContext}
            
            TASK:
            Write a COMPREHENSIVE, WORD-FOR-WORD script.
            Target Length: 1500-2500 words (approx 10-15 minutes).
            
            STRUCTURE & PEDAGOGY:
            - Iterate through EVERY chapter in the blueprint.
            - Explicitly address the "Common Misconceptions" defined in the blueprint (remediate them).
            - Insert "Checkpoints": Have the Host ask the listener a reflective question, pause briefly (narratively), and then the Expert explains the answer.
            - Use analogies and examples from the sources.
            
            Format the output strictly as JSON.
            
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
            Target Length: 1000-1500 words (approx 7-10 minutes).
            Cover the topic clearly and engagingly.
            
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
      
      // OPTIMIZATION: Use 4000 chars. 8000 was causing timeouts/failures. 4000 is safer.
      const MAX_CHAR_PER_CHUNK = 4000; 
      const chunks: PodcastScriptLine[][] = [];
      let currentChunk: PodcastScriptLine[] = [];
      let currentLen = 0;

      for (const line of script) {
          const lineLen = line.text.length + 10;
          if (currentLen + lineLen > MAX_CHAR_PER_CHUNK && currentChunk.length > 0) {
              chunks.push(currentChunk);
              currentChunk = [];
              currentLen = 0;
          }
          currentChunk.push(line);
          currentLen += lineLen;
      }
      if (currentChunk.length > 0) chunks.push(currentChunk);

      const results: string[] = new Array(chunks.length).fill('');
      
      for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const conversationText = chunk.map(line => `${line.speaker}: ${line.text}`).join('\n');
          const prompt = `TTS the following conversation:\n\n${conversationText}`;

          // Rate Limit Cool-down: 10s delay between chunks to be extremely safe
          if (i > 0) {
              await new Promise(r => setTimeout(r, 10000));
          }

          let retries = 0;
          let success = false;
          // Increased to 5 retries to handle transient 429s better
          const MAX_RETRIES = 5;
          
          while (retries < MAX_RETRIES && !success) { 
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
              } catch (e: any) {
                  retries++;
                  // Detect Quota errors (429/503/403) or generic "resource exhausted"
                  const isQuota = e.message?.includes('429') || 
                                  e.message?.includes('quota') || 
                                  e.message?.includes('503') || 
                                  e.message?.includes('resource exhausted');
                  
                  console.warn(`Chunk ${i} failed (Attempt ${retries}). Is Quota: ${isQuota}`, e);
                  
                  if (isQuota) {
                      // Aggressive penalty box for quota errors
                      const waitTime = retries * 10000; // 10s, 20s, 30s...
                      console.log(`Quota hit. Waiting ${waitTime/1000}s...`);
                      await new Promise(r => setTimeout(r, waitTime));
                  } else {
                      // Standard backoff
                      await new Promise(r => setTimeout(r, 2000 * retries));
                  }
              }
          }

          // If a chunk failed completely after all retries
          if (!success) {
               console.error("Critical: Audio chunk generation failed permanently after max retries.");
               return null;
          }

          if (onProgress) {
              onProgress(Math.round(((i + 1) / chunks.length) * 100));
          }
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

     const prompt = `You are a helpful AI Tutor embedded in a Learning Podcast application.
     Your goal is to answer the user's question about the podcast topic comprehensively.
     
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

  // NEW: Feature 2 - Generate Chapters based on script/context
  const generateChapters = useCallback(async (
      context: string,
      duration: number
  ): Promise<PodcastChapter[]> => {
      setGeneratingCount(c => c + 1);
      try {
          const ai = getClient();
          const prompt = `
          Analyze the following podcast content and generate 5-8 chapter markers.
          Total duration: ${Math.floor(duration)} seconds.
          
          CONTENT:
          ${context.substring(0, 20000)}...

          OUTPUT JSON:
          {
            "chapters": [
              { "title": "string", "startTime": number, "summary": "string", "objective": "string", "keyTakeaways": ["string"] }
            ]
          }
          `;
          
          const response = await ai.models.generateContent({
              model: MODEL_TEXT,
              contents: prompt,
              config: { responseMimeType: 'application/json' }
          });
          const parsed = JSON.parse(cleanJson(response.text || '{}'));
          
          if (parsed.chapters) {
              return parsed.chapters.map((ch: any, i: number) => ({
                  ...ch,
                  id: `ch-${Date.now()}-${i}`,
                  startTime: Math.min(ch.startTime, duration)
              }));
          }
          return [];
      } catch (e) {
          console.error("Chapter gen error", e);
          return [];
      } finally {
          setGeneratingCount(c => Math.max(0, c - 1));
      }
  }, []);

  return {
    isGenerating,
    generateBlueprint,
    generatePodcastScript,
    synthesizePodcastAudio,
    generateCoverImage,
    chatWithSources,
    generateChapters
  };
};
