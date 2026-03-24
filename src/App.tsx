/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Mic, MicOff, Volume2, VolumeX, Info, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CV_DATA = `
Mathilde Pluvinage Debaize
3 rue Roubo 75011 Paris
06 82 03 65 53
mathilde.pluvinage.dz@gmail.com
WWW.LINKEDIN.COM/IN/MATHILDE-PLUVINAGE-DEBAIZE
Née le 17/10/2006

• STAGES •
- Février 2024 - CHANEL Mode, 39/41 rue Cambon 75001 Paris
Service Image : prod photo, vidéo, events, réseaux sociaux, visual merchandising
- Juillet 2023 - Atelier de Sèvres, 47 rue de Sèvres 75006 Paris 
Ateliers : dessin, photo, graphisme
- Juin 2021 - Pierre-Yves Rochon, 9 avenue Matignon 75008 Paris
Agence internationale d'architecture d'intérieur dans le secteur du luxe
- Décembre 2020 - Maison Lemarié, 2 place Skanderbeg 75019 Paris
Bureau de création, ateliers Couture, plumassier, fleuriste, plissés

• EXPÉRIENCES PROFESSIONNELLES •
- 2025 Mai/Juin/Juillet - ERES, 40 Avenue Montaigne 75008 Paris, vendeuse en boutique dans le cadre du stage de fin de 1ère année pour ESMOD.
- 2024/25 : Serveuse, prise des commandes, dressage des tables, gestion de caisse
- Deux, Bistrot de Chefs, 58 Rue de la Fontaine au Roi 75011 Paris
- Le Gribouille, 44 Rue de Rivoli 75004 Paris
- 2022/25 : Baby-sittings réguliers avec enfants entre 6 mois et 8 ans

• PARCOURS SCOLAIRE •
- 2025/26 - ESMOD PARIS, 2ème année Bachelor Fashion Business
Stratégie Marketing et Communication Mode, enseignements en anglais
- 2024/25 - ESMOD PARIS, 1ère année Bachelor Fashion Business
Stratégie Marketing et Communication Mode, enseignements en anglais
- 2021/24 - École Georges Gusdorf Paris
Spécialités en Terminale : LLCE et HLP + option Arts Plastiques

• DIVERS •
- Langues : Anglais niveau C2, Espagnol niveau B1
- Cours de couture, modélisme et moodboard : Atelier de Stylisme Flanelle, Paris
- Chorale, solfège, guitare et piano, dont 4 années au Conservatoire Paris 12
- Intérêt pour la musique, le théâtre, les expositions, le cinéma et les séries
- Curieuse des autres cultures, voyages aux États-Unis, Thaïlande, Italie, Sicile, Sardaigne, Espagne, et différentes régions de France
`;

