'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

import { Clipboard } from '@capacitor/clipboard';
import { useNotifications } from '../hooks/useNotifications';
import { useBiometricsLog } from '../hooks/useBiometricsLog';
import { useActivities, ActivityLog } from '../hooks/useActivities';
import { useCrons } from '../hooks/useCrons';
import { useModules } from '../hooks/useModules';
import { useDebug, LlmTrace } from '../hooks/useDebug';
import { Message, Cron } from '../types';
import { DICTIONARY } from '../locales';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import parser from 'cron-parser';
import { wipeClientStorage } from '../lib/wipe';

const WrapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18"></path>
    <path d="M3 12h15a3 3 0 0 1 0 6h-4"></path>
    <polyline points="16 16 14 18 16 20"></polyline>
    <path d="M3 18h4"></path>
  </svg>
);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const handleDoubleParsed = (parsed: any) => {
  try {
    const doubleParsed = JSON.parse(parsed.chat_message);
    if (doubleParsed?.chat_message) return doubleParsed;
  } catch (_e) {}
  return parsed;
};

const handleParsedPayload = (parsed: any) => {
  if (parsed?.coach_ui_payload) {
    return {
      headline: parsed.coach_ui_payload.headline,
      diagnostic_summary: parsed.coach_ui_payload.diagnostic_summary,
      chat_message: parsed.chat_message
    };
  }
  if (typeof parsed?.chat_message === 'string' && parsed.chat_message.startsWith('{')) {
    return handleDoubleParsed(parsed);
  }
  return parsed;
};

const parseAgentResponse = (content: string) => {
  if (!content) return {};
  try {
    return handleParsedPayload(JSON.parse(content));
  } catch {
    return { chat_message: content };
  }
};


const getChatText = (m: Message) => {
  if (m.role === 'user') return m.content;
  const parsed = parseAgentResponse(m.content);
  return parsed?.chat_message || m.content;
};

const checkConfig = () => {
  if (process.env.NEXT_PUBLIC_LOCAL_DB === 'true') return !!localStorage.getItem('GROQ_KEY');
  const hasNeon = !!localStorage.getItem('NEON_URL');
  const hasSb = !!localStorage.getItem('SUPABASE_CONN_URL');
  return !!(localStorage.getItem('GROQ_KEY') && (hasNeon || hasSb));
};

const loadSettings = (s: any) => {
  s.setSbConnUrl(localStorage.getItem('SUPABASE_CONN_URL') || '');
  s.setNeonUrl(localStorage.getItem('NEON_URL') || '');
  s.setGroqKey(localStorage.getItem('GROQ_KEY') || '');
  s.setGroqModel(localStorage.getItem('GROQ_MODEL') || 'llama-3.3-70b-versatile');
  s.setRagThreshold(localStorage.getItem('RAG_THRESHOLD') || '0.5');
  s.setDebugMode(localStorage.getItem('DEBUG_MODE') !== 'false');
  s.setAppleHealth(localStorage.getItem('APPLE_HEALTH_TOKEN') || '');
  s.setDeviceClientId(localStorage.getItem('GARMIN_CLIENT_ID') || '');
  s.setDeviceClientSecret(localStorage.getItem('GARMIN_CLIENT_SECRET') || '');
};

const syncConfigToBackend = async (s: any) => {
  try {
    const config = { GARMIN_CLIENT_ID: s.deviceClientId, GARMIN_CLIENT_SECRET: s.deviceClientSecret, GROQ_KEY: s.groqKey, GROQ_MODEL: s.groqModel, RAG_THRESHOLD: s.ragThreshold, DEBUG_MODE: s.debugMode };
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: { sbConnUrl: s.sbConnUrl, neonUrl: s.neonUrl }, config })
    });
  } catch (_e) {
    console.error('Sync failed', _e);
  }
};

const persistLocalKeys = (s: any) => {
  localStorage.setItem('SUPABASE_CONN_URL', s.sbConnUrl);
  localStorage.setItem('NEON_URL', s.neonUrl);
  localStorage.setItem('GROQ_KEY', s.groqKey);
  localStorage.setItem('GROQ_MODEL', s.groqModel);
  localStorage.setItem('RAG_THRESHOLD', s.ragThreshold);
  localStorage.setItem('DEBUG_MODE', s.debugMode ? 'true' : 'false');
  localStorage.setItem('APPLE_HEALTH_TOKEN', s.appleHealth);
  localStorage.setItem('GARMIN_CLIENT_ID', s.deviceClientId);
  localStorage.setItem('GARMIN_CLIENT_SECRET', s.deviceClientSecret);
};

const saveSettings = async (s: any, onSave: () => void) => {
  persistLocalKeys(s);
  await syncConfigToBackend(s);
  onSave();
};


const InfoModal = ({ title, text, close, dict }: any) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
    <div className="card" style={{ width: '100%', maxWidth: '400px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>{title}</h3>
      <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-line', userSelect: 'text' }}>{text}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button onClick={(e) => { e.preventDefault(); close(); }} type="button" className="apple-button" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>{dict.gotIt}</button>
      </div>
    </div>
  </div>
);

const ConfirmModal = ({ title, text, onConfirm, onCancel, dict }: any) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onCancel}>
    <div className="card" style={{ width: '100%', maxWidth: '400px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>{title}</h3>
      <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{text}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.5rem' }}>
        <button onClick={(e) => { e.preventDefault(); onCancel(); }} type="button" className="apple-button" style={{ width: 'auto', padding: '0.5rem 1.5rem', background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>{dict.cancel}</button>
        <button onClick={(e) => { e.preventDefault(); onConfirm(); }} type="button" className="apple-button" style={{ width: 'auto', padding: '0.5rem 1.5rem', background: 'var(--error-color, #ff4444)' }}>{dict.confirm}</button>
      </div>
    </div>
  </div>
);

const InfoBtn = ({ openInfo, label, info }: any) => (
  <button type="button" onClick={(e) => { e.preventDefault(); openInfo({ title: label, text: info }); }} style={{ background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}>?</button>
);

const useOutsideClick = (ref: any, setOpen: any) => {
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, setOpen]);
};

const getNormOpts = (options: any) => options.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o);

const getSelectedLabel = (normOpts: any, value: any) => normOpts.find((o: any) => String(o.value) === String(value))?.label || value || (normOpts[0]?.label) || '';

const SelectDropdown = ({ normOpts, value, onChange, setOpen }: any) => (
  <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', marginTop: '4px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '250px', overflowY: 'auto' }}>
    {normOpts.map((opt: any, i: number) => (
      <div key={opt.value} style={{ padding: '0.85rem 1rem', cursor: 'pointer', borderBottom: i === normOpts.length - 1 ? 'none' : '1px solid var(--border-color)', color: String(opt.value) === String(value) ? 'var(--accent-color)' : 'var(--text-primary)', background: String(opt.value) === String(value) ? 'var(--bg-color)' : 'transparent', borderTopLeftRadius: i === 0 ? '10px' : '0', borderTopRightRadius: i === 0 ? '10px' : '0', borderBottomLeftRadius: i === normOpts.length - 1 ? '10px' : '0', borderBottomRightRadius: i === normOpts.length - 1 ? '10px' : '0' }} onClick={() => { onChange(opt.value); setOpen(false); }}>
        {opt.label}
      </div>
    ))}
  </div>
);

const CustomSelect = ({ value, onChange, options, style }: any) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, setOpen);
  const normOpts = getNormOpts(options);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', ...style }}>
      <div className="apple-input" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => setOpen(!open)}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }}>{getSelectedLabel(normOpts, value)}</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}><path d="m6 9 6 6 6-6"/></svg>
      </div>
      {open && <SelectDropdown normOpts={normOpts} value={value} onChange={onChange} setOpen={setOpen} />}
    </div>
  );
};

const FieldInput = ({ type, val, setVal, options, disabled }: any) => {
  if (type === 'select') {
    return <CustomSelect value={val} onChange={setVal} options={options} disabled={disabled} />;
  }
  return <input type={type} value={val} onChange={(e) => setVal(e.target.value)} className="apple-input" disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }} />;
};

