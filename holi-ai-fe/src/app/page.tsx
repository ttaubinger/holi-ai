'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { useNotifications } from '../hooks/useNotifications';
import { useGarminLog } from '../hooks/useGarminLog';
import { useCrons } from '../hooks/useCrons';
import { useModules } from '../hooks/useModules';
import { Message, Cron, ActionModule, Payload } from '../types';
import { DICTIONARY } from '../locales/index';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Helpers ---
const parsePayload = (content: string): Payload => {
  try { return JSON.parse(content).coach_ui_payload || {}; } catch (_e) { return {}; }
};

const getChatHeaderPayload = (messages: Message[]): Payload => {
  const merged: Payload = {};
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    const p = parsePayload(msg.content);
    if (p.headline) merged.headline = p.headline;
    if (p.diagnostic_summary) merged.diagnostic_summary = p.diagnostic_summary;
  }
  return merged;
};

const getChatText = (m: Message) => {
  if (m.role === 'user') return m.content;
  try { return JSON.parse(m.content).chat_message || m.content; } catch { return m.content; }
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
  s.setAppleHealth(localStorage.getItem('APPLE_HEALTH_TOKEN') || '');
  s.setGarminClientId(localStorage.getItem('GARMIN_CLIENT_ID') || '');
  s.setGarminClientSecret(localStorage.getItem('GARMIN_CLIENT_SECRET') || '');
};

const syncConfigToBackend = async (s: any) => {
  try {
    const config = { GARMIN_CLIENT_ID: s.garminClientId, GARMIN_CLIENT_SECRET: s.garminClientSecret, GROQ_KEY: s.groqKey, GROQ_MODEL: s.groqModel };
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
  localStorage.setItem('APPLE_HEALTH_TOKEN', s.appleHealth);
  localStorage.setItem('GARMIN_CLIENT_ID', s.garminClientId);
  localStorage.setItem('GARMIN_CLIENT_SECRET', s.garminClientSecret);
};

const saveSettings = async (s: any, onSave: () => void) => {
  persistLocalKeys(s);
  await syncConfigToBackend(s);
  onSave();
};

// --- Settings View ---
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

const CustomSelect = ({ value, onChange, options, style }: any) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const normOpts = options.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o);
  const selectedLabel = normOpts.find((o: any) => String(o.value) === String(value))?.label || value || (normOpts[0]?.label) || '';
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', ...style }}>
      <div className="apple-input" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => setOpen(!open)}>
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }}>{selectedLabel}</div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}><path d="m6 9 6 6 6-6"/></svg>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: 'var(--panel-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', marginTop: '4px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '250px', overflowY: 'auto' }}>
          {normOpts.map((opt: any, i: number) => (
            <div key={opt.value} style={{ padding: '0.85rem 1rem', cursor: 'pointer', borderBottom: i === normOpts.length - 1 ? 'none' : '1px solid var(--border-color)', color: String(opt.value) === String(value) ? 'var(--accent-color)' : 'var(--text-primary)', background: String(opt.value) === String(value) ? 'var(--bg-color)' : 'transparent', borderTopLeftRadius: i === 0 ? '10px' : '0', borderTopRightRadius: i === 0 ? '10px' : '0', borderBottomLeftRadius: i === normOpts.length - 1 ? '10px' : '0', borderBottomRightRadius: i === normOpts.length - 1 ? '10px' : '0' }} onClick={() => { onChange(opt.value); setOpen(false); }}>
              {opt.label}
            </div>
          ))}
        </div>
      )}
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