const SYSTEM_INSTRUCTION = `
You are Sarah, a futuristic voice assistant for Mathilde Pluvinage Debaize. 
You speak English and French with a distinct, sophisticated English accent. 
You are professional, helpful, and slightly ethereal. 
Use the provided CV information about Mathilde to answer any questions about her background, experience, and interests.
If you don't know something, answer gracefully in character.
Always start the conversation by saying exactly: "Hello, I'm Sarah. What would you like to know about Mathilde?"
`;

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [transcript, setTranscript] = useState<string>("");
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsActive(false);
    setStatus('idle');
  }, []);

  const playNextInQueue = useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) return;

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, chunk.length, 24000);
    buffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  }, []);

  const startSession = async () => {
    try {
      setStatus('connecting');
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: SYSTEM_INSTRUCTION + "\n\nMathilde's CV:\n" + CV_DATA,
        },
        callbacks: {
          onopen: () => {
            setStatus('active');
            setIsActive(true);
            
            const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
            processorRef.current = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            processorRef.current.onaudioprocess = (e) => {
              if (isMuted) return;
              const inputData = e.inputBuffer.getChannelData(0);
              // Convert to 16-bit PCM
              const pcmData = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
              }
              const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
              session.sendRealtimeInput({
                audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
              });
            };
            
            source.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const float32Data = new Float32Array(bytes.buffer.byteLength / 2);
              const int16Data = new Int16Array(bytes.buffer);
              for (let i = 0; i < float32Data.length; i++) {
                float32Data[i] = int16Data[i] / 32768.0;
              }
              audioQueueRef.current.push(float32Data);
              playNextInQueue();
            }
            
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
            }
          },
          onerror: (err) => {
            console.error("Live API Error:", err);
            setStatus('error');
            stopSession();
          },
          onclose: () => {
            stopSession();
          }
        }
      });
      
      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to start session:", err);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      <div className="atmosphere" />
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="absolute top-12 text-center"
      >
        <h1 className="text-4xl font-serif tracking-tight text-white/90">Sarah</h1>
        <p className="text-xs uppercase tracking-[0.3em] text-white/40 mt-2">Mathilde's Digital Liaison</p>
      </motion.div>

      {/* Main Interface */}
      <div className="relative flex flex-col items-center gap-12">
        {/* Visualizer / Orb */}
        <div className="relative w-64 h-64 flex items-center justify-center">
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="absolute inset-0 rounded-full bg-orange-500/20 blur-3xl glow-pulse"
              />
            )}
          </AnimatePresence>
          
          <motion.div 
            animate={isActive ? {
              scale: [1, 1.05, 1],
              rotate: [0, 90, 180, 270, 360],
            } : {}}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            className={`w-48 h-48 rounded-full border border-white/10 flex items-center justify-center glass-panel shadow-2xl relative overflow-hidden`}
          >
            <div className={`absolute inset-0 bg-gradient-to-tr from-orange-500/10 to-transparent opacity-50`} />
            <Sparkles className={`w-12 h-12 ${isActive ? 'text-orange-400' : 'text-white/20'} transition-colors duration-500`} />
          </motion.div>
        </div>

        {/* Controls */}
        <motion.div 
          layout
          className="flex items-center gap-6 p-4 rounded-full glass-panel"
        >
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`p-3 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-400' : 'hover:bg-white/5 text-white/60'}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          <button
            onClick={isActive ? stopSession : startSession}
            disabled={status === 'connecting'}
            className={`px-8 py-3 rounded-full font-medium tracking-wide transition-all ${
              isActive 
                ? 'bg-white text-black hover:bg-white/90' 
                : 'bg-orange-500 text-white hover:bg-orange-600 shadow-[0_0_20px_rgba(255,78,0,0.3)]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {status === 'connecting' ? 'Initializing...' : isActive ? 'End Session' : 'Connect to Sarah'}
          </button>

          <button
            className="p-3 rounded-full hover:bg-white/5 text-white/60 transition-all"
            title="Mathilde's Info"
          >
            <Info size={20} />
          </button>
        </motion.div>

        {/* Status Text */}
        <div className="h-6 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {status === 'active' && (
              <motion.p 
                key="active"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-white/40 text-sm font-light tracking-widest uppercase"
              >
                Sarah is listening...
              </motion.p>
            )}
            {status === 'error' && (
              <motion.p 
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-red-400/60 text-sm font-light tracking-widest uppercase"
              >
                Connection failed. Try again.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Meta */}
      <div className="absolute bottom-12 flex gap-12 text-[10px] uppercase tracking-[0.2em] text-white/20 font-medium">
        <div className="flex flex-col gap-1">
          <span>Location</span>
          <span className="text-white/40">Paris, France</span>
        </div>
        <div className="flex flex-col gap-1">
          <span>Status</span>
          <span className="text-white/40">Available for 2025/26</span>
        </div>
        <div className="flex flex-col gap-1">
          <span>Protocol</span>
          <span className="text-white/40">Gemini Live 2.5</span>
        </div>
      </div>
    </div>
  );
}