const SettingsField = ({ label, info, type = 'text', val, setVal, openInfo, options, disabled }: any) => (
  <div style={{ marginBottom: '1rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</label>
      <InfoBtn openInfo={openInfo} label={label} info={info} />
    </div>
    <FieldInput type={type} val={val} setVal={setVal} options={options} disabled={disabled} />
  </div>
);

const TOOLTIPS = {
  sbConnUrl: "REQUIRED (Unless using Neon): Your personal AI database Postgres Connection String.\n\n1. Go to your Supabase 'Project Settings' dashboard.\n2. Click 'Database' under Configuration.\n3. Scroll down to 'Connection string' and select 'URI'.\n4. Replace [YOUR-PASSWORD] with your actual database password and paste it here.",
  neonUrl: "REQUIRED (Unless using Supabase): Connect your cloud Neon Postgres database. If provided, Holi-AI will use Neon instead of Supabase.\n\n1. Go to your Neon console.\n2. Copy the 'Postgres URL' from your project dashboard.\n3. Paste the full postgres:// connection string here.",
  groq: "REQUIRED: The brain of the application. This connects to Groq's lightning-fast servers to power the AI reasoning, generate workout plans, and chat with you.\n\n1. Go to console.groq.com/keys.\n2. Click 'Create API Key'.\n3. Name it 'Holistic Coach'.\n4. Copy the key and paste it here.",
  groqModel: "REQUIRED: The specific AI model you want to run on Groq. The default is 'llama-3.3-70b-versatile'. Check groq.com/pricing for other options.",
  ragThreshold: "Controls how strict the AI's memory recall is. A lower value (e.g. 0.3) means only highly relevant facts are remembered. A higher value (e.g. 0.6) allows looser matching. Default is 0.5.",
  health: "OPTIONAL: Provides the AI with rich physical telemetry (steps, sleep, heart rate). This allows the coach to generate highly personalized daily plans based on actual fatigue.\n\nApple Health requires an export shortcut or third-party bridge app to generate a token. Follow your provider's docs and paste the token here.",
  garmin: "OPTIONAL: Connect your Garmin Developer account to automatically pull your daily telemetry. \n\nIf you don't have an account, you can register for free at developer.garmin.com. Once approved, copy your Client ID and Client Secret here.",
};

const NeonFields = ({ isLocalDb, s, setInfo, dict }: any) => {
  if (isLocalDb) return null;
  const disabled = !!s.sbConnUrl;
  return (
    <>
      <SettingsField label={dict.neonUrl} info={TOOLTIPS.neonUrl} val={s.neonUrl} setVal={s.setNeonUrl} openInfo={setInfo} disabled={disabled} />
    </>
  );
};

const SbFields = ({ isLocalDb, s, setInfo }: any) => {
  if (isLocalDb) return null;
  const disabled = !!s.neonUrl;
  return (
    <>
      <SettingsField label="Supabase DB URL" info={TOOLTIPS.sbConnUrl} val={s.sbConnUrl} setVal={s.setSbConnUrl} openInfo={setInfo} disabled={disabled} />
    </>
  );
};

const BiometricsFields = ({ s, setInfo, dict }: any) => {
  if (process.env.NEXT_PUBLIC_GARMIN_DISABLED === 'true') return null;
  return (
    <>
      <SettingsField label={dict.garminId} info={TOOLTIPS.garmin} val={s.deviceClientId} setVal={s.setDeviceClientId} openInfo={setInfo} />
      <SettingsField label={dict.garminSecret} info={TOOLTIPS.garmin} type="password" val={s.deviceClientSecret} setVal={s.setDeviceClientSecret} openInfo={setInfo} />
    </>
  );
};

const GROQ_MODELS = [
  'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 
  'openai/gpt-oss-safeguard-20b', 'meta-llama/llama-4-scout-17b-16e-instruct', 
  'meta-llama/llama-prompt-guard-2-22m', 'meta-llama/llama-prompt-guard-2-86m', 
  'qwen/qwen3-32b', 'groq/compound', 'groq/compound-mini', 
  'canopylabs/orpheus-arabic-saudi', 'canopylabs/orpheus-v1-english',
  'whisper-large-v3', 'whisper-large-v3-turbo'
];

const GroqFields = ({ s, setInfo, dict }: any) => {
  return (
    <>
      <SettingsField label={dict.groqKey} info={TOOLTIPS.groq} type="password" val={s.groqKey} setVal={s.setGroqKey} openInfo={setInfo} />
      <SettingsField label={dict.groqModel} info={TOOLTIPS.groqModel} type="select" options={GROQ_MODELS} val={s.groqModel} setVal={s.setGroqModel} openInfo={setInfo} />
    </>
  );
};

import { usePersonality, PREDEFINED_PROMPTS } from '../hooks/usePersonality';

const getLabel = (p: any, dict: any) => {
  if (p.label === 'Strict Disciplinarian') return dict.personalityStrict;
  if (p.label === 'Empathetic Supporter') return dict.personalityEmpathetic;
  if (p.label === 'Socratic Guide') return dict.personalitySocratic;
  return p.label;
};

const validateSettings = (s: any, setInfo: any, isLocalDb: boolean) => {
  if (!s.groqKey) {
    setInfo({ title: 'Validation Error', text: 'Groq API Key is required.' });
    return false;
  }
  if (!isLocalDb && !s.neonUrl && !s.sbConnUrl) {
    setInfo({ title: 'Validation Error', text: 'You must provide either a Neon Database URL OR a Supabase Connection String.' });
    return false;
  }
  return true;
};

const buildWipeConfig = (s: any) => ({
  GARMIN_CLIENT_ID: s.deviceClientId,
  GARMIN_CLIENT_SECRET: s.deviceClientSecret,
  GROQ_KEY: s.groqKey,
  GROQ_MODEL: s.groqModel,
  RAG_THRESHOLD: s.ragThreshold,
  DEBUG_MODE: s.debugMode
});

const doWipe = async (s: any, clearChat: any) => {
  const config = buildWipeConfig(s);
  await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/wipe?userId=usr_1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: { sbConnUrl: s.sbConnUrl, neonUrl: s.neonUrl }, config })
  });
  clearChat();
  await wipeClientStorage();
  window.location.reload();
};

const PersonalityOptions = ({ selectedId, setSelectedId, dict }: any) => (
  <>
    {PREDEFINED_PROMPTS.map(p => (
      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
        <input type="radio" name="personality" value={p.id} checked={selectedId === p.id} onChange={() => setSelectedId(p.id)} />
        <span style={{ fontSize: '1rem' }}>{getLabel(p, dict)}</span>
      </label>
    ))}
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
      <input type="radio" name="personality" value="custom" checked={selectedId === 'custom'} onChange={() => setSelectedId('custom')} />
      <span style={{ fontSize: '1rem' }}>{dict.personalityCustom}</span>
    </label>
  </>
);

const CustomPersonalityInput = ({ customPrompt, setCustomPrompt }: any) => (
  <div style={{ position: 'relative' }}>
    <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value.substring(0, 500))} className="apple-input" style={{ height: '100px', resize: 'none', marginTop: '0.5rem' }} placeholder="Enter custom prompt..." />
    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right', marginTop: '0.25rem' }}>{customPrompt.length}/500</div>
  </div>
);

const SettingsFormPersonality = ({ personality, dict }: any) => (
  <>
    <h2 style={{ marginTop: '2rem', marginBottom: '1rem' }}>{dict.coachPersonality}</h2>
    {personality.isLoading ? (
      <div style={{ color: 'var(--text-secondary)' }}>{dict.syncing}</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <PersonalityOptions selectedId={personality.selectedId} setSelectedId={personality.setSelectedId} dict={dict} />
        {personality.selectedId === 'custom' && <CustomPersonalityInput customPrompt={personality.customPrompt} setCustomPrompt={personality.setCustomPrompt} />}
      </div>
    )}
  </>
);

const SettingsFormEcosystem = ({ s, setInfo, dict, isLocalDb }: any) => (
  <>
    <h2 style={{ marginBottom: '1.5rem' }}>{dict.ecosystem}</h2>
    <GroqFields s={s} setInfo={setInfo} dict={dict} />
    <NeonFields isLocalDb={isLocalDb} s={s} setInfo={setInfo} dict={dict} />
    <SbFields isLocalDb={isLocalDb} s={s} setInfo={setInfo} />
    <SettingsField label={dict.appleHealth} info={TOOLTIPS.health} val={s.appleHealth} setVal={s.setAppleHealth} openInfo={setInfo} />
    <BiometricsFields s={s} setInfo={setInfo} dict={dict} />
    <SettingsField label={dict.ragThreshold} info={TOOLTIPS.ragThreshold} val={s.ragThreshold} setVal={s.setRagThreshold} openInfo={setInfo} />
  </>
);

const SettingsFormHeader = ({ s, dict }: any) => (
  <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--panel-bg)', padding: '1rem', borderRadius: '8px' }}>
    <label style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{dict.debugMode}</label>
    <input type="checkbox" checked={s.debugMode} onChange={(e) => s.setDebugMode(e.target.checked)} />
  </div>
);

const SettingsFormDangerZone = ({ dict, setWiping }: any) => (
  <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
    <h3 style={{ color: 'var(--error-color, #ff4444)', marginBottom: '0.5rem' }}>{dict.dangerZone}</h3>
    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{dict.wipeDbWarning}</p>
    <button onClick={() => setWiping(true)} className="apple-button" style={{ background: 'var(--error-color, #ff4444)' }}>{dict.wipeDatabase}</button>
  </div>
);

const doSave = (s: any, personality: any, setInfo: any, isLocalDb: boolean, onSave: any) => {
  if (validateSettings(s, setInfo, isLocalDb)) personality.savePrompt(() => saveSettings(s, onSave));
};