const GarminFields = ({ s, setInfo, dict }: any) => {
  if (process.env.NEXT_PUBLIC_GARMIN_DISABLED === 'true') return null;
  return (
    <>
      <SettingsField label={dict.garminId} info={TOOLTIPS.garmin} val={s.garminClientId} setVal={s.setGarminClientId} openInfo={setInfo} />
      <SettingsField label={dict.garminSecret} info={TOOLTIPS.garmin} type="password" val={s.garminClientSecret} setVal={s.setGarminClientSecret} openInfo={setInfo} />
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

const SettingsForm = ({ s, onSave, dict }: any) => {
  const [info, setInfo] = useState<{title: string, text: string} | null>(null);
  const [wiping, setWiping] = useState(false);
  const isLocalDb = process.env.NEXT_PUBLIC_LOCAL_DB === 'true';

  const handleSave = () => {
    if (!s.groqKey) {
      setInfo({ title: 'Validation Error', text: 'Groq API Key is required.' });
      return;
    }
    if (!isLocalDb) {
      const hasNeon = !!s.neonUrl;
      const hasSb = !!s.sbConnUrl;
      if (!hasNeon && !hasSb) {
        setInfo({ title: 'Validation Error', text: 'You must provide either a Neon Database URL OR a Supabase Connection String.' });
        return;
      }
    }
    saveSettings(s, onSave);
  };

  const handleWipe = async () => {
    if (!s.sbConnUrl && !s.neonUrl) {
      setInfo({ title: 'Validation Error', text: 'You must provide either a Neon Database URL OR a Supabase Connection String.' });
      setWiping(false);
      return;
    }
    try {
      const config = { GARMIN_CLIENT_ID: s.garminClientId, GARMIN_CLIENT_SECRET: s.garminClientSecret, GROQ_KEY: s.groqKey, GROQ_MODEL: s.groqModel };
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/config/wipe?userId=usr_1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: { sbConnUrl: s.sbConnUrl, neonUrl: s.neonUrl }, config })
      });
      setInfo({ title: dict.success, text: dict.wipeSuccessText });
    } catch (e: any) {
      setInfo({ title: dict.error, text: e.message });
    } finally {
      setWiping(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', flex: 1, overflowY: 'auto' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>{dict.ecosystem}</h2>
      <GroqFields s={s} setInfo={setInfo} dict={dict} />
      <NeonFields isLocalDb={isLocalDb} s={s} setInfo={setInfo} dict={dict} />
      <SbFields isLocalDb={isLocalDb} s={s} setInfo={setInfo} />
      <SettingsField label={dict.appleHealth} info={TOOLTIPS.health} val={s.appleHealth} setVal={s.setAppleHealth} openInfo={setInfo} />
      <GarminFields s={s} setInfo={setInfo} dict={dict} />
      <button onClick={handleSave} className="apple-button" style={{ marginTop: '1rem' }}>{dict.syncEcosystem}</button>
      
      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <h3 style={{ color: 'var(--error-color, #ff4444)', marginBottom: '0.5rem' }}>{dict.dangerZone}</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{dict.wipeDbWarning}</p>
        <button onClick={() => setWiping(true)} className="apple-button" style={{ background: 'var(--error-color, #ff4444)' }}>{dict.wipeDatabase}</button>
      </div>

      {wiping && <ConfirmModal title={dict.wipeDatabase} text={dict.confirmWipe} onConfirm={handleWipe} onCancel={() => setWiping(false)} dict={dict} />}
      {info && <InfoModal title={info.title} text={info.text} close={() => setInfo(null)} dict={dict} />}
    </div>
  );
};

const SettingsView = ({ setConfigured, dict }: any) => {
  const [sbConnUrl, setSbConnUrl] = useState('');
  const [neonUrl, setNeonUrl] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [groqModel, setGroqModel] = useState('');
  const [appleHealth, setAppleHealth] = useState('');
  const [garminClientId, setGarminClientId] = useState('');
  const [garminClientSecret, setGarminClientSecret] = useState('');
  const s = { sbConnUrl, setSbConnUrl, neonUrl, setNeonUrl, groqKey, setGroqKey, groqModel, setGroqModel, appleHealth, setAppleHealth, garminClientId, setGarminClientId, garminClientSecret, setGarminClientSecret };
  
  useEffect(() => loadSettings(s), []);
  return <SettingsForm s={s} onSave={setConfigured} dict={dict} />;
};

