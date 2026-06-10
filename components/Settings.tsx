"use client";
import { useState, useEffect } from "react";
import { DEFAULT_MODELS } from "@/lib/providers/types";
import { Modal, ModalHeader } from "./ui/primitives";

export interface UserSettings {
  provider: "claude" | "gemini" | "openai" | "groq";
  apiKey: string;
  model: string;
  scanTime: string; // "09:00" PKT
}

const PROVIDER_LABELS = {
  groq:   { name: "Groq · Free (Llama 3.3)", placeholder: "gsk_...", keyUrl: "https://console.groq.com/keys" },
  gemini: { name: "Gemini (Google)", placeholder: "AIza...", keyUrl: "https://aistudio.google.com/apikey" },
  claude: { name: "Claude (Anthropic)", placeholder: "sk-ant-api03-...", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { name: "ChatGPT (OpenAI)", placeholder: "sk-proj-...", keyUrl: "https://platform.openai.com/api-keys" },
};

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (recommended · free)" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (faster · free)" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B (free)" },
  ],
  claude: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (recommended)" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (faster, cheaper)" },
    { value: "claude-opus-4-8", label: "Claude Opus 4.8 (most powerful)" },
  ],
  gemini: [
    { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite (free tier, recommended)" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (faster, small cost)" },
    { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash Preview (newest)" },
  ],
  openai: [
    { value: "gpt-4o-mini", label: "GPT-4o Mini (recommended)" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
};

const LS_KEY = "psx_settings";

export function loadSettings(): UserSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {}
  return defaultSettings();
}

function defaultSettings(): UserSettings {
  return { provider: "groq", apiKey: "", model: DEFAULT_MODELS.groq, scanTime: "09:00" };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (s: UserSettings) => void;
}

export default function Settings({ open, onClose, onSave }: Props) {
  const [s, setS] = useState<UserSettings>(defaultSettings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) setS(loadSettings());
  }, [open]);

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
    onSave(s);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  }

  if (!open) return null;

  const pInfo = PROVIDER_LABELS[s.provider];

  return (
    <Modal onClose={onClose} maxWidth="max-w-md">
      <ModalHeader title="Settings" sub="AI provider for scans — keys never leave your browser" onClose={onClose} />

      {/* Provider */}
      <label className="label">AI Provider</label>
      <select
        value={s.provider}
        onChange={e => {
          const p = e.target.value as UserSettings["provider"];
          setS(prev => ({ ...prev, provider: p, model: DEFAULT_MODELS[p] }));
        }}
        className="input mt-1.5 mb-4 cursor-pointer"
      >
        {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v.name}</option>
        ))}
      </select>

      {/* API Key */}
      <label className="label">
        API Key{" "}
        <a href={pInfo.keyUrl} target="_blank" rel="noreferrer" className="text-sky-2 normal-case font-normal hover:underline">
          (get one ↗)
        </a>
      </label>
      <div className="flex gap-2 mt-1.5 mb-1.5">
        <input
          type={showKey ? "text" : "password"}
          placeholder={pInfo.placeholder}
          value={s.apiKey}
          onChange={e => setS(p => ({ ...p, apiKey: e.target.value }))}
          className="input font-mono text-xs flex-1"
        />
        <button onClick={() => setShowKey(v => !v)} className="btn px-3">
          {showKey ? "Hide" : "Show"}
        </button>
      </div>
      <p className="text-[10px] text-ink-3 mb-4 leading-relaxed">
        Stored in your browser only — never sent to any server except the AI provider directly.
      </p>

      {/* Model */}
      <label className="label">Model</label>
      <select
        value={s.model}
        onChange={e => setS(p => ({ ...p, model: e.target.value }))}
        className="input mt-1.5 mb-4 cursor-pointer"
      >
        {(MODEL_OPTIONS[s.provider] || []).map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>

      {/* Scan time */}
      <label className="label">Daily Auto-Scan Time (PKT)</label>
      <input
        type="time"
        value={s.scanTime}
        onChange={e => setS(p => ({ ...p, scanTime: e.target.value }))}
        className="input mt-1.5 mb-5"
      />

      <button
        onClick={save}
        className={`w-full py-2 rounded-lg cursor-pointer text-sm font-semibold border transition-all
          ${saved ? "bg-up-dim text-up-2 border-up" : "bg-up text-white border-up hover:brightness-110"}`}
      >
        {saved ? "✓ Saved!" : "Save Settings"}
      </button>
    </Modal>
  );
}