const doWipeAction = async (s: any, isLocalDb: boolean, setInfo: any, setWiping: any, dict: any, clearChat: any) => {
  if (!isLocalDb && !s.sbConnUrl && !s.neonUrl) {
    setInfo({ title: 'Validation Error', text: 'You must provide either a Neon Database URL OR a Supabase Connection String.' });
    setWiping(false);
    return;
  }
  try { await doWipe(s, clearChat); } 
  catch (e: any) { setInfo({ title: dict.error, text: e.message }); } 
  finally { setWiping(false); }
};

const useSettingsHandlers = (s: any, isLocalDb: boolean, personality: any, onSave: any, clearChat: any, setInfo: any, setWiping: any, dict: any) => {
  const handleSave = () => doSave(s, personality, setInfo, isLocalDb, onSave);
  const handleWipe = () => doWipeAction(s, isLocalDb, setInfo, setWiping, dict, clearChat);
  return { handleSave, handleWipe };
};

const SettingsFormContent = ({ s, setInfo, setWiping, isLocalDb, personality, handleSave, handleWipe, wiping, info, dict }: any) => (
  <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
    <SettingsFormHeader s={s} dict={dict} />
    <SettingsFormEcosystem s={s} setInfo={setInfo} dict={dict} isLocalDb={isLocalDb} />
    <SettingsFormPersonality personality={personality} dict={dict} />
    <button onClick={handleSave} className="apple-button" style={{ marginTop: '1rem' }} disabled={personality.isSaving}>{personality.isSaving ? dict.syncing : dict.syncEcosystem}</button>
    <SettingsFormDangerZone dict={dict} setWiping={setWiping} />
    {wiping && <ConfirmModal title={dict.wipeDatabase} text={dict.confirmWipe} onConfirm={handleWipe} onCancel={() => setWiping(false)} dict={dict} />}
    {info && <InfoModal title={info.title} text={info.text} close={() => setInfo(null)} dict={dict} />}
  </div>
);

const SettingsForm = ({ s, onSave, dict, clearChat }: any) => {
  const [info, setInfo] = useState<{title: string, text: string} | null>(null);
  const [wiping, setWiping] = useState(false);
  const isLocalDb = process.env.NEXT_PUBLIC_LOCAL_DB === 'true';
  const personality = usePersonality('usr_1');
  const { handleSave, handleWipe } = useSettingsHandlers(s, isLocalDb, personality, onSave, clearChat, setInfo, setWiping, dict);

  return <SettingsFormContent s={s} setInfo={setInfo} setWiping={setWiping} isLocalDb={isLocalDb} personality={personality} handleSave={handleSave} handleWipe={handleWipe} wiping={wiping} info={info} dict={dict} />;
};

const SettingsView = ({ setConfigured, dict, clearChat }: any) => {
  const [sbConnUrl, setSbConnUrl] = useState('');
  const [neonUrl, setNeonUrl] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [groqModel, setGroqModel] = useState('');
  const [ragThreshold, setRagThreshold] = useState('');
  const [debugMode, setDebugMode] = useState(true);
  const [appleHealth, setAppleHealth] = useState('');
  const [deviceClientId, setDeviceClientId] = useState('');
  const [deviceClientSecret, setDeviceClientSecret] = useState('');
  const s = { sbConnUrl, setSbConnUrl, neonUrl, setNeonUrl, groqKey, setGroqKey, groqModel, setGroqModel, ragThreshold, setRagThreshold, debugMode, setDebugMode, appleHealth, setAppleHealth, deviceClientId, setDeviceClientId, deviceClientSecret, setDeviceClientSecret };
  
  useEffect(() => loadSettings(s), []);
  return <SettingsForm s={s} onSave={setConfigured} dict={dict} clearChat={clearChat} />;
};


const ChatBubbleTimestamp = ({ timestamp, isUser }: any) => {
  if (!timestamp) return null;
  return (
    <div style={{ fontSize: '0.7rem', color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', textAlign: 'right', marginTop: '0.25rem' }}>
      {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  );
};

const ChatBubbleRetry = ({ isError, onRetry }: any) => {
  if (!isError || !onRetry) return null;
  return (
    <button onClick={onRetry} style={{ position: 'absolute', left: '-35px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)' }} title="Retry">↻</button>
  );
};

const ChatTable = ({ node: _node, ...props }: any) => (
  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', marginBottom: '1rem' }}>
    <table className="markdown-table" {...props} />
  </div>
);

const ChatMarkdown = ({ content }: any) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body" components={{ table: ChatTable }}>
    {content}
  </ReactMarkdown>
);

const ChatBubbleInner = ({ isUser, content, isError, onRetry, timestamp }: any) => (
  <div style={{ display: 'inline-block', padding: '0.85rem', borderRadius: '18px', maxWidth: '85%', background: isUser ? 'var(--accent-color)' : 'var(--panel-bg)', color: isUser ? '#fff' : 'var(--text-primary)', textAlign: 'left' }}>
    <ChatMarkdown content={content} />
    <ChatBubbleTimestamp timestamp={timestamp} isUser={isUser} />
    <ChatBubbleRetry isError={isError} onRetry={onRetry} />
  </div>
);

const ChatBubble = ({ isUser, content, isError, onRetry, timestamp }: { readonly isUser: boolean; readonly content: string; readonly isError?: boolean; readonly onRetry?: (() => void) | undefined; readonly timestamp?: string | undefined }) => (
  <div style={{ marginBottom: '1rem', textAlign: isUser ? 'right' : 'left', position: 'relative' }}>
    <ChatBubbleInner isUser={isUser} content={content} isError={isError} onRetry={onRetry} timestamp={timestamp} />
  </div>
);

const useChatInput = (input: string, setInput: any, send: any, isProcessing: boolean, dict: any) => {
  const submit = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (isProcessing) { alert(dict.coachAnalyzing); return; }
    if (input.trim()) { send(input); setInput(''); }
  };
  const onKey = (e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  const onIn = (e: any) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };
  return { submit, onKey, onIn };
};

const ChatInputStuck = ({ onRetry }: any) => (
  <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center' }}>
    <button onClick={(e) => { e.preventDefault(); onRetry(); }} className="apple-button" style={{ width: '100%', maxWidth: '300px', height: '44px' }}>Retry Message</button>
  </div>
);

const ChatInputActive = ({ input, onIn, onKey, submit, dict, isProcessing }: any) => (
  <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', padding: '1rem', borderTop: '1px solid var(--border-color)', alignItems: 'flex-end' }}>
    <textarea value={input} onChange={onIn} onKeyDown={onKey} className="apple-input" style={{ resize: 'none', minHeight: '44px', height: '44px', overflowY: 'auto', flex: 1, padding: '0.6rem 1rem', fontFamily: 'inherit', lineHeight: '1.4' }} placeholder={dict.messagePlaceholder} rows={1} />
    <button type="submit" className="apple-button" style={{ width: 'auto', height: '44px', opacity: isProcessing ? 0.5 : 1 }}>{dict.send}</button>
  </form>
);

const ChatInput = ({ input, setInput, send, dict, isProcessing, isStuck, onRetry }: any) => {
  const { submit, onKey, onIn } = useChatInput(input, setInput, send, isProcessing, dict);
  return isStuck ? <ChatInputStuck onRetry={onRetry} /> : <ChatInputActive input={input} onIn={onIn} onKey={onKey} submit={submit} dict={dict} isProcessing={isProcessing} />;
};

const useChatScroll = (messages: any[], loadMore: any, hasMore: boolean, isLoadingMore: boolean) => {
  const ref = useRef<HTMLDivElement>(null);
  const lastH = useRef<number>(0);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 20 && hasMore && !isLoadingMore && lastH.current === 0) {
      lastH.current = e.currentTarget.scrollHeight; loadMore();
    }
  };
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = lastH.current > 0 ? ref.current.scrollHeight - lastH.current : ref.current.scrollHeight;
    lastH.current = 0;
  }, [messages]);
  return { ref, onScroll };
};

const renderMessage = (m: Message, state: any, retryMessage: any, lastUser: any) => {
  const isErrorMsg = !!state.error && lastUser && m.id === lastUser.id;
  if (m.role === 'system') {
    return <div key={m.id} style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{getChatText(m)}</div>;
  }
  return <ChatBubble key={m.id} isUser={m.role === 'user'} content={getChatText(m)} isError={isErrorMsg} onRetry={isErrorMsg ? () => retryMessage(m.content) : undefined} timestamp={m.created_at} />;
};

const useIsProcessing = (state: any) => {
  const nonSys = state.messages.filter((m: any) => m.role !== 'system');
  return state.isThinking || (nonSys.length > 0 && nonSys[nonSys.length - 1].role === 'user');
};

const ChatViewMessages = ({ ref, onScroll, hasMore, loadMore, isLoadingMore, state, retryMessage, lastUser, dict }: any) => (
  <div ref={ref} onScroll={onScroll} className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
    {hasMore && <div style={{ textAlign: 'center', marginBottom: '1rem' }}><button onClick={loadMore} disabled={isLoadingMore} className="apple-button" style={{ width: 'auto', fontSize: '0.8rem', padding: '0.4rem 1rem' }}>{isLoadingMore ? dict.loading : dict.loadOlder}</button></div>}
    {state.messages.map((m: any) => renderMessage(m, state, retryMessage, lastUser))}
    {state.isThinking && state.aiStatus !== 'HIDDEN' && <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>{state.aiStatus || dict.coachAnalyzing}</div>}
    {state.error && <div style={{ color: 'var(--error-color, #ff4444)', padding: '1rem', textAlign: 'center' }}>Error: {state.error}</div>}
  </div>
);