// --- Chat View ---
const ChatBubble = ({ isUser, content, isError, onRetry }: { readonly isUser: boolean; readonly content: string; readonly isError?: boolean; readonly onRetry?: (() => void) | undefined }) => (
  <div style={{ marginBottom: '1rem', textAlign: isUser ? 'right' : 'left', position: 'relative' }}>
    <div style={{
      display: 'inline-block', padding: '0.85rem', borderRadius: '18px', maxWidth: '85%',
      background: isUser ? 'var(--accent-color)' : 'var(--panel-bg)',
      color: isUser ? '#fff' : 'var(--text-primary)',
      textAlign: 'left'
    }}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        className="markdown-body"
        components={{
          table: ({node: _node, ...props}) => (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', marginBottom: '1rem' }}>
              <table className="markdown-table" {...props} />
            </div>
          )
        }}
      >
        {content}
      </ReactMarkdown>
      {isError && onRetry && (
        <button 
          onClick={onRetry} 
          style={{ position: 'absolute', left: '-35px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--text-secondary)' }}
          title="Retry"
        >
          ↻
        </button>
      )}
    </div>
  </div>
);

const useChatInput = (send: any) => {
  const [input, setInput] = useState('');
  const submit = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (input.trim()) { send(input); setInput(''); }
  };
  const onKey = (e: any) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  const onIn = (e: any) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };
  return { input, submit, onKey, onIn };
};

const ChatInput = ({ send, dict }: any) => {
  const { input, submit, onKey, onIn } = useChatInput(send);
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: '0.5rem', padding: '1rem', borderTop: '1px solid var(--border-color)', alignItems: 'flex-end' }}>
      <textarea value={input} onChange={onIn} onKeyDown={onKey} className="apple-input" style={{ resize: 'none', minHeight: '44px', height: '44px', overflowY: 'auto', flex: 1, padding: '0.6rem 1rem', fontFamily: 'inherit', lineHeight: '1.4' }} placeholder={dict.messagePlaceholder} rows={1} />
      <button type="submit" className="apple-button" style={{ width: 'auto', height: '44px' }}>{dict.send}</button>
    </form>
  );
};

const useChatScroll = (messages: any[], loadMore: any, hasMore: boolean, isLoadingMore: boolean) => {
  const ref = useRef<HTMLDivElement>(null);
  const lastH = useRef<number>(0);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 20 && hasMore && !isLoadingMore && lastH.current === 0) {
      lastH.current = e.currentTarget.scrollHeight;
      loadMore();
    }
  };
  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = lastH.current > 0 ? ref.current.scrollHeight - lastH.current : ref.current.scrollHeight;
    lastH.current = 0;
  }, [messages]);
  return { ref, onScroll };
};

const renderMessage = (m: Message, i: number, state: any, retryMessage: any) => {
  const isLast = i === state.messages.length - 1;
  const isErrorMsg = isLast && !!state.error && m.role === 'user';
  if (m.role === 'system') {
    return <div key={m.id} style={{ textAlign: 'center', margin: '1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{getChatText(m)}</div>;
  }
  return (
    <ChatBubble 
      key={m.id} 
      isUser={m.role === 'user'} 
      content={getChatText(m)} 
      isError={isErrorMsg}
      onRetry={isErrorMsg ? () => retryMessage(m.content) : undefined}
    />
  );
};

const ChatView = ({ state, sendMessage, retryMessage, loadMore, hasMore, isLoadingMore, dict }: any) => {
  const { ref, onScroll } = useChatScroll(state.messages, loadMore, hasMore, isLoadingMore);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div ref={ref} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {isLoadingMore && <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'center' }}><div className="spinner" /></div>}
        {state.messages.map((m: Message, i: number) => renderMessage(m, i, state, retryMessage))}
        {state.isThinking && <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>{dict.coachAnalyzing}</div>}
        {state.error && <div style={{ color: 'var(--error-color, #ff4444)', padding: '1rem', textAlign: 'center' }}>Error: {state.error}</div>}
      </div>
      <ChatInput send={sendMessage} dict={dict} />
    </div>
  );
};

