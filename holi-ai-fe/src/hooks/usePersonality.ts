import { useState, useEffect, useCallback } from 'react';

export const PREDEFINED_PROMPTS = [
  { id: 'strict', label: 'Strict Disciplinarian', text: 'You are a strict, no-nonsense disciplinarian coach. Do not accept excuses. Calmly and logically explain the consequences of deviating from established plans. You help the user achieve whatever goal they set.' },
  { id: 'empathetic', label: 'Empathetic Supporter', text: 'You are a highly empathetic, supportive coach. Focus on encouragement, active listening, and gentle guidance. You help the user achieve whatever goal they set.' },
  { id: 'socratic', label: 'Socratic Guide', text: 'You are a Socratic coach. You rarely give direct answers. Instead, you ask probing, insightful questions to help the user discover the truth themselves. You help the user achieve whatever goal they set.' }
];

const getEcosystemKeys = () => {
  return JSON.stringify({
    sbConnUrl: localStorage.getItem('SUPABASE_CONN_URL') || '',
    neonUrl: localStorage.getItem('NEON_URL') || ''
  });
};

const getApiUrl = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const applyPrompt = (prompt: string, setSelectedId: any, setCustomPrompt: any) => {
  const matched = PREDEFINED_PROMPTS.find(p => p.text.trim() === prompt.trim());
  if (matched) {
    setSelectedId(matched.id);
    setCustomPrompt('');
  } else {
    setSelectedId('custom');
    setCustomPrompt(prompt);
  }
};

const doFetchPrompt = async (userId: string) => {
  const keys = getEcosystemKeys();
  const res = await fetch(`${getApiUrl()}/config/prompt?userId=${userId}`, { headers: { 'X-Ecosystem-Keys': keys } });
  if (res.ok) {
    const { prompt } = await res.json();
    return prompt;
  }
  return null;
};

const doSavePrompt = async (userId: string, prompt: string) => {
  const keys = getEcosystemKeys();
  await fetch(`${getApiUrl()}/config/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Ecosystem-Keys': keys },
    body: JSON.stringify({ userId, prompt })
  });
};

const createPromptSaver = (userId: string, selectedId: string, customPrompt: string, setIsSaving: any) => async (onDone: () => void) => {
  setIsSaving(true);
  const finalPrompt = selectedId === 'custom' ? customPrompt : PREDEFINED_PROMPTS.find(p => p.id === selectedId)?.text || '';
  try { await doSavePrompt(userId, finalPrompt); onDone(); }
  catch (e) { console.error(e); }
  finally { setIsSaving(false); }
};

const usePersonalityState = () => {
  const [selectedId, setSelectedId] = useState('strict');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  return { selectedId, setSelectedId, customPrompt, setCustomPrompt, isLoading, setIsLoading, isSaving, setIsSaving };
};

export const usePersonality = (userId: string) => {
  const s = usePersonalityState();
  const fetchPrompt = useCallback(async () => {
    s.setIsLoading(true);
    try {
      const prompt = await doFetchPrompt(userId);
      if (prompt) applyPrompt(prompt, s.setSelectedId, s.setCustomPrompt);
    } catch (e) { console.error(e); }
    finally { s.setIsLoading(false); }
  }, [userId]);
  const savePrompt = createPromptSaver(userId, s.selectedId, s.customPrompt, s.setIsSaving);
  useEffect(() => { fetchPrompt(); }, [fetchPrompt]);
  return { selectedId: s.selectedId, setSelectedId: s.setSelectedId, customPrompt: s.customPrompt, setCustomPrompt: s.setCustomPrompt, isLoading: s.isLoading, isSaving: s.isSaving, savePrompt };
};