const ChatView = ({ state, sendMessage, retryMessage, loadMore, hasMore, isLoadingMore, dict, chatInput, setChatInput }: any) => {
  const { ref, onScroll } = useChatScroll(state.messages, loadMore, hasMore, isLoadingMore);
  const isProcessing = useIsProcessing(state);
  const nonSys = state.messages.filter((m: any) => m.role !== 'system');
  const lastUser = nonSys.length > 0 ? nonSys[nonSys.length - 1] : null;
  const isStuck = !!state.error && lastUser && lastUser.role === 'user';
  const onRetryStuck = () => { if (lastUser) retryMessage(lastUser.content); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ChatViewMessages ref={ref} onScroll={onScroll} hasMore={hasMore} loadMore={loadMore} isLoadingMore={isLoadingMore} state={state} retryMessage={retryMessage} lastUser={lastUser} dict={dict} />
      <ChatInput input={chatInput} setInput={setChatInput} send={sendMessage} dict={dict} isProcessing={isProcessing} isStuck={isStuck} onRetry={onRetryStuck} />
    </div>
  );
};


const ActionMetric = ({ label, value }: any) => (
  <div style={{ marginRight: '1.5rem', marginBottom: '0.5rem' }}>
    <strong style={{ fontSize: '1.25rem' }}>{value}</strong> <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
  </div>
);

const ActionModuleCategory = ({ c }: any) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <h4 style={{ marginBottom: '0.5rem', color: 'var(--accent-color)' }}>{c.name}</h4>
    <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">
        {c.content || '*No content available.*'}
      </ReactMarkdown>
    </div>
  </div>
);

const ActionModuleCard = ({ mod, activeCategoryIdx, setActiveCategoryIdx }: any) => {
  if (!mod.categories || mod.categories.length === 0) return null;
  const categoryOpts = mod.categories.map((c: any, i: number) => ({ label: c.name, value: i }));
  const catIdx = activeCategoryIdx >= mod.categories.length ? 0 : activeCategoryIdx;
  const currentCategory = mod.categories[catIdx];

  return (
    <div className="card" style={{ position: 'relative' }}>
      <div style={{ marginBottom: '1rem' }}>
        <CustomSelect value={catIdx} onChange={(v: any) => setActiveCategoryIdx(Number(v))} options={categoryOpts} />
      </div>
      {currentCategory && <ActionModuleCategory c={currentCategory} />}
    </div>
  );
};

const DashboardDropdown = ({ modules, idx, setIdx }: any) => {
  const opts = modules.map((m: any, i: number) => ({ label: m.module_title, value: i }));
  return (
    <div style={{ marginBottom: '1rem' }}>
      <CustomSelect value={idx} onChange={(v: any) => setIdx(Number(v))} options={opts} />
    </div>
  );
};

const DashboardHeader = ({ mod, dict, onDelete }: any) => (
  <div style={{ position: 'relative' }}>
    <button onClick={() => onDelete(mod.module_title)} style={{ position: 'absolute', top: '0', right: '0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
    <h1 style={{ fontSize: '2rem', marginBottom: '1rem', paddingRight: '2.5rem' }}>{mod.module_title}</h1>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>{dict.diagnostic || "Description"}</h3>
      <div style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}><ReactMarkdown remarkPlugins={[remarkGfm]} className="markdown-body">{mod.description}</ReactMarkdown></div>
      {mod.key_metrics?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '1rem' }}>{mod.key_metrics.map((m: any, i: number) => <ActionMetric key={i} label={m.label} value={m.value} />)}</div>
      )}
    </div>
  </div>
);