// --- Dashboard View ---
const ActionMetric = ({ label, value }: any) => (
  <div style={{ marginRight: '1.5rem', marginBottom: '0.5rem' }}>
    <strong style={{ fontSize: '1.25rem' }}>{value}</strong> <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
  </div>
);

const ActionModuleCard = ({ mod, onDelete }: { readonly mod: ActionModule, readonly onDelete: (t: string) => void }) => (
  <div className="card" style={{ position: 'relative' }}>
    <button onClick={() => onDelete(mod.module_title)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
    <h3 style={{ marginBottom: '0.5rem', color: 'var(--accent-color)' }}>{mod.module_title}</h3>
    <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>{mod.description}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
      {mod.key_metrics?.map((m, i) => <ActionMetric key={i} label={m.label} value={m.value} />)}
    </div>
    {mod.items?.length > 0 && (
      <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        {mod.items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    )}
  </div>
);

const DashboardDropdown = ({ modules, idx, setIdx }: any) => {
  const opts = modules.map((m: any, i: number) => ({ label: m.module_title, value: i }));
  return (
    <div style={{ marginBottom: '1rem' }}>
      <CustomSelect value={idx} onChange={(v: any) => setIdx(Number(v))} options={opts} />
    </div>
  );
};

const DashboardHeader = ({ merged, dict }: any) => (
  <>
    <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>{merged.headline || dict.baseline}</h1>
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>{dict.diagnostic}</h3>
      <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{merged.diagnostic_summary}</p>
    </div>
  </>
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

const CronCard = ({ cron, onDelete, onClick }: { readonly cron: Cron, readonly onDelete: (id: string, title: string) => void, readonly onClick: () => void }) => (
  <div onClick={onClick} style={{ background: 'var(--panel-bg)', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', opacity: cron.is_active ? 1 : 0.5, cursor: 'pointer' }}>
    <div>
      <div style={{ fontWeight: 'bold' }}>{cron.title}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{cron.schedule}</div>
    </div>
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <button onClick={(e) => { e.stopPropagation(); onDelete(cron.cron_id, cron.title); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>🗑️</button>
      <div style={{ fontSize: '1.2rem' }}>{cron.is_active ? '🔔' : '🔕'}</div>
    </div>
  </div>
);

const ActiveRoutines = ({ crons, dict, onDelete }: any) => {
  const [selectedCron, setSelectedCron] = useState<Cron | null>(null);
  const [deleting, setDeleting] = useState<{id: string, title: string} | null>(null);
  const [filter, setFilter] = useState<string>('All');
  if (!crons || crons.length === 0) return null;

  const categories = ['All', ...Array.from(new Set(crons.map((c: Cron) => c.category || 'Custom')))];
  const filteredCrons = filter === 'All' ? crons : crons.filter((c: Cron) => (c.category || 'Custom') === filter);

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>{dict.routines}</h3>
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
        {categories.map((cat: any) => (
          <button key={cat} onClick={() => setFilter(cat)} style={{ background: filter === cat ? 'var(--accent-color)' : 'var(--panel-bg)', color: filter === cat ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '16px', padding: '0.4rem 1rem', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', fontWeight: 'bold' }}>
            {cat}
          </button>
        ))}
      </div>
      {filteredCrons.map((c: Cron, i: number) => <CronCard key={i} cron={c} onDelete={(id, title) => setDeleting({id, title})} onClick={() => setSelectedCron(c)} />)}
      {selectedCron && <CronModal title={selectedCron.title} schedule={selectedCron.schedule} text={selectedCron.description} close={() => setSelectedCron(null)} />}
      {deleting && <ConfirmModal title={dict.confirmDelete} text={`${dict.deleteCronText}: "${deleting.title}"?`} onConfirm={() => { onDelete(deleting.id); setDeleting(null); }} onCancel={() => setDeleting(null)} dict={dict} />}
    </div>
  );
};

const DashboardView = ({ messages, dict, modules, deleteModule, crons, deleteCron }: any) => {
  const merged = getChatHeaderPayload(messages);
  const [activeIdx, setActiveIdx] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingTiedCrons, setDeletingTiedCrons] = useState<Cron[] | null>(null);
  
  const handleModuleDeleteConfirm = () => {
    deleteModule(deleting);
    const tied = (crons || []).filter((c: Cron) => c.linked_module == deleting);
    if (tied.length > 0) {
      setDeletingTiedCrons(tied);
    }
    setDeleting(null);
  };
  
  if (!modules?.length) return null;
  const idx = activeIdx >= modules.length ? 0 : activeIdx;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
      <DashboardHeader merged={merged} dict={dict} />
      <DashboardDropdown modules={modules} idx={idx} setIdx={setActiveIdx} />
      {modules[idx] && <ActionModuleCard mod={modules[idx]} onDelete={(t) => setDeleting(t)} />}
      {deleting && <ConfirmModal title={dict.confirmDelete} text={dict.deleteModuleText} onConfirm={handleModuleDeleteConfirm} onCancel={() => setDeleting(null)} dict={dict} />}
      {deletingTiedCrons && (
        <ConfirmModal 
          title={dict.confirmDelete} 
          text={dict.deleteTiedCronsText} 
          onConfirm={() => { deletingTiedCrons.forEach(c => deleteCron(c.cron_id)); setDeletingTiedCrons(null); }} 
          onCancel={() => setDeletingTiedCrons(null)} 
          dict={{ ...dict, confirm: dict.deleteCrons, cancel: dict.keepCrons }} 
        />
      )}
    </div>
  );
};

const RoutinesView = ({ crons, dict, deleteCron }: any) => {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
      <ActiveRoutines crons={crons} dict={dict} onDelete={deleteCron} />
    </div>
  );
};

// --- Navigation & Core ---
const BottomNav = ({ tab, setTab, dict, hasPlans, hasRoutines }: any) => (
  <div className="bottom-nav">
    {hasPlans && <div className={`nav-item ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>{dict.planTab}</div>}
    {hasRoutines && <div className={`nav-item ${tab === 'routines' ? 'active' : ''}`} onClick={() => setTab('routines')}>{dict.routineTab}</div>}
    <div className={`nav-item ${tab === 'coach' ? 'active' : ''}`} onClick={() => setTab('coach')}>{dict.coachTab}</div>
    <div className={`nav-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>{dict.settingsTab}</div>
  </div>
);

const LangToggle = ({ lang, setLang }: { readonly lang: 'en'|'cs', readonly setLang: (l: 'en'|'cs') => void }) => (
  <div style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 50, display: 'flex', gap: '0.5rem' }}>
    <button onClick={() => { setLang('en'); localStorage.setItem('LANG', 'en'); }} style={{ background: lang === 'en' ? 'var(--accent-color)' : 'var(--panel-bg)', color: lang === 'en' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>EN</button>
    <button onClick={() => { setLang('cs'); localStorage.setItem('LANG', 'cs'); }} style={{ background: lang === 'cs' ? 'var(--accent-color)' : 'var(--panel-bg)', color: lang === 'cs' ? '#fff' : 'var(--text-primary)', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>CS</button>
  </div>
);

const AppTabs = ({ configured, tab, setTab, state, sendMessage, retryMessage, loadMore, hasMore, isLoadingMore, setConfigured, dict, crons, deleteCron, modules, deleteModule }: any) => (
  <div style={{ paddingTop: '3rem', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    {!configured && tab !== 'settings' && <div style={{ padding: '2rem', flex: 1 }}>{dict.configureEcosystem}</div>}
    {configured && tab === 'plan' && <DashboardView messages={state.messages} dict={dict} modules={modules} deleteModule={deleteModule} crons={crons} deleteCron={deleteCron} />}
    {configured && tab === 'routines' && <RoutinesView crons={crons} dict={dict} deleteCron={deleteCron} />}
    {configured && tab === 'coach' && <ChatView state={state} sendMessage={sendMessage} retryMessage={retryMessage} loadMore={loadMore} hasMore={hasMore} isLoadingMore={isLoadingMore} dict={dict} />}
    {tab === 'settings' && <SettingsView setConfigured={() => { setConfigured(true); setTab('coach'); }} dict={dict} />}
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




const SplashScreen = () => (
  <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, backgroundColor: '#000' }}>
    <img src="/splash-native.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Splash" />
  </div>
);

const GarminField = ({ label, type, val, setVal }: any) => {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input 
        type={type} 
        className={type === 'range' ? 'garmin-slider' : 'apple-input'} 
        value={val} 
        onChange={(e) => setVal(e.target.value)} 
      />
    </div>
  );
};

const useGarminFormState = () => {
  const [garminData, setGarminData] = useState<Record<string, string>>({});
  
  const updateField = (key: string, value: string) => {
    setGarminData((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  return { garminData, updateField };
};

const parseGarminNumber = (value?: string) => {
  if (!value) {
    return null;
  }
  return parseInt(value, 10);
};

const parseGarminFloat = (value?: string) => {
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

const buildGarminPayload = (data: Record<string, string>) => {
  return {
    steps: parseGarminNumber(data.steps),
    resting_hr: parseGarminNumber(data.hr),
    hrv_rmssd: parseGarminFloat(data.hrv),
    stress_score: parseGarminNumber(data.str),
    body_battery: parseGarminNumber(data.bb),
    sleep_score: parseGarminNumber(data.ss),
    sleep_duration_seconds: calculateSleepSeconds(data.sh, data.sm),
    spo2: parseGarminFloat(data.sp),
    respiration_rate: parseGarminFloat(data.rr),
    active_calories: parseGarminNumber(data.cal)
  };
};

const GarminFormSection1 = ({ data, updateField, dict }: any) => {
  return (
    <>
      <GarminField label={dict.steps} type="number" val={data.steps || ''} setVal={(v: string) => updateField('steps', v)} />
      <GarminField label={dict.restingHr} type="number" val={data.hr || ''} setVal={(v: string) => updateField('hr', v)} />
      <GarminField label={dict.hrv} type="number" val={data.hrv || ''} setVal={(v: string) => updateField('hrv', v)} />
      <GarminField label={dict.stressScore} type="number" val={data.str || ''} setVal={(v: string) => updateField('str', v)} />
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {dict.stressToHrvHint}
      </div>
    </>
  );
};

const GarminFormSection2 = ({ data, updateField, dict }: any) => {
  return (
    <>
      <GarminField label={dict.bodyBattery} type="number" val={data.bb || ''} setVal={(v: string) => updateField('bb', v)} />
      <div className="form-group">
        <label>{dict.sleepDuration}</label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input type="number" className="apple-input" value={data.sh || ''} onChange={(e) => updateField('sh', e.target.value)} placeholder={dict.hours} />
          <input type="number" className="apple-input" value={data.sm || ''} onChange={(e) => updateField('sm', e.target.value)} placeholder={dict.minutes} />
        </div>
      </div>
      <GarminField label={dict.sleepScore} type="number" val={data.ss || ''} setVal={(v: string) => updateField('ss', v)} />
    </>
  );
};

const GarminFormSection3 = ({ data, updateField, dict }: any) => {
  return (
    <>
      <GarminField label={dict.spo2} type="number" val={data.sp || ''} setVal={(v: string) => updateField('sp', v)} />
      <GarminField label={dict.respirationRate} type="number" val={data.rr || ''} setVal={(v: string) => updateField('rr', v)} />
      <GarminField label={dict.activeCalories} type="number" val={data.cal || ''} setVal={(v: string) => updateField('cal', v)} />
    </>
  );
};

const GarminLogForm = ({ dict, onSubmit, onClose }: any) => {
  const { garminData, updateField } = useGarminFormState();
  const submit = () => onSubmit(buildGarminPayload(garminData));
  
  return (
    <div className="garmin-form-container" style={{ paddingTop: '4rem' }}>
      <h2>{dict.logGarminData}</h2>
      <GarminFormSection1 data={garminData} updateField={updateField} dict={dict} />
      <GarminFormSection2 data={garminData} updateField={updateField} dict={dict} />
      <GarminFormSection3 data={garminData} updateField={updateField} dict={dict} />
      <button className="apple-button" onClick={submit} style={{ marginTop: '1rem' }}>
        {dict.saveLog}
      </button>
      <button className="apple-button" onClick={onClose} style={{ background: 'var(--panel-bg)', color: 'var(--text-primary)' }}>
        {dict.cancel}
      </button>
    </div>
  );
};

const GarminLogView = ({ dict, onClose }: any) => {
  const { submitLog } = useGarminLog('usr_1');
  const onSubmit = async (data: any) => {
    const ok = await submitLog(data);
    if (ok) onClose();
  };
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'var(--bg-color)', zIndex: 3000, overflowY: 'auto' }}>
      <GarminLogForm dict={dict} onSubmit={onSubmit} onClose={onClose} />
    </div>
  );
};

const SideMenu = ({ isOpen, setOpen, dict, onOpenGarmin }: any) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="side-menu-overlay" onClick={() => setOpen(false)} />
      <div className="side-menu-panel">
        <div style={{ padding: '4rem 1.5rem', fontWeight: 600, fontSize: '1.2rem', borderBottom: '1px solid var(--border-color)' }}>{dict.menu}</div>
        <div onClick={() => { setOpen(false); onOpenGarmin(); }} style={{ padding: '1.5rem', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}>{dict.logGarminData}</div>
      </div>
    </>
  );
};

const useAppContentState = () => {
  const init = useAppInit();
  const chat = useChat('usr_1', init.lang);
  const cronsState = useCrons(init.configured, init.tab);
  const modsState = useModules(init.configured, init.tab);
  const [menu, setMenu] = useState({ open: false, garmin: false });
  const hasPlans = modsState.modules && modsState.modules.length > 0;
  const hasRoutines = cronsState.crons && cronsState.crons.length > 0;
  useEffect(() => {
    if (init.tab === 'plan' && !hasPlans) init.setTab('coach');
    if (init.tab === 'routines' && !hasRoutines) init.setTab('coach');
  }, [hasPlans, hasRoutines, init.tab, init.setTab]);
  return { init, chat, cronsState, modsState, menu, setMenu, hasPlans, hasRoutines };
};

const AppContent = () => {
  const s = useAppContentState();
  const dict = DICTIONARY[s.init.lang];
  useNotifications(s.cronsState.crons, s.cronsState.deleteCron);
  if (s.init.showSplash) return <SplashScreen />;
  return (
    <>
      {s.init.configured && <button className="hamburger-btn" onClick={() => s.setMenu({ ...s.menu, open: true })}>☰</button>}
      <SideMenu isOpen={s.menu.open} setOpen={(v: boolean) => s.setMenu({ ...s.menu, open: v })} dict={dict} onOpenGarmin={() => s.setMenu({ ...s.menu, garmin: true })} />
      {s.menu.garmin && <GarminLogView dict={dict} onClose={() => s.setMenu({ ...s.menu, garmin: false })} />}
      <LangToggle lang={s.init.lang} setLang={s.init.setLang} />
      <AppTabs configured={s.init.configured} tab={s.init.tab} setTab={s.init.setTab} state={s.chat.state} sendMessage={s.chat.sendMessage} retryMessage={s.chat.retryMessage} loadMore={s.chat.loadMore} hasMore={s.chat.hasMore} isLoadingMore={s.chat.isLoadingMore} setConfigured={s.init.setConfigured} dict={dict} crons={s.cronsState.crons} deleteCron={s.cronsState.deleteCron} modules={s.modsState.modules} deleteModule={s.modsState.deleteModule} />
      <BottomNav tab={s.init.tab} setTab={s.init.setTab} dict={dict} hasPlans={s.hasPlans} hasRoutines={s.hasRoutines} />
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