const CronModal = ({ title, schedule, text, close }: any) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={close}>
    <div className="card" style={{ width: '100%', maxWidth: '400px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
      <h3 style={{ marginBottom: '0.25rem', color: 'var(--accent-color)' }}>{title}</h3>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{schedule}</div>
      <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-line', userSelect: 'text' }}>{text || 'No description provided.'}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
        <button onClick={(e) => { e.preventDefault(); close(); }} type="button" className="apple-button" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>Close</button>
      </div>
    </div>
  </div>
);

const CronCard = ({ cron, onDelete, onToggle, onClick }: { readonly cron: Cron, readonly onDelete: (id: string, title: string) => void, readonly onToggle: (id: string, active: boolean) => void, readonly onClick: () => void }) => (
  <div onClick={onClick} style={{ background: 'var(--panel-bg)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', opacity: cron.is_active ? 1 : 0.5, cursor: 'pointer' }}>
    <div>
      <div style={{ fontWeight: 'bold' }}>{cron.title}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{cron.schedule}</div>
    </div>
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <button onClick={(e) => { e.stopPropagation(); onDelete(cron.cron_id, cron.title); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
      <button onClick={(e) => { e.stopPropagation(); onToggle(cron.cron_id, !cron.is_active); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>{cron.is_active ? '🔔' : '🔕'}</button>
    </div>
  </div>
);

const useActiveRoutinesState = (crons: any) => {
  const [selectedCron, setSelectedCron] = useState<Cron | null>(null);
  const [deleting, setDeleting] = useState<{id: string, title: string} | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const categories = crons && crons.length > 0 ? ['All', ...Array.from(new Set(crons.map((c: Cron) => c.category || 'Custom')))] : [];
  const filteredCrons = filter === 'All' ? crons : (crons || []).filter((c: Cron) => (c.category || 'Custom') === filter);
  return { selectedCron, setSelectedCron, deleting, setDeleting, filter, setFilter, categories, filteredCrons };
};

const ActiveRoutinesCategories = ({ categories, filter, setFilter }: any) => (
  <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
    {categories.map((cat: any) => (
      <button key={cat} onClick={() => setFilter(cat)} style={{ background: filter === cat ? 'var(--accent-color)' : 'var(--panel-bg)', color: filter === cat ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '16px', padding: '0.4rem 1rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
        {cat}
      </button>
    ))}
  </div>
);

const ActiveRoutinesModals = ({ selectedCron, setSelectedCron, deleting, dict, onDelete, setDeleting }: any) => (
  <>
    {selectedCron && <CronModal title={selectedCron.title} schedule={selectedCron.schedule} text={selectedCron.description} close={() => setSelectedCron(null)} />}
    {deleting && <ConfirmModal title={dict.confirmDelete} text={`${dict.deleteCronText}: "${deleting.title}"?`} onConfirm={() => { onDelete(deleting.id); setDeleting(null); }} onCancel={() => setDeleting(null)} dict={dict} />}
  </>
);

const ActiveRoutines = ({ crons, dict, onDelete, onToggle }: any) => {
  const { selectedCron, setSelectedCron, deleting, setDeleting, filter, setFilter, categories, filteredCrons } = useActiveRoutinesState(crons);
  if (!crons || crons.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>{dict.routines}</h3>
      <ActiveRoutinesCategories categories={categories} filter={filter} setFilter={setFilter} />
      {filteredCrons.map((c: Cron, i: number) => <CronCard key={i} cron={c} onDelete={(id, title) => setDeleting({id, title})} onToggle={onToggle} onClick={() => setSelectedCron(c)} />)}
      <ActiveRoutinesModals selectedCron={selectedCron} setSelectedCron={setSelectedCron} deleting={deleting} dict={dict} onDelete={onDelete} setDeleting={setDeleting} />
    </div>
  );
};

const useDashboardState = (crons: any, deleteModule: any) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeCategoryIdx, setActiveCategoryIdx] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingTiedCrons, setDeletingTiedCrons] = useState<Cron[] | null>(null);
  const handleModuleDeleteConfirm = () => {
    deleteModule(deleting);
    const tied = (crons || []).filter((c: Cron) => c.linked_module == deleting);
    if (tied.length > 0) setDeletingTiedCrons(tied);
    setDeleting(null);
  };
  useEffect(() => { setActiveCategoryIdx(0); }, [activeIdx]);
  return { activeIdx, setActiveIdx, activeCategoryIdx, setActiveCategoryIdx, deleting, setDeleting, deletingTiedCrons, setDeletingTiedCrons, handleModuleDeleteConfirm };
};

const DashboardModals = ({ dict, deleting, handleModuleDeleteConfirm, setDeleting, deletingTiedCrons, deleteCron, setDeletingTiedCrons }: any) => (
  <>
    {deleting && <ConfirmModal title={dict.confirmDelete} text={dict.deleteModuleText} onConfirm={handleModuleDeleteConfirm} onCancel={() => setDeleting(null)} dict={dict} />}
    {deletingTiedCrons && (
      <ConfirmModal title={dict.confirmDelete} text={dict.deleteTiedCronsText} onConfirm={() => { deletingTiedCrons.forEach((c: Cron) => deleteCron(c.cron_id)); setDeletingTiedCrons(null); }} onCancel={() => setDeletingTiedCrons(null)} dict={{ ...dict, confirm: dict.deleteCrons, cancel: dict.keepCrons }} />
    )}
  </>
);

const DashboardView = ({ dict, modules, deleteModule, crons, deleteCron }: any) => {
  const { activeIdx, setActiveIdx, activeCategoryIdx, setActiveCategoryIdx, deleting, setDeleting, deletingTiedCrons, setDeletingTiedCrons, handleModuleDeleteConfirm } = useDashboardState(crons, deleteModule);
  if (!modules?.length) return null;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
      <DashboardDropdown modules={modules} idx={activeIdx >= modules.length ? 0 : activeIdx} setIdx={setActiveIdx} />
      {modules[activeIdx >= modules.length ? 0 : activeIdx] && (
        <><DashboardHeader mod={modules[activeIdx >= modules.length ? 0 : activeIdx]} dict={dict} onDelete={(t: string) => setDeleting(t)} /><ActionModuleCard mod={modules[activeIdx >= modules.length ? 0 : activeIdx]} activeCategoryIdx={activeCategoryIdx} setActiveCategoryIdx={setActiveCategoryIdx} /></>
      )}
      <DashboardModals dict={dict} deleting={deleting} handleModuleDeleteConfirm={handleModuleDeleteConfirm} setDeleting={setDeleting} deletingTiedCrons={deletingTiedCrons} deleteCron={deleteCron} setDeletingTiedCrons={setDeletingTiedCrons} />
    </div>
  );
};

const RoutinesView = ({ crons, dict, deleteCron, toggleCron }: any) => {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
      <ActiveRoutines crons={crons} dict={dict} onDelete={deleteCron} onToggle={toggleCron} />
    </div>
  );
};


const BottomNav = ({ tab, setTab, dict, hasPlans, hasRoutines, debugMode }: any) => (
  <div className="bottom-nav">
    {hasPlans && <div className={`nav-item ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>{dict.planTab}</div>}
    {hasRoutines && <div className={`nav-item ${tab === 'routines' ? 'active' : ''}`} onClick={() => setTab('routines')}>{dict.routineTab}</div>}
    <div className={`nav-item ${tab === 'coach' ? 'active' : ''}`} onClick={() => setTab('coach')}>{dict.coachTab}</div>
    {debugMode && <div className={`nav-item ${tab === 'debug' ? 'active' : ''}`} onClick={() => setTab('debug')}>{dict.debugTab}</div>}
    <div className={`nav-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>{dict.settingsTab}</div>
  </div>
);

const LangToggle = ({ lang, setLang }: { readonly lang: 'en'|'cs', readonly setLang: (l: 'en'|'cs') => void }) => (
  <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
    <button onClick={() => { setLang('en'); localStorage.setItem('LANG', 'en'); }} style={{ background: lang === 'en' ? 'var(--accent-color)' : 'var(--panel-bg)', color: lang === 'en' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>EN</button>
    <button onClick={() => { setLang('cs'); localStorage.setItem('LANG', 'cs'); }} style={{ background: lang === 'cs' ? 'var(--accent-color)' : 'var(--panel-bg)', color: lang === 'cs' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>CS</button>
  </div>
);

const tryCapacitorCopy = async (text: string) => {
  if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
    await Clipboard.write({ string: text });
    return true;
  }
  return false;
};

const tryNavigatorCopy = async (text: string) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
};

const fallbackCopy = (text: string) => {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  // eslint-disable-next-line
  document.execCommand('copy');
  document.body.removeChild(el);
};

const safeCopy = async (text: string) => {
  try { if (await tryCapacitorCopy(text)) return; } catch (e) { console.warn('Capacitor fail', e); }
  try { if (await tryNavigatorCopy(text)) return; } catch (e) { console.warn('Navigator fail', e); }
  try { fallbackCopy(text); } catch (e) { console.error('Fallback fail', e); }
};

const useCopy = (payload: any) => {
  const [copied, setCopied] = useState(false);
  const [iconActive, setIconActive] = useState(false);
  const handleCopy = async () => {
    await safeCopy(JSON.stringify(payload, null, 2));
    setCopied(true); setIconActive(true);
    setTimeout(() => setIconActive(false), 200);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, iconActive, handleCopy };
};

const TracePayloadHeader = ({ title, copied, iconActive, wrap, setWrap, handleCopy }: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
    <strong style={{ display: 'block' }}>{title}</strong>
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
      {copied && <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>Copied!</span>}
      <button title="Copy to Clipboard" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: iconActive ? 'var(--accent-color)' : 'var(--text-secondary)', transition: 'color 0.2s' }} onClick={handleCopy}><CopyIcon /></button>
      <button title="Toggle Word Wrap" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: wrap ? 'var(--accent-color)' : 'var(--text-secondary)' }} onClick={() => setWrap(!wrap)}><WrapIcon /></button>
    </div>
  </div>
);

const TracePayload = ({ title, payload, wrap, setWrap }: any) => {
  const { copied, iconActive, handleCopy } = useCopy(payload);
  return (
    <div style={{ marginBottom: '1rem' }}>
      <TracePayloadHeader title={title} copied={copied} iconActive={iconActive} wrap={wrap} setWrap={setWrap} handleCopy={handleCopy} />
      <pre style={{ background: '#111', padding: '1rem', borderRadius: '8px', overflowX: 'auto', fontSize: '0.8rem', color: '#fff', whiteSpace: wrap ? 'pre-wrap' : 'pre', wordBreak: wrap ? 'break-word' : 'normal' }}>{JSON.stringify(payload, null, 2)}</pre>
    </div>
  );
};

const TraceDetailsInfo = ({ selectedTrace }: any) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
    <div><strong>ID:</strong> {selectedTrace.id}</div>
    <div><strong>Time:</strong> {new Date(selectedTrace.created_at).toLocaleString()}</div>
    <div><strong>Model:</strong> {selectedTrace.model}</div>
    <div><strong>Latency:</strong> {selectedTrace.latency_ms} ms</div>
    {!selectedTrace.model?.startsWith('RAG') && <div><strong>Tokens (In/Out/Total):</strong> {selectedTrace.prompt_tokens} / {selectedTrace.completion_tokens} / {selectedTrace.total_tokens}</div>}
  </div>
);

const useCopyAll = (t: any) => {
  const [copied, setCopied] = useState(false);
  const [iconActive, setIconActive] = useState(false);
  const handleCopyAll = async () => {
    const toks = t.model?.startsWith('RAG') ? '' : `Tokens (In/Out/Total): ${t.prompt_tokens} / ${t.completion_tokens} / ${t.total_tokens}\n`;
    const text = `Trace Details\nID: ${t.id}\nTime: ${new Date(t.created_at).toLocaleString()}\nModel: ${t.model}\nLatency: ${t.latency_ms} ms\n${toks}\nInput Payload\n\n${JSON.stringify(t.payload_input, null, 2)}\n\nOutput Payload\n\n${JSON.stringify(t.payload_output, null, 2)}`;
    await safeCopy(text);
    setCopied(true); setIconActive(true);
    setTimeout(() => setIconActive(false), 200); setTimeout(() => setCopied(false), 2000);
  };
  return { copied, iconActive, handleCopyAll };
};

const TraceDetailsHeader = ({ selectedTrace }: any) => {
  const { copied, iconActive, handleCopyAll } = useCopyAll(selectedTrace);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
      <h3 style={{ color: 'var(--accent-color)', margin: 0 }}>Trace Details</h3>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        {copied && <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)' }}>Copied!</span>}
        <button title="Copy All" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: iconActive ? 'var(--accent-color)' : 'var(--text-secondary)' }} onClick={handleCopyAll}><CopyIcon /></button>
      </div>
    </div>
  );
};

const TraceDetails = ({ selectedTrace, setSelectedTrace }: any) => {
  const [wrapInput, setWrapInput] = useState(false);
  const [wrapOutput, setWrapOutput] = useState(false);
  return (
    <div>
      <button className="apple-button" style={{ width: 'auto', marginBottom: '1rem', background: 'var(--panel-bg)', color: 'var(--text-primary)' }} onClick={() => setSelectedTrace(null)}>← Back</button>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <TraceDetailsHeader selectedTrace={selectedTrace} />
        <TraceDetailsInfo selectedTrace={selectedTrace} />
        <TracePayload title="Input Payload" payload={selectedTrace.payload_input} wrap={wrapInput} setWrap={setWrapInput} />
        <TracePayload title="Output Payload" payload={selectedTrace.payload_output} wrap={wrapOutput} setWrap={setWrapOutput} />
      </div>
    </div>
  );
};

const ChatMessageItem = ({ t }: any) => {
  const isUser = t.role === 'user';
  const parsedMessage = getChatText({ role: t.role, content: t.message } as any);
  const textStr = typeof parsedMessage === 'string' ? parsedMessage : JSON.stringify(parsedMessage || '');
  let snippet = textStr ? textStr.substring(0, 120) : '';
  if (textStr && textStr.length > 120) snippet += '...';
  return (
    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: isUser ? '4px solid var(--accent-color)' : '4px solid var(--primary-color)', background: 'rgba(30, 30, 40, 0.3)' }}>
      <div>
        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: isUser ? 'var(--accent-color)' : 'var(--primary-color)' }}>{isUser ? '👤 User Message' : '💬 Assistant Message'} - {new Date(t.created_at).toLocaleString()}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{snippet}</div>
      </div>
    </div>
  );
};

const getTraceStyles = (isError: boolean, isRag: boolean) => {
  if (isError) return { border: '4px solid #ff4444', bg: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', title: '❌ Error' };
  if (isRag) return { border: '4px solid var(--primary-color)', bg: 'rgba(30, 30, 40, 0.5)', color: 'var(--primary-color)', title: '🔍 RAG Query' };
  return { border: 'none', bg: undefined, color: 'var(--text-primary)', title: '🤖 LLM Turn' };
};

const TraceLLMItem = ({ t, setSelectedTrace, isRag }: any) => {
  const isError = t.model?.startsWith('error');
  const s = getTraceStyles(isError, isRag);
  const tokenStr = isError || isRag ? '' : ` • ${t.total_tokens} tokens`;

  return (
    <div className="card" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: s.border, background: s.bg }} onClick={() => setSelectedTrace(t)}>
      <div>
        <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: s.color }}>{s.title} - {new Date(t.created_at).toLocaleString()}</div>
        <div style={{ fontSize: '0.85rem', color: isError ? '#ff4444' : 'var(--text-secondary)' }}>{t.model} • {t.latency_ms}ms{tokenStr}</div>
      </div>
      <div style={{ color: isError ? '#ff4444' : 'var(--accent-color)' }}>View →</div>
    </div>
  );
};

const TraceListItem = ({ t, setSelectedTrace, isRag }: any) => {
  if (t.type === 'chat_message') return <ChatMessageItem t={t} />;
  return <TraceLLMItem t={t} setSelectedTrace={setSelectedTrace} isRag={isRag} />;
};

const TraceList = ({ traces, isLoading, setSelectedTrace }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    {traces.length === 0 && !isLoading && <div style={{ color: 'var(--text-secondary)' }}>No traces found.</div>}
    {traces.map((t: any) => <TraceListItem key={t.id} t={t} setSelectedTrace={setSelectedTrace} isRag={t.model?.startsWith('RAG')} />)}
  </div>
);

const QueueModalContent = ({ queue, isLoading, error }: any) => (
  <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem', background: 'var(--bg-color)', padding: '1rem', borderRadius: '8px' }}>
    {isLoading && <div style={{ color: 'var(--text-secondary)' }}>Loading queue...</div>}
    {error && <div style={{ color: 'var(--error-color, #ff4444)' }}>{error}</div>}
    {!isLoading && !error && queue.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>The question queue is currently empty.</div>}
    {!isLoading && !error && queue.length > 0 && (
      <ol style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-primary)' }}>
        {queue.map((q: string, i: number) => <li key={i} style={{ marginBottom: '0.5rem', lineHeight: 1.4 }}>{q}</li>)}
      </ol>
    )}
  </div>
);

const QueueModal = ({ queue, isLoading, error, onClose }: any) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
    <div className="card" style={{ width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>Question Queue</h3>
      <QueueModalContent queue={queue} isLoading={isLoading} error={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={(e) => { e.preventDefault(); onClose(); }} type="button" className="apple-button" style={{ width: 'auto', padding: '0.5rem 1.5rem' }}>Close</button>
      </div>
    </div>
  </div>
);

const DebugViewHeader = ({ fetchTraces, isLoading, onShowQueue }: any) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
    <h2 style={{ margin: 0 }}>LLM Traces</h2>
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button className="apple-button secondary" style={{ width: 'auto', padding: '0.5rem 1rem', background: 'var(--panel-bg)', color: 'var(--text-primary)' }} onClick={onShowQueue}>
        Questions
      </button>
      <button className="apple-button" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={() => fetchTraces()} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Refresh'}
      </button>
    </div>
  </div>
);

const DebugView = () => {
  const { traces, isLoading, error, fetchTraces, queueItems, isQueueLoading, queueError, fetchQueue } = useDebug();
  const [selectedTrace, setSelectedTrace] = useState<LlmTrace | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  useEffect(() => { fetchTraces(); }, [fetchTraces]);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', background: 'var(--bg-color)' }}>
      {showQueue && <QueueModal queue={queueItems} isLoading={isQueueLoading} error={queueError} onClose={() => setShowQueue(false)} />}
      <DebugViewHeader fetchTraces={fetchTraces} isLoading={isLoading} onShowQueue={() => { setShowQueue(true); fetchQueue(); }} />
      {error && <div style={{ color: 'var(--error-color, #ff4444)', marginBottom: '1rem' }}>{error}</div>}
      {selectedTrace ? <TraceDetails selectedTrace={selectedTrace} setSelectedTrace={setSelectedTrace} /> : <TraceList traces={traces} isLoading={isLoading} setSelectedTrace={setSelectedTrace} />}
    </div>
  );
};

const AppTabs = ({ configured, tab, setTab, state, sendMessage, retryMessage, loadMore, hasMore, isLoadingMore, setConfigured, dict, crons, deleteCron, toggleCron, modules, deleteModule, clearChat, chatInput, setChatInput }: any) => (
  <div style={{ paddingTop: '3rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {!configured && tab !== 'settings' && <div style={{ padding: '2rem', flex: 1 }}>{dict.configureEcosystem}</div>}
    {configured && tab === 'plan' && <DashboardView messages={state.messages} dict={dict} modules={modules} deleteModule={deleteModule} crons={crons} deleteCron={deleteCron} />}
    {configured && tab === 'routines' && <RoutinesView crons={crons} dict={dict} deleteCron={deleteCron} toggleCron={toggleCron} />}
    {configured && tab === 'coach' && <ChatView state={state} sendMessage={sendMessage} retryMessage={retryMessage} loadMore={loadMore} hasMore={hasMore} isLoadingMore={isLoadingMore} dict={dict} chatInput={chatInput} setChatInput={setChatInput} />}
    {configured && tab === 'debug' && <DebugView />}
    {tab === 'settings' && <SettingsView setConfigured={() => { setConfigured(true); setTab('coach'); }} dict={dict} clearChat={clearChat} />}
  </div>
);

const applyRemoteConfig = async () => {
  try {
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const res = await fetch(`${url}/config/sync`);
    if (!res.ok) return;
    const { config } = await res.json();
    if (!config?.GROQ_KEY) return;
    localStorage.setItem('GROQ_KEY', config.GROQ_KEY);
    if (config.GROQ_MODEL) localStorage.setItem('GROQ_MODEL', config.GROQ_MODEL);
    if (config.GARMIN_CLIENT_ID) localStorage.setItem('GARMIN_CLIENT_ID', config.GARMIN_CLIENT_ID);
    if (config.GARMIN_CLIENT_SECRET) localStorage.setItem('GARMIN_CLIENT_SECRET', config.GARMIN_CLIENT_SECRET);
  } catch (_e) {
    console.error('Failed to fetch config', _e);
  }
};

const initAppConfig = (setConfigured: any, setTab: any, setLang: any) => {
  const isReady = checkConfig();
  setConfigured(isReady);
  setTab(isReady ? 'coach' : 'settings');
  const storedLang = localStorage.getItem('LANG') as 'en'|'cs';
  if (storedLang === 'en' || storedLang === 'cs') setLang(storedLang);

  applyRemoteConfig().then(() => {
    setConfigured(checkConfig());
  });
};

const useAppInit = () => {
  const [tab, setTab] = useState('settings');
  const [configured, setConfigured] = useState(false);
  const [lang, setLang] = useState<'en'|'cs'>('en');
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    initAppConfig(setConfigured, setTab, setLang);
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);
  
  return { tab, setTab, configured, setConfigured, lang, setLang, showSplash };
};




const AppSplashScreen = () => (
  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, backgroundColor: '#000' }}>
    <img src="/splash-native.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Splash" />
  </div>
);

const BiometricsField = ({ label, type, val, setVal }: any) => {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input 
        type={type} 
        className={type === 'range' ? 'biometrics-slider' : 'apple-input'} 
        value={val} 
        onChange={(e) => setVal(e.target.value)} 
      />
    </div>
  );
};

const useBiometricsFormState = () => {
  const [biometricsData, setBiometricsData] = useState<Record<string, string>>({});
  
  const updateField = (key: string, value: string) => {
    setBiometricsData((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  return { biometricsData, updateField };
};

const parseBiometricsNumber = (value?: string) => {
  if (!value) {
    return null;
  }
  return parseInt(value, 10);
};

const parseBiometricsFloat = (value?: string) => {
  if (!value) {
    return null;
  }
  return parseFloat(value);
};

const calculateSleepSeconds = (hours?: string, minutes?: string) => {
  const h = hours ? parseInt(hours, 10) * 3600 : 0;
  const m = minutes ? parseInt(minutes, 10) * 60 : 0;
  const total = h + m;
  if (total === 0) {
    return null;
  }
  return total;
};

const buildBiometricsPayload = (data: Record<string, string>) => {
  return {
    steps: parseBiometricsNumber(data.steps),
    resting_hr: parseBiometricsNumber(data.hr),
    hrv_rmssd: parseBiometricsFloat(data.hrv),
    stress_score: parseBiometricsNumber(data.str),
    body_battery: parseBiometricsNumber(data.bb),
    sleep_score: parseBiometricsNumber(data.ss),
    sleep_duration_seconds: calculateSleepSeconds(data.sh, data.sm),
    spo2: parseBiometricsFloat(data.sp),
    respiration_rate: parseBiometricsFloat(data.rr),
    active_calories: parseBiometricsNumber(data.cal)
  };
};

const BiometricsFormSection1 = ({ data, updateField, dict }: any) => {
  return (
    <>
      <BiometricsField label={dict.steps} type="number" val={data.steps || ''} setVal={(v: string) => updateField('steps', v)} />
      <BiometricsField label={dict.restingHr} type="number" val={data.hr || ''} setVal={(v: string) => updateField('hr', v)} />
      <BiometricsField label={dict.hrv} type="number" val={data.hrv || ''} setVal={(v: string) => updateField('hrv', v)} />
      <BiometricsField label={dict.stressScore} type="number" val={data.str || ''} setVal={(v: string) => updateField('str', v)} />
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {dict.stressToHrvHint}
      </div>
    </>
  );
};

const BiometricsFormSection2 = ({ data, updateField, dict }: any) => {
  return (
    <>
      <BiometricsField label={dict.bodyBattery} type="number" val={data.bb || ''} setVal={(v: string) => updateField('bb', v)} />
      <div className="form-group">
        <label>{dict.sleepDuration}</label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input type="number" className="apple-input" value={data.sh || ''} onChange={(e) => updateField('sh', e.target.value)} placeholder={dict.hours} />
          <input type="number" className="apple-input" value={data.sm || ''} onChange={(e) => updateField('sm', e.target.value)} placeholder={dict.minutes} />
        </div>
      </div>
      <BiometricsField label={dict.sleepScore} type="number" val={data.ss || ''} setVal={(v: string) => updateField('ss', v)} />
    </>
  );
};

const BiometricsFormSection3 = ({ data, updateField, dict }: any) => {
  return (
    <>
      <BiometricsField label={dict.spo2} type="number" val={data.sp || ''} setVal={(v: string) => updateField('sp', v)} />
      <BiometricsField label={dict.respirationRate} type="number" val={data.rr || ''} setVal={(v: string) => updateField('rr', v)} />
      <BiometricsField label={dict.activeCalories} type="number" val={data.cal || ''} setVal={(v: string) => updateField('cal', v)} />
    </>
  );
};

const BiometricsFormActions = ({ submit, onClose, dict }: any) => (
  <>
    <button className="apple-button" onClick={submit} style={{ marginTop: '1rem' }}>{dict.saveLog}</button>
    <button className="apple-button" onClick={onClose} style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>{dict.cancel}</button>
  </>
);

const BiometricsLogForm = ({ dict, onSubmit, onClose }: any) => {
  const { biometricsData, updateField } = useBiometricsFormState();
  const submit = () => onSubmit(buildBiometricsPayload(biometricsData));
  
  return (
    <div className="biometrics-form-container" style={{ paddingTop: '4rem' }}>
      <h2>{dict.logBiometricsData}</h2>
      <BiometricsFormSection1 data={biometricsData} updateField={updateField} dict={dict} />
      <BiometricsFormSection2 data={biometricsData} updateField={updateField} dict={dict} />
      <BiometricsFormSection3 data={biometricsData} updateField={updateField} dict={dict} />
      <BiometricsFormActions submit={submit} onClose={onClose} dict={dict} />
    </div>
  );
};

const BiometricsLogView = ({ dict, onClose }: any) => {
  const { submitLog } = useBiometricsLog('usr_1');
  const onSubmit = async (data: any) => {
    const ok = await submitLog(data);
    if (ok) onClose();
  };
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-color)', zIndex: 3000, overflowY: 'auto' }}>
      <BiometricsLogForm dict={dict} onSubmit={onSubmit} onClose={onClose} />
    </div>
  );
};

const isCronPending = (c: any, logs: any[], hiddenCrons: Record<string, boolean>) => {
  if (hiddenCrons[c.cron_id]) return false;
  try {
    if (!c.schedule) return true;
    const interval = (parser as any).parseExpression(c.schedule);
    const lastExpected = interval.prev().toDate();
    const recentLog = (logs || []).find((l: any) => l.cron_id === c.cron_id);
    if (!recentLog || !recentLog.logged_at) return true;
    return new Date(recentLog.logged_at) < lastExpected;
  } catch (_e) { return true; }
};

const getLoggableCrons = (crons: any[], logs: any[], hiddenCrons: Record<string, boolean>) => {
  return (crons || []).filter((c: any) => c.is_active && c.requires_logging && isCronPending(c, logs, hiddenCrons));
};

const getGroupedCrons = (loggableCrons: any[]) => {
  return loggableCrons.reduce((acc: Record<string, any[]>, c: any) => {
    const cat = c.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {} as Record<string, any[]>);
};

const buildActivityPayload = (c: any, data: any) => {
  const value = data[c.cron_id];
  let payload: ActivityLog = { cron_id: c.cron_id, activity_title: c.title, log_type: c.log_type };
  if (c.log_type === 'boolean') {
    payload.boolean_value = true;
  } else if (c.log_type === 'number') {
    if (!value) return null;
    payload.number_value = parseFloat(value as string) || 0;
  } else {
    if (!value) return null;
    payload.text_value = (value as string) || '';
  }
  return payload;
};

const useActivityHandlers = (data: any, setData: any, hiddenCrons: any, setHiddenCrons: any, isSubmitting: boolean, submitLog: any) => {
  const handleLog = async (c: any) => {
    if (isSubmitting) return;
    const payload = buildActivityPayload(c, data);
    if (!payload || !(await submitLog(payload))) return;
    setData({ ...data, [c.cron_id]: '' });
    setHiddenCrons({ ...hiddenCrons, [c.cron_id]: true });
  };
  const handleDismiss = async (c: any) => {
    if (isSubmitting) return;
    if (await submitLog({ cron_id: c.cron_id, activity_title: c.title, log_type: c.log_type, text_value: 'skipped' })) setHiddenCrons({ ...hiddenCrons, [c.cron_id]: true });
  };
  return { handleLog, handleDismiss };
};

const useActivitiesState = (crons: any) => {
  const { logs, isSubmitting, submitLog } = useActivities('usr_1');
  const [data, setData] = useState<Record<string, string | boolean>>({});
  const [hiddenCrons, setHiddenCrons] = useState<Record<string, boolean>>({});

  const loggableCrons = getLoggableCrons(crons, logs, hiddenCrons);
  const groupedCrons = getGroupedCrons(loggableCrons);
  const { handleLog, handleDismiss } = useActivityHandlers(data, setData, hiddenCrons, setHiddenCrons, isSubmitting, submitLog);

  return { data, setData, isSubmitting, handleLog, handleDismiss, loggableCrons, groupedCrons };
};

const ActivityItemActions = ({ c, data, setData, isBoolean, isSubmitting, canLog, handleLog, handleDismiss }: any) => (
  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
    {!isBoolean && (
      <input type={c.log_type === 'number' ? 'number' : 'text'} className="apple-input" placeholder={c.log_unit || ''} value={(data[c.cron_id] as string) || ''} onChange={(e) => setData({ ...data, [c.cron_id]: e.target.value })} style={{ width: '80px', padding: '0.5rem 0.75rem', fontSize: '0.9rem', textAlign: 'center' }} />
    )}
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <button onClick={() => handleLog(c)} disabled={isSubmitting || !canLog} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: canLog ? 'var(--accent-color)' : 'var(--border-color)', color: canLog ? '#fff' : 'var(--text-secondary)', cursor: canLog ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>✓</button>
      <button onClick={() => handleDismiss(c)} disabled={isSubmitting} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: 'rgba(255, 59, 48, 0.1)', color: '#ff3b30', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>✕</button>
    </div>
  </div>
);

const ActivityItem = ({ c, data, setData, isSubmitting, handleLog, handleDismiss }: any) => {
  const hasValue = !!data[c.cron_id];
  const isBoolean = c.log_type === 'boolean';
  const canLog = isBoolean || hasValue;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
      <div style={{ flex: 1, marginRight: '1rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem', fontSize: '0.95rem' }}>{c.title}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>{c.description}</div>
      </div>
      <ActivityItemActions c={c} data={data} setData={setData} isBoolean={isBoolean} isSubmitting={isSubmitting} canLog={canLog} handleLog={handleLog} handleDismiss={handleDismiss} />
    </div>
  );
};

const ActivityCategory = ({ cat, crons, data, setData, isSubmitting, handleLog, handleDismiss }: any) => (
  <div>
    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{cat}</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {crons.map((c: any) => <ActivityItem key={c.cron_id} c={c} data={data} setData={setData} isSubmitting={isSubmitting} handleLog={handleLog} handleDismiss={handleDismiss} />)}
    </div>
  </div>
);

const ActivitiesList = ({ groupedCrons, data, setData, isSubmitting, handleLog, handleDismiss }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1.5rem' }}>
    {Object.entries(groupedCrons).map(([cat, cronsList]) => <ActivityCategory key={cat} cat={cat} crons={cronsList} data={data} setData={setData} isSubmitting={isSubmitting} handleLog={handleLog} handleDismiss={handleDismiss} />)}
  </div>
);

const ActivitiesView = ({ dict, crons, onClose }: any) => {
  const { data, setData, isSubmitting, handleLog, handleDismiss, loggableCrons, groupedCrons } = useActivitiesState(crons);
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-color)', zIndex: 3000, overflowY: 'auto' }}>
      <div className="biometrics-form-container" style={{ paddingTop: '4rem', maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <h2>{dict.logActivities}</h2>
        {loggableCrons.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No routines require logging.</p> : <ActivitiesList groupedCrons={groupedCrons} data={data} setData={setData} isSubmitting={isSubmitting} handleLog={handleLog} handleDismiss={handleDismiss} />}
        <button className="apple-button" onClick={onClose} style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)', marginTop: '2rem' }}>{dict.cancel || 'Close'}</button>
      </div>
    </div>
  );
};

const RoutineDetailModal = ({ cron, onClose }: any) => {
  if (!cron) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-color)', zIndex: 3000, overflowY: 'auto' }}>
      <div className="biometrics-form-container" style={{ paddingTop: '4rem', maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--accent-color)' }}>{cron.title}</h2>
        <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '12px' }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{cron.description || 'No additional details provided.'}</p>
        </div>
        <button className="apple-button" onClick={onClose} style={{ marginTop: '2rem' }}>Close</button>
      </div>
    </div>
  );
};

const getLogValue = (l: any) => {
  if (l.log_type === 'boolean') return l.boolean_value ? 'Yes' : 'No';
  if (l.log_type === 'number') return l.number_value;
  return l.text_value;
};

const ReportsList = ({ logs }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
    {logs.map((l: any, i: number) => (
      <div key={i} className="card" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 'bold' }}>{l.activity_title}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{new Date(l.logged_at).toLocaleString()}</div>
        <div style={{ marginTop: '0.5rem', fontSize: '1.1rem', color: 'var(--accent-color)' }}>
          {getLogValue(l)}
        </div>
      </div>
    ))}
  </div>
);

const ReportsView = ({ dict, onClose }: any) => {
  const { logs } = useActivities('usr_1');
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-color)', zIndex: 3000, overflowY: 'auto' }}>
      <div className="biometrics-form-container" style={{ paddingTop: '4rem', maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
        <h2>{dict.activityReports}</h2>
        {(!logs || logs.length === 0) ? <p style={{ color: 'var(--text-secondary)' }}>{dict.noLogs}</p> : <ReportsList logs={logs} />}
        <button className="apple-button" onClick={onClose} style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)', marginTop: '2rem' }}>{dict.cancel}</button>
      </div>
    </div>
  );
};

const SideMenu = ({ isOpen, setOpen, dict, onOpenBiometrics, onOpenActivities, onOpenReports }: any) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="side-menu-overlay" onClick={() => setOpen(false)} />
      <div className="side-menu-panel">
        <div style={{ padding: '4rem 1.5rem', fontWeight: 600, fontSize: '1.2rem', borderBottom: '1px solid var(--border-color)' }}>{dict.menu}</div>
        <div onClick={() => { setOpen(false); onOpenActivities(); }} style={{ padding: '1.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>{dict.logActivities}</div>
        <div onClick={() => { setOpen(false); onOpenBiometrics(); }} style={{ padding: '1.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>{dict.logBiometricsData}</div>
        <div onClick={() => { setOpen(false); onOpenReports(); }} style={{ padding: '1.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>{dict.activityReports}</div>
      </div>
    </>
  );
};

const useAppTabsRedirect = (hasPlans: boolean, hasRoutines: boolean, debugMode: boolean, tab: string, setTab: any) => {
  useEffect(() => {
    if (tab === 'plan' && !hasPlans) setTab('coach');
    if (tab === 'routines' && !hasRoutines) setTab('coach');
    if (tab === 'debug' && !debugMode) setTab('coach');
  }, [hasPlans, hasRoutines, debugMode, tab, setTab]);
};

const useAppContentState = () => {
  const init = useAppInit();
  const chat = useChat('usr_1', init.lang, init.configured);
  const cronsState = useCrons(init.configured, init.tab, chat.state.messages.length);
  const modsState = useModules(init.configured, init.tab, chat.state.messages.length);
  const [menu, setMenu] = useState({ open: false, biometrics: false, activities: false, reports: false });
  const [detailCronId, setDetailCronId] = useState<string | null>(null);
  const hasPlans = modsState.modules && modsState.modules.length > 0;
  const hasRoutines = cronsState.crons && cronsState.crons.length > 0;
  const debugModeStr = typeof window === 'undefined' ? null : localStorage.getItem('DEBUG_MODE');
  const debugMode = debugModeStr !== 'false';
  useAppTabsRedirect(hasPlans, hasRoutines, debugMode, init.tab, init.setTab);
  return { init, chat, cronsState, modsState, menu, setMenu, detailCronId, setDetailCronId, hasPlans, hasRoutines, debugMode };
};

const AppContentModals = ({ s, dict }: any) => (
  <>
    {s.menu.biometrics && <BiometricsLogView dict={dict} onClose={() => s.setMenu({ ...s.menu, biometrics: false })} />}
    {s.menu.activities && <ActivitiesView dict={dict} crons={s.cronsState.crons} onClose={() => s.setMenu({ ...s.menu, activities: false })} />}
    {s.menu.reports && <ReportsView dict={dict} onClose={() => s.setMenu({ ...s.menu, reports: false })} />}
    {s.detailCronId && (
      <RoutineDetailModal 
        cron={s.cronsState.crons.find((c: any) => c.cron_id === s.detailCronId)} 
        onClose={() => s.setDetailCronId(null)} 
      />
    )}
  </>
);

const AppMainViews = ({ s, dict }: any) => (
  <>
    <LangToggle lang={s.init.lang} setLang={s.init.setLang} />
    <AppTabs configured={s.init.configured} tab={s.init.tab} setTab={s.init.setTab} state={s.chat.state} sendMessage={s.chat.sendMessage} retryMessage={s.chat.retryMessage} loadMore={s.chat.loadMore} hasMore={s.chat.hasMore} isLoadingMore={s.chat.isLoadingMore} setConfigured={s.init.setConfigured} dict={dict} crons={s.cronsState.crons} deleteCron={s.cronsState.deleteCron} toggleCron={s.cronsState.toggleCron} modules={s.modsState.modules} deleteModule={s.modsState.deleteModule} clearChat={s.chat.clearChat} chatInput={s.chat.chatInput} setChatInput={s.chat.setChatInput} />
    <BottomNav tab={s.init.tab} setTab={s.init.setTab} dict={dict} hasPlans={s.hasPlans} hasRoutines={s.hasRoutines} debugMode={s.debugMode} />
  </>
);

const useAppNotifications = (s: any) => {
  useNotifications(s.cronsState.crons, s.cronsState.deleteCron, (route, extra) => {
    if (route === 'activities') s.setMenu({ ...s.menu, open: false, activities: true });
    else if (route === 'routine_detail' && extra?.cron_id) { s.setMenu({ ...s.menu, open: false }); s.setDetailCronId(extra.cron_id); }
  });
};

const AppSideMenu = ({ s, dict }: any) => (
  <SideMenu 
    isOpen={s.menu.open} 
    setOpen={(v: boolean) => s.setMenu({ ...s.menu, open: v })} 
    dict={dict} 
    onOpenBiometrics={() => s.setMenu({ ...s.menu, biometrics: true })} 
    onOpenActivities={() => s.setMenu({ ...s.menu, activities: true })}
    onOpenReports={() => s.setMenu({ ...s.menu, reports: true })}
  />
);

const AppContent = () => {
  const s = useAppContentState();
  const dict = DICTIONARY[s.init.lang];
  useAppNotifications(s);
  if (s.init.showSplash) return <AppSplashScreen />;
  return (
    <>
      {s.init.configured && <button className="hamburger-btn" onClick={() => s.setMenu({ ...s.menu, open: true })}>☰</button>}
      <AppSideMenu s={s} dict={dict} />
      <AppContentModals s={s} dict={dict} />
      <AppMainViews s={s} dict={dict} />
    </>
  );
};

export default function Home() {
  return (
    <div id="app-container">
      <AppContent />
    </div>
  );
}
