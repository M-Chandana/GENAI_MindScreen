import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── API Config ──────────────────────────────────────────────────────────────
const API_BASE = "http://127.0.0.1:8000/api";

const api = {
  post: async (path, body) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      try {
        const json = JSON.parse(text);
        throw new Error(json.detail || text);
      } catch {
        throw new Error(text);
      }
    }
    return JSON.parse(text);
  },
  get: async (path) => {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

// ── PHQ-9 Questions ─────────────────────────────────────────────────────────
const PHQ9_QUESTIONS = [
  "Have you found yourself having little interest or pleasure in doing things you usually enjoy?",
  "Have you been feeling down, depressed, or hopeless lately?",
  "Have you had trouble falling or staying asleep, or perhaps found yourself sleeping too much?",
  "How have your energy levels been? Have you been feeling tired or having very little energy?",
  "How has your appetite been? Have you had a poor appetite or found yourself overeating?",
  "Have you been feeling bad about yourself — like you're a failure or have let yourself or your family down?",
  "Has it been hard to concentrate on things, like reading the news or watching television?",
  "Have you noticed yourself moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you've been moving around a lot more than usual?",
  "Have you had thoughts that you would be better off dead, or of hurting yourself in some way?",
];

const GAD7_QUESTIONS = [
  "Have you been feeling nervous, anxious, or on edge?",
  "Have you found that you're not able to stop or control your worrying?",
  "Have you been worrying too much about many different things?",
  "Has it been difficult for you to relax?",
  "Have you been so restless that it's hard to sit still?",
  "Have you been becoming easily annoyed or irritable?",
  "Have you felt afraid, as if something awful might happen?",
];

const FREQ_OPTIONS = [
  { value: 0, label: "Not at all" },
  { value: 1, label: "Several days" },
  { value: 2, label: "More than half the days" },
  { value: 3, label: "Nearly every day" },
];

// ── Chatbot Flow ─────────────────────────────────────────────────────────────
const CHATBOT_SCRIPT = [
  {
    id: "greeting",
    message: "Hello, I'm MindScreen — your confidential mental health pre-screening assistant. 💙\n\nEverything you share here is private and will only be reviewed by your assigned clinician.\n\nShall we begin your assessment today?",
    type: "choice",
    options: ["Yes, let's begin", "Tell me more first"],
  },
  {
    id: "explain",
    message: "This assessment takes about 5-10 minutes. We'll have a brief conversation, then I'll ask you a few standardized questions used by mental health professionals.\n\nThis is a *decision support tool* — not a diagnosis. A clinician will review your results.\n\nReady to start?",
    type: "choice",
    options: ["I'm ready", "I feel nervous about this"],
  },
  {
    id: "checkin_nervous",
    message: "It's completely natural to feel nervous — many people do. Take a deep breath. 🌿\n\nI'm here to listen without judgment. You're in control, and you can stop at any time.\n\nWhenever you're ready, just let me know.",
    type: "choice",
    options: ["Okay, I'm ready now"],
    condition: "nervous",
  },
  {
    id: "open_feeling",
    message: "Let's start with how you've been feeling lately. In your own words — how would you describe your emotional state over the past 2 weeks?",
    type: "adaptive_chat",
    placeholder: "Take your time and share as much or as little as you're comfortable with...",
  },
  {
    id: "phq9_intro",
    message: "Thank you for sharing that. Now I'll ask you 9 standardized questions from the **PHQ-9** — a validated depression screening tool.\n\nFor each question, rate how often you've experienced it **over the past 2 weeks**.",
    type: "info",
    next: "phq9",
  },
  {
    id: "phq9",
    type: "phq9",
  },
  {
    id: "gad7_intro",
    message: "Great, you're doing really well. 🌟\n\nNext, I'll ask 7 questions from the **GAD-7** — a validated anxiety screening scale.",
    type: "info",
    next: "gad7",
  },
  {
    id: "gad7",
    type: "gad7",
  },
  {
    id: "mood_scale",
    message: "Almost done! On a scale of 1 to 10, how would you rate your overall mood and emotional wellbeing right now?\n\n*1 = Very distressed / 10 = Feeling great*",
    type: "mood",
  },
  {
    id: "final_thoughts",
    message: "Is there anything else you'd like to share that might help your clinician understand your situation better?",
    type: "text",
    placeholder: "Optional — share anything else on your mind...",
  },
  {
    id: "submitting",
    message: "Thank you so much for your honesty and trust. 💙\n\nI'm now analyzing your responses using our AI assessment system...",
    type: "processing",
  },
];

// ── Color System ─────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  LOW: { color: "#059669", bg: "#d1fae5", border: "#6ee7b7", label: "Low Risk" },
  MODERATE: { color: "#d97706", bg: "#fef3c7", border: "#fcd34d", label: "Moderate Risk" },
  HIGH: { color: "#dc2626", bg: "#fee2e2", border: "#fca5a5", label: "High Risk" },
  CRITICAL: { color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd", label: "Critical — Immediate Review" },
};

const EMOTION_COLORS = {
  sadness: "#6366f1", fear: "#f59e0b", anger: "#ef4444",
  joy: "#22c55e", disgust: "#8b5cf6", surprise: "#06b6d4", neutral: "#94a3b8",
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function MindScreen() {
  const [view, setView] = useState("landing"); // landing | auth | chat | results | dashboard
  const [user, setUser] = useState(null);
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [useDemoMode, setUseDemoMode] = useState(false);

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    localStorage.setItem("user", JSON.stringify(userData));
    if (userData.role === "clinician") {
      setView("dashboard");
    } else {
      setView("chat");
    }
  };

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleAssessmentComplete = (result) => {
    setAssessmentResult(result);
    setView("results");
  };

  const startAsGuest = () => {
    if (!user) {
      setView("auth");
      return;
    }
    setUseDemoMode(false);
    setView("chat");
  };

  const startDemo = () => {
    if (!user) {
      setView("auth");
      return;
    }
    setUseDemoMode(true);
    setView("chat");
  };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", minHeight: "100vh", background: "#f0f7fa" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300;1,9..40,400&family=Playfair+Display:wght@600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --teal-900: #0d4f6c;
          --teal-700: #1a7a9a;
          --teal-500: #2ba3c9;
          --teal-300: #7dd3e8;
          --teal-100: #e0f4fa;
          --teal-50: #f0f9fd;
          --blue-600: #2563eb;
          --slate-800: #1e293b;
          --slate-600: #475569;
          --slate-400: #94a3b8;
          --slate-100: #f1f5f9;
          --white: #ffffff;
          --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
          --shadow-md: 0 4px 16px rgba(13,79,108,0.12);
          --shadow-lg: 0 8px 32px rgba(13,79,108,0.16);
          --radius: 16px;
          --radius-sm: 10px;
        }
        body { background: var(--teal-50); }
        button { cursor: pointer; font-family: inherit; }
        input, textarea { font-family: inherit; }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .typing-dots span { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--teal-500); margin: 0 2px; animation: bounce 1.2s infinite; }
        .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
        .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-8px); } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: var(--teal-300); border-radius: 3px; }
      `}</style>

      {view === "landing" && <LandingPage onStart={startAsGuest} onDemo={startDemo} onLogin={() => setView("auth")} />}
      {view === "auth" && <AuthPage onSuccess={handleAuthSuccess} onBack={() => setView("landing")} />}
      {view === "chat" && (
        <ChatInterface
          user={user}
          demoMode={useDemoMode}
          onComplete={handleAssessmentComplete}
          onBack={() => setView("landing")}
        />
      )}
      {view === "results" && assessmentResult && (
        <ResultsView
          result={assessmentResult}
          onNewAssessment={() => { setAssessmentResult(null); setView("chat"); }}
          onBack={() => setView("landing")}
        />
      )}
      {view === "dashboard" && (
        <PsychiatristDashboard
          user={user}
          onBack={() => setView("landing")}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────────
function LandingPage({ onStart, onDemo, onLogin }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <nav style={{ background: "white", borderBottom: "1px solid #e0f4fa", padding: "0 32px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #1a7a9a, #2ba3c9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: 18 }}>🧠</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--teal-900)", fontFamily: "'Playfair Display', serif" }}>MindScreen</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={onLogin} style={{ padding: "9px 20px", borderRadius: 8, border: "1.5px solid var(--teal-500)", background: "transparent", color: "var(--teal-700)", fontWeight: 600, fontSize: 14 }}>Clinician Login</button>
          <button onClick={onStart} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #1a7a9a, #2ba3c9)", color: "white", fontWeight: 600, fontSize: 14 }}>Start Assessment</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", textAlign: "center", background: "linear-gradient(160deg, #f0f9fd 0%, #e0f4fa 40%, #f0f7fa 100%)" }}>
        <div className="fade-in" style={{ maxWidth: 700 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(27,122,154,0.1)", border: "1px solid rgba(27,122,154,0.2)", borderRadius: 99, padding: "6px 16px", marginBottom: 28, color: "var(--teal-700)", fontSize: 13, fontWeight: 500 }}>
            🔒 HIPAA-Aware · Confidential · AI-Powered
          </div>
          <h1 style={{ fontSize: 52, fontWeight: 700, fontFamily: "'Playfair Display', serif", color: "var(--teal-900)", lineHeight: 1.15, marginBottom: 20 }}>
            Mental Health Pre-Assessment,<br />
            <span style={{ color: "var(--teal-500)" }}>Reimagined</span>
          </h1>
          <p style={{ fontSize: 18, color: "var(--slate-600)", lineHeight: 1.7, marginBottom: 40, maxWidth: 580, margin: "0 auto 40px" }}>
            An AI-powered screening platform that analyzes emotional patterns, questionnaire responses, and conversational cues to generate clinical-grade pre-assessment reports for mental health professionals.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={onStart} style={{ padding: "15px 32px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0d4f6c, #1a7a9a)", color: "white", fontWeight: 600, fontSize: 16, boxShadow: "0 4px 20px rgba(13,79,108,0.3)" }}>
              Begin Assessment →
            </button>
            <button onClick={onDemo} style={{ padding: "15px 32px", borderRadius: 12, border: "1.5px solid var(--teal-500)", background: "white", color: "var(--teal-700)", fontWeight: 600, fontSize: 16 }}>
              ▶ Demo Mode
            </button>
          </div>
        </div>

        {/* Feature cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, maxWidth: 860, margin: "60px auto 0", width: "100%", padding: "0 16px" }}>
          {[
            { icon: "💬", title: "Conversational AI", desc: "Adaptive chatbot that collects PHQ-9, GAD-7 and open responses" },
            { icon: "🔬", title: "NLP Analysis", desc: "BERT sentiment + RoBERTa emotion detection on your responses" },
            { icon: "📊", title: "Risk Stratification", desc: "Logistic regression risk model with depression & anxiety probabilities" },
            { icon: "📋", title: "Clinical Reports", desc: "AI-generated structured reports ready for psychiatrist review" },
          ].map((f, i) => (
            <div key={i} className="fade-in" style={{ background: "white", borderRadius: 14, padding: "20px 18px", textAlign: "left", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)", animationDelay: `${i * 0.1}s` }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, color: "var(--teal-900)", marginBottom: 6, fontSize: 15 }}>{f.title}</div>
              <div style={{ color: "var(--slate-600)", fontSize: 13, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 40, padding: "16px 24px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 10, maxWidth: 620, color: "#dc2626", fontSize: 13, lineHeight: 1.6 }}>
          ⚠️ <strong>Disclaimer:</strong> MindScreen is a clinical decision support tool. It does not provide diagnoses or replace professional mental health evaluation. If you are in crisis, please contact emergency services immediately.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH PAGE
// ─────────────────────────────────────────────────────────────────────────────
function AuthPage({ onSuccess, onBack }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      if (mode === "login") {
        const data = await api.post("/auth/login", form);
        onSuccess(data);
      } else {
        await api.post("/auth/register", form);
        const data = await api.post("/auth/login", form);
        onSuccess(data);
      }
    } catch (e) {
      setError(e.message || "Invalid credentials. Try doctor/doctor123 for clinician access.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #f0f9fd, #e0f4fa)" }}>
      <div className="fade-in" style={{ background: "white", borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 400, boxShadow: "var(--shadow-lg)" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--teal-700)", marginBottom: 20, fontSize: 14 }}>← Back</button>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🧠</div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "var(--teal-900)" }}>MindScreen</h2>
          <p style={{ color: "var(--slate-600)", fontSize: 14, marginTop: 4 }}>Clinician & Patient Portal</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 24, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: "none", background: mode === m ? "white" : "transparent", color: mode === m ? "var(--teal-900)" : "var(--slate-600)", fontWeight: mode === m ? 600 : 400, fontSize: 14, boxShadow: mode === m ? "var(--shadow-sm)" : "none" }}>
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="Username" style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, outline: "none" }} />
          <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Password" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, outline: "none" }} />
          {error && <div style={{ color: "#dc2626", fontSize: 13, background: "#fee2e2", padding: "10px 12px", borderRadius: 8 }}>{error}</div>}
          <button onClick={handleSubmit} disabled={loading} style={{ padding: "13px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #0d4f6c, #1a7a9a)", color: "white", fontWeight: 600, fontSize: 15 }}>
            {loading ? "Signing in..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>

        <div style={{ marginTop: 20, padding: "12px 14px", background: "#f0f9fd", borderRadius: 10, fontSize: 12, color: "var(--slate-600)" }}>
          <strong>Demo accounts:</strong><br />
          Clinician: <code>doctor</code> / <code>doctor123</code><br />
          Patient: <code>patient</code> / <code>patient123</code>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT INTERFACE
// ─────────────────────────────────────────────────────────────────────────────
function ChatInterface({ user, demoMode, onComplete, onBack }) {
  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState("");
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [phq9Answers, setPhq9Answers] = useState(Array(9).fill(null));
  const [gad7Answers, setGad7Answers] = useState(Array(7).fill(null));
  const [moodScore, setMoodScore] = useState(null);
  const [phq9Step, setPhq9Step] = useState(0);
  const [gad7Step, setGad7Step] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("chat");
  const [userResponses, setUserResponses] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const phq9AnswersRef = useRef(Array(9).fill(null));
  const gad7AnswersRef = useRef(Array(7).fill(null));
  const moodScoreRef = useRef(null);
  const [adaptiveCount, setAdaptiveCount] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const messagesEndRef = useRef(null);
  const stepRef = useRef(0);
  const adaptiveCountRef = useRef(0);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => scrollToBottom(), [messages, isTyping]);

  // ── Voice Assistant Logic ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        console.error("Recognition start error:", e);
      }
    }
  };

  const speak = useCallback((text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Stop current speech
    
    // Clean markdown for better speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1') // remove bold
      .replace(/\*(.*?)\*/g, '$1')   // remove italic
      .replace(/#+\s/g, '')           // remove headers
      .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // remove links
      
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const addMessage = useCallback((role, content, extra = {}) => {
    setMessages(prev => [...prev, { role, content, timestamp: new Date(), ...extra }]);
  }, []);

  const showBotMessage = useCallback(async (content, delay = 600) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, delay));
    setIsTyping(false);
    addMessage("assistant", content);
    speak(content);
  }, [addMessage, speak]);

  // Start chat flow
  useEffect(() => {
    const initChat = async () => {
      await new Promise(r => setTimeout(r, 400));
      const s = CHATBOT_SCRIPT[0];
      await showBotMessage(s.message, 800);
    };
    initChat();
  }, []);

  const handleStepAdvance = useCallback(async (userInput) => {
    if (userInput) {
      addMessage("user", userInput);
      setUserResponses(prev => [...prev, userInput]);
    }

    const currentScript = CHATBOT_SCRIPT[stepRef.current];

    // Adaptive Chat Logic
    if (currentScript?.type === "adaptive_chat" && adaptiveCountRef.current < 5) {
      setIsTyping(true);
      try {
        const conversationMessages = [...messages, { role: "user", content: userInput }].map(m => ({ role: m.role, content: m.content }));
        const data = await api.post("/assessment/chat", { conversation: conversationMessages });
        await showBotMessage(data.question);
        adaptiveCountRef.current += 1;
        setAdaptiveCount(prev => prev + 1);
        return;
      } catch (err) {
        console.error("Adaptive chat error:", err);
      }
    }

    let nextStep = stepRef.current + 1;
    if (CHATBOT_SCRIPT[nextStep]?.condition === "nervous" && userInput !== "I feel nervous about this") {
      nextStep++;
    }

    stepRef.current = nextStep;
    setStep(nextStep);
    const prog = Math.min(((nextStep) / CHATBOT_SCRIPT.length) * 100, 90);
    setProgress(prog);

    if (nextStep >= CHATBOT_SCRIPT.length) return;

    const next = CHATBOT_SCRIPT[nextStep];

    if (next.type === "phq9") {
      await showBotMessage("Let me ask you the PHQ-9 questions one by one.", 500);
      setCurrentPhase("phq9");
      showPhq9Question(0);
    } else if (next.type === "gad7") {
      await showBotMessage("Now for the GAD-7 anxiety scale.", 500);
      setCurrentPhase("gad7");
      showGad7Question(0);
    } else if (next.type === "mood") {
      setCurrentPhase("mood");
      await showBotMessage(next.message, 700);
    } else if (next.type === "processing") {
      setCurrentPhase("processing");
      await showBotMessage(next.message, 500);
      await submitAssessment();
    } else if (next.type === "info") {
      await showBotMessage(next.message, 700);
      setTimeout(() => handleStepAdvance(null), 1500);
    } else {
      await showBotMessage(next.message, 700);
      if (next.type !== "text" && next.type !== "multiselect" && next.type !== "adaptive_chat") {
        setCurrentPhase("chat");
      } else if (next.type === "adaptive_chat") {
        setCurrentPhase("chat");
      }
    }
  }, [showBotMessage, addMessage, messages]);

  const showPhq9Question = async (idx) => {
    setPhq9Step(idx);
    await showBotMessage(`PHQ-9 Question ${idx + 1} of 9:\n\n*"${PHQ9_QUESTIONS[idx]}"*\n\nHow often have you been bothered by this over the last 2 weeks?`, 400);
    setCurrentPhase("phq9");
  };

  const showGad7Question = async (idx) => {
    setGad7Step(idx);
    await showBotMessage(`GAD-7 Question ${idx + 1} of 7:\n\n*"${GAD7_QUESTIONS[idx]}"*\n\nHow often have you been bothered by this over the last 2 weeks?`, 400);
    setCurrentPhase("gad7");
  };

  const handlePhq9Answer = async (value) => {
    const label = FREQ_OPTIONS[value].label;
    addMessage("user", label);

    // Update both state and ref
    phq9AnswersRef.current[phq9Step] = value;
    const newAnswers = [...phq9Answers];
    newAnswers[phq9Step] = value;
    setPhq9Answers(newAnswers);

    setUserResponses(prev => [...prev, `PHQ9-Q${phq9Step + 1}: ${label}`]);

    if (phq9Step < 8) {
      setTimeout(() => showPhq9Question(phq9Step + 1), 400);
    } else {
      await showBotMessage("Thank you for completing the PHQ-9. 🌟", 400);
      handleStepAdvance(null);
    }
  };

  const handleGad7Answer = async (value) => {
    const label = FREQ_OPTIONS[value].label;
    addMessage("user", label);

    // Update both state and ref
    gad7AnswersRef.current[gad7Step] = value;
    const newAnswers = [...gad7Answers];
    newAnswers[gad7Step] = value;
    setGad7Answers(newAnswers);

    setUserResponses(prev => [...prev, `GAD7-Q${gad7Step + 1}: ${label}`]);

    if (gad7Step < 6) {
      setTimeout(() => showGad7Question(gad7Step + 1), 400);
    } else {
      await showBotMessage("GAD-7 complete — excellent! 🌟", 400);
      handleStepAdvance(null);
    }
  };

  const submitAssessment = async () => {
    setProcessing(true);
    const conversationMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Use refs instead of state to avoid closure issues in useCallback
    const phq9Final = phq9AnswersRef.current.map(a => a ?? 0);
    const gad7Final = gad7AnswersRef.current.map(a => a ?? 0);
    const mood = moodScoreRef.current ?? 5;

    if (demoMode) {
      await new Promise(r => setTimeout(r, 2500));
      const mockResult = generateMockResult(user.username, conversationMessages, phq9Final, gad7Final, mood);
      setProgress(100);
      await showBotMessage("✅ Assessment complete! Your report is ready for clinical review.", 300);
      setTimeout(() => onComplete(mockResult), 800);
      return;
    }

    try {
      const result = await api.post("/assessment/submit", {
        patient_id: user.username,
        patient_name: user.username,
        conversation: conversationMessages,
        phq9_answers: phq9Final,
        gad7_answers: gad7Final,
        mood_score: mood,
      });
      setProgress(100);
      await showBotMessage("✅ Assessment complete! Your report has been generated and is ready for clinical review.", 300);
      setTimeout(() => onComplete(result), 1000);
    } catch (err) {
      console.error("Assessment submit error:", err);
      // Fallback
      const mockResult = generateMockResult(user.username, conversationMessages, phq9Final, gad7Final, mood);
      setProgress(100);
      await showBotMessage("⚠️ Backend analysis partially failed. Using local heuristic evaluation.", 300);
      setTimeout(() => onComplete(mockResult), 800);
    }
  };

  const handleTextSubmit = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    handleStepAdvance(text);
  };

  const handleMultiSelect = (opt) => {
    setSelectedOptions(prev =>
      prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
    );
  };

  const submitMultiSelect = () => {
    const combined = selectedOptions.join(", ");
    setSelectedOptions([]);
    handleStepAdvance(combined || "None selected");
  };

  const currentScript = CHATBOT_SCRIPT[step] || {};

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f0f9fd" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid var(--teal-100)", padding: "0 20px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--slate-600)", fontSize: 14 }}>←</button>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #1a7a9a, #2ba3c9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧠</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "var(--teal-900)" }}>MindScreen</div>
            <div style={{ fontSize: 11, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
              {processing ? "Analyzing responses..." : "Assessment in progress"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button 
            onClick={() => {
              const newVal = !voiceEnabled;
              setVoiceEnabled(newVal);
              if (!newVal) window.speechSynthesis?.cancel();
            }}
            style={{ 
              background: voiceEnabled ? "var(--teal-100)" : "transparent", 
              border: `1.5px solid ${voiceEnabled ? "var(--teal-500)" : "var(--teal-200)"}`,
              borderRadius: 8, padding: "4px 8px", fontSize: 18, transition: "all 0.2s"
            }}
            title={voiceEnabled ? "Disable Voice" : "Enable Voice"}
          >
            {voiceEnabled ? "🔊" : "🔇"}
          </button>
          <div style={{ fontSize: 12, color: "var(--slate-600)" }}>{Math.round(progress)}% complete</div>
          <div style={{ width: 100, height: 5, borderRadius: 9, background: "#e2e8f0" }}>
            <div style={{ height: "100%", borderRadius: 9, background: "linear-gradient(90deg, #1a7a9a, #2ba3c9)", width: `${progress}%`, transition: "width 0.5s ease" }}></div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} className="fade-in" style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #1a7a9a, #2ba3c9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🧠</div>
            )}
            <div style={{
              maxWidth: "72%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: msg.role === "user" ? "linear-gradient(135deg, #0d4f6c, #1a7a9a)" : "white",
              color: msg.role === "user" ? "white" : "var(--slate-800)",
              fontSize: 14, lineHeight: 1.6, boxShadow: "var(--shadow-sm)",
              border: msg.role === "assistant" ? "1px solid var(--teal-100)" : "none",
              whiteSpace: "pre-wrap"
            }}>
              {msg.content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')}
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #1a7a9a, #2ba3c9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🧠</div>
            <div style={{ background: "white", borderRadius: "18px 18px 18px 4px", padding: "14px 18px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
              <div className="typing-dots"><span></span><span></span><span></span></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {!isTyping && !processing && (
        <div style={{ padding: "12px 16px 20px", background: "white", borderTop: "1px solid var(--teal-100)" }}>
          {/* Choice buttons */}
          {currentPhase === "chat" && currentScript.type === "choice" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {currentScript.options?.map((opt, i) => (
                <button key={i} onClick={() => handleStepAdvance(opt)} style={{ padding: "10px 18px", borderRadius: 99, border: "1.5px solid var(--teal-300)", background: "white", color: "var(--teal-700)", fontSize: 14, fontWeight: 500 }}>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Multi-select */}
          {currentPhase === "chat" && currentScript.type === "multiselect" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {currentScript.options?.map((opt, i) => (
                  <button key={i} onClick={() => handleMultiSelect(opt)} style={{ padding: "9px 15px", borderRadius: 99, border: `1.5px solid ${selectedOptions.includes(opt) ? "var(--teal-500)" : "var(--teal-200)"}`, background: selectedOptions.includes(opt) ? "var(--teal-100)" : "white", color: "var(--teal-700)", fontSize: 13, fontWeight: selectedOptions.includes(opt) ? 600 : 400 }}>
                    {selectedOptions.includes(opt) ? "✓ " : ""}{opt}
                  </button>
                ))}
              </div>
              <button onClick={submitMultiSelect} style={{ alignSelf: "flex-start", padding: "10px 22px", borderRadius: 99, border: "none", background: "linear-gradient(135deg, #0d4f6c, #1a7a9a)", color: "white", fontWeight: 600, fontSize: 14, marginTop: 4 }}>
                Continue →
              </button>
            </div>
          )}

          {/* Text input */}
          {currentPhase === "chat" && (currentScript.type === "text" || currentScript.type === "adaptive_chat") && (
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                onClick={toggleListening} 
                style={{ 
                  width: 56, 
                  height: 56, 
                  borderRadius: 12, 
                  border: "none", 
                  background: isListening ? "var(--dc2626, #dc2626)" : "var(--teal-50, #f0f9fd)",
                  color: isListening ? "white" : "var(--teal-700)",
                  fontSize: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isListening ? "0 0 15px rgba(220,38,38,0.4)" : "none",
                  transition: "all 0.2s"
                }}
                className={isListening ? "pulse" : ""}
                title="Voice Search"
              >
                {isListening ? "🛑" : "🎙️"}
              </button>
              <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder={currentScript.placeholder || "Type your response..."} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }} style={{ flex: 1, padding: "12px 14px", borderRadius: 12, border: "1.5px solid var(--teal-200)", resize: "none", minHeight: 56, fontSize: 14, outline: "none", fontFamily: "inherit" }} rows={2} />
              <button onClick={handleTextSubmit} disabled={!inputText.trim()} style={{ padding: "12px 20px", borderRadius: 12, border: "none", background: inputText.trim() ? "linear-gradient(135deg, #0d4f6c, #1a7a9a)" : "#e2e8f0", color: inputText.trim() ? "white" : "var(--slate-400)", fontWeight: 600, fontSize: 15 }}>→</button>
            </div>
          )}

          {/* PHQ-9 answer buttons */}
          {currentPhase === "phq9" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handlePhq9Answer(opt.value)} style={{ flex: "1 1 auto", padding: "11px 10px", borderRadius: 10, border: "1.5px solid var(--teal-200)", background: "white", color: "var(--teal-700)", fontSize: 13, fontWeight: 500, minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: "var(--slate-400)", marginBottom: 2 }}>{opt.value}</div>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* GAD-7 answer buttons */}
          {currentPhase === "gad7" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => handleGad7Answer(opt.value)} style={{ flex: "1 1 auto", padding: "11px 10px", borderRadius: 10, border: "1.5px solid var(--teal-200)", background: "white", color: "var(--teal-700)", fontSize: 13, fontWeight: 500, minWidth: 100 }}>
                  <div style={{ fontSize: 11, color: "var(--slate-400)", marginBottom: 2 }}>{opt.value}</div>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Mood scale */}
          {currentPhase === "mood" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button key={n} onClick={() => { setMoodScore(n); moodScoreRef.current = n; }} style={{ width: 42, height: 42, borderRadius: 10, border: `2px solid ${moodScore === n ? "var(--teal-500)" : "var(--teal-200)"}`, background: moodScore === n ? "var(--teal-100)" : "white", color: moodScore === n ? "var(--teal-700)" : "var(--slate-600)", fontWeight: moodScore === n ? 700 : 400, fontSize: 16 }}>
                    {n}
                  </button>
                ))}
              </div>
              {moodScore && (
                <button onClick={() => handleStepAdvance(`Mood score: ${moodScore}/10`)} style={{ alignSelf: "center", padding: "10px 24px", borderRadius: 99, border: "none", background: "linear-gradient(135deg, #0d4f6c, #1a7a9a)", color: "white", fontWeight: 600, fontSize: 14 }}>
                  Submit Mood: {moodScore}/10 →
                </button>
              )}
            </div>
          )}

          {processing && (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--teal-700)", fontSize: 14 }}>
                <div className="pulse" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--teal-500)" }}></div>
                Processing assessment with AI models...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS VIEW
// ─────────────────────────────────────────────────────────────────────────────
function ResultsView({ result, onNewAssessment, onBack }) {
  const [activeSection, setActiveSection] = useState("overview");
  const risk = result.risk_assessment;
  const nlp = result.nlp_features;
  const meta = result.report?.metadata || {};
  const sections = result.report?.sections || {};
  const riskCfg = RISK_CONFIG[risk.risk_level] || RISK_CONFIG.MODERATE;

  const emotionData = Object.entries(nlp.emotion_distribution || {}).map(([k, v]) => ({
    emotion: k.charAt(0).toUpperCase() + k.slice(1),
    value: Math.round(v * 100),
    fill: EMOTION_COLORS[k] || "#94a3b8"
  }));

  const phq9Data = (result.phq9_answers || []).map((v, i) => ({
    q: `Q${i + 1}`, value: v, label: PHQ9_QUESTIONS[i]?.substring(0, 30)
  }));

  const gad7Data = (result.gad7_answers || []).map((v, i) => ({
    q: `Q${i + 1}`, value: v, label: GAD7_QUESTIONS[i]?.substring(0, 30)
  }));

  const downloadPdf = async () => {
    try {
      const url = `http://127.0.0.1:8000/api/reports/${result.assessment_id}/pdf`;
      console.log("Downloading PDF from:", url);
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `mindscreen_report_${result.assessment_id?.substring(0, 8)}.pdf`;
        link.click();
      } else {
        const errText = await response.text();
        alert(`PDF generation failed: ${errText || "ReportLab error"}`);
      }
    } catch (err) {
      console.error("PDF Download error:", err);
      alert("Connection error: Could not reach the backend server to generate PDF.");
    }
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "report", label: "Clinical Report" },
    { id: "charts", label: "Analytics" },
    { id: "questionnaires", label: "Questionnaires" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f0f9fd" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid var(--teal-100)", padding: "0 24px", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--slate-600)", fontSize: 14 }}>←</button>
            <span style={{ fontWeight: 700, fontSize: 17, color: "var(--teal-900)", fontFamily: "'Playfair Display', serif" }}>Assessment Results</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={downloadPdf} style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid var(--teal-500)", background: "white", color: "var(--teal-700)", fontWeight: 600, fontSize: 13 }}>📄 Download PDF</button>
            <button onClick={onNewAssessment} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #0d4f6c, #1a7a9a)", color: "white", fontWeight: 600, fontSize: 13 }}>New Assessment</button>
          </div>
        </div>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", gap: 0, borderTop: "1px solid var(--teal-100)" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveSection(t.id)} style={{ padding: "12px 20px", background: "none", border: "none", borderBottom: activeSection === t.id ? "2px solid var(--teal-500)" : "2px solid transparent", color: activeSection === t.id ? "var(--teal-700)" : "var(--slate-600)", fontWeight: activeSection === t.id ? 600 : 400, fontSize: 14 }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px" }}>

        {/* OVERVIEW TAB */}
        {activeSection === "overview" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Risk Banner */}
            <div style={{ background: riskCfg.bg, border: `2px solid ${riskCfg.border}`, borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: riskCfg.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Overall Risk Assessment</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: riskCfg.color }}>{riskCfg.label}</div>
                <div style={{ fontSize: 13, color: "var(--slate-600)", marginTop: 4 }}>
                  Patient ID: {result.patient_id} · {new Date(result.created_at).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: riskCfg.color }}>{Math.round(risk.depression_probability * 100)}%</div>
                  <div style={{ fontSize: 12, color: "var(--slate-600)" }}>Depression Risk</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: riskCfg.color }}>{Math.round(risk.anxiety_probability * 100)}%</div>
                  <div style={{ fontSize: 12, color: "var(--slate-600)" }}>Anxiety Risk</div>
                </div>
              </div>
            </div>

            {/* Metrics row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
              {[
                { label: "PHQ-9 Score", value: `${result.phq9_score}/27`, sub: risk.phq9_severity, icon: "📊" },
                { label: "GAD-7 Score", value: `${result.gad7_score}/21`, sub: risk.gad7_severity, icon: "😰" },
                { label: "Mood Score", value: `${result.mood_score}/10`, sub: "Self-reported", icon: "😊" },
                { label: "Primary Emotion", value: nlp.emotion_label?.charAt(0).toUpperCase() + nlp.emotion_label?.slice(1), sub: `${Math.round(nlp.emotion_confidence * 100)}% confidence`, icon: "🎭" },
                { label: "Sentiment", value: nlp.sentiment_label, sub: `Score: ${nlp.sentiment_score?.toFixed(2)}`, icon: "💬" },
              ].map((m, i) => (
                <div key={i} style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{m.icon}</div>
                  <div style={{ fontSize: 13, color: "var(--slate-500)", marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--teal-900)" }}>{m.value}</div>
                  <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 2 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Contributing factors */}
            {risk.contributing_factors?.length > 0 && (
              <div style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 14 }}>⚡ Contributing Risk Factors</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {risk.contributing_factors.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "#fef9f0", borderRadius: 8, borderLeft: "3px solid #f59e0b" }}>
                      <span style={{ color: "#f59e0b", marginTop: 1 }}>•</span>
                      <span style={{ fontSize: 14, color: "var(--slate-700)" }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Keywords */}
            {nlp.detected_keywords?.length > 0 && (
              <div style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 12 }}>🔍 Detected Language Patterns</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {nlp.detected_keywords.map((kw, i) => (
                    <span key={i} style={{ padding: "5px 12px", borderRadius: 99, background: "#fef3c7", color: "#92400e", fontSize: 13, fontWeight: 500, border: "1px solid #fcd34d" }}>{kw}</span>
                  ))}
                </div>
                {nlp.psychological_markers?.length > 0 && (
                  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {nlp.psychological_markers.map((m, i) => (
                      <span key={i} style={{ padding: "5px 12px", borderRadius: 99, background: "#fee2e2", color: "#991b1b", fontSize: 12, fontWeight: 600, border: "1px solid #fca5a5" }}>⚑ {m.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ padding: "14px 18px", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 10, fontSize: 13, color: "#856404" }}>
              ⚠️ <strong>Important:</strong> {result.report?.disclaimer}
            </div>
          </div>
        )}

        {/* REPORT TAB */}
        {activeSection === "report" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "white", borderRadius: 14, padding: "24px 28px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)", borderTop: `4px solid ${riskCfg.color}` }}>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "var(--teal-900)", marginBottom: 6 }}>Clinical Pre-Assessment Report</h2>
              <p style={{ fontSize: 13, color: "var(--slate-500)" }}>Generated {new Date(result.created_at).toLocaleString()} · Patient: {result.patient_name || result.patient_id}</p>
            </div>

            {[
              ["emotional_overview", "1. Emotional Overview", "💭"],
              ["behavioral_observations", "2. Behavioral Observations", "👁"],
              ["depression_risk_analysis", "3. Depression Risk Analysis", "📉"],
              ["anxiety_risk_analysis", "4. Anxiety Risk Analysis", "⚡"],
              ["warning_signs", "5. Warning Signs Detected", "⚠️"],
              ["recommended_next_steps", "6. Recommended Next Steps", "📋"],
              ["consultation_recommendation", "7. Professional Consultation Recommendation", "👨‍⚕️"],
            ].map(([key, title, icon]) => (
              <div key={key} style={{ background: "white", borderRadius: 14, padding: "20px 24px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{icon}</span>{title}
                </h3>
                <div style={{ borderTop: "1px solid var(--teal-100)", paddingTop: 14 }}>
                  <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--slate-700)", whiteSpace: "pre-wrap" }}>
                    {sections[key] || "Section not available."}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CHARTS TAB */}
        {activeSection === "charts" && (
          <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 20 }}>
            {/* Emotion Distribution */}
            <div style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 16 }}>🎭 Emotion Distribution</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={emotionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} fontSize={11} />
                  <YAxis type="category" dataKey="emotion" fontSize={11} width={65} />
                  <Tooltip formatter={v => [`${v}%`, "Confidence"]} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {emotionData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Risk Gauge */}
            <div style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 16 }}>📊 Risk Probabilities</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={[
                  { metric: "Depression", value: Math.round(risk.depression_probability * 100) },
                  { metric: "Anxiety", value: Math.round(risk.anxiety_probability * 100) },
                  { metric: "Neg. Sentiment", value: Math.round(Math.max(0, -nlp.sentiment_score) * 100) },
                  { metric: "Hopelessness", value: Math.min(nlp.hopelessness_indicators * 25, 100) },
                  { metric: "Stress", value: Math.min(nlp.stress_indicators * 20, 100) },
                  { metric: "Sleep Issues", value: Math.min(nlp.sleep_related_words * 30, 100) },
                ]}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="metric" fontSize={11} />
                  <Radar name="Risk" dataKey="value" stroke="#1a7a9a" fill="#1a7a9a" fillOpacity={0.3} />
                  <Tooltip formatter={v => [`${v}%`]} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* PHQ-9 Bar Chart */}
            <div style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)", gridColumn: "1 / -1" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 4 }}>📋 PHQ-9 Response Profile <span style={{ fontSize: 13, fontWeight: 400, color: "var(--slate-500)" }}>— Total: {result.phq9_score}/27 ({risk.phq9_severity})</span></h3>
              <p style={{ fontSize: 12, color: "var(--slate-500)", marginBottom: 16 }}>0 = Not at all, 1 = Several days, 2 = More than half, 3 = Nearly every day</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={phq9Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="q" fontSize={11} />
                  <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} fontSize={11} />
                  <Tooltip labelFormatter={(l, items) => PHQ9_QUESTIONS[parseInt(l.replace('Q', '')) - 1]} formatter={v => [FREQ_OPTIONS[v]?.label]} />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* GAD-7 Bar Chart */}
            <div style={{ background: "white", borderRadius: 14, padding: "20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)", gridColumn: "1 / -1" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)", marginBottom: 4 }}>📋 GAD-7 Response Profile <span style={{ fontSize: 13, fontWeight: 400, color: "var(--slate-500)" }}>— Total: {result.gad7_score}/21 ({risk.gad7_severity})</span></h3>
              <p style={{ fontSize: 12, color: "var(--slate-500)", marginBottom: 16 }}>0 = Not at all, 1 = Several days, 2 = More than half, 3 = Nearly every day</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={gad7Data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="q" fontSize={11} />
                  <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} fontSize={11} />
                  <Tooltip formatter={v => [FREQ_OPTIONS[v]?.label]} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* QUESTIONNAIRES TAB */}
        {activeSection === "questionnaires" && (
          <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* PHQ-9 */}
            <div style={{ background: "white", borderRadius: 14, padding: "24px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--teal-900)", marginBottom: 4 }}>PHQ-9 Patient Health Questionnaire</h3>
              <p style={{ fontSize: 13, color: "var(--slate-500)", marginBottom: 18 }}>Total Score: <strong style={{ color: "var(--teal-700)" }}>{result.phq9_score}/27</strong> — {risk.phq9_severity}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {PHQ9_QUESTIONS.map((q, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `hsl(${210 - (result.phq9_answers?.[i] || 0) * 30}, 70%, 50%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{result.phq9_answers?.[i] ?? 0}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--slate-700)" }}>Q{i + 1}: {q}</div>
                      <div style={{ fontSize: 12, color: "var(--slate-500)" }}>{FREQ_OPTIONS[result.phq9_answers?.[i] || 0]?.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GAD-7 */}
            <div style={{ background: "white", borderRadius: 14, padding: "24px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--teal-900)", marginBottom: 4 }}>GAD-7 Generalized Anxiety Disorder Scale</h3>
              <p style={{ fontSize: 13, color: "var(--slate-500)", marginBottom: 18 }}>Total Score: <strong style={{ color: "var(--teal-700)" }}>{result.gad7_score}/21</strong> — {risk.gad7_severity}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {GAD7_QUESTIONS.map((q, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `hsl(${40 - (result.gad7_answers?.[i] || 0) * 10}, 85%, 55%)`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{result.gad7_answers?.[i] ?? 0}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--slate-700)" }}>Q{i + 1}: {q}</div>
                      <div style={{ fontSize: 12, color: "var(--slate-500)" }}>{FREQ_OPTIONS[result.gad7_answers?.[i] || 0]?.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PSYCHIATRIST DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function PsychiatristDashboard({ user, onBack }) {
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // Load demo patients if backend unavailable
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pData, sData] = await Promise.all([
        api.get("/dashboard/patients"),
        api.get("/dashboard/stats"),
      ]);
      setPatients(pData);
      setStats(sData);
    } catch {
      // Demo data
      setPatients(DEMO_PATIENTS);
      setStats(DEMO_STATS);
    } finally {
      setLoading(false);
    }
  };

  const riskOrder = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
  const sorted = [...patients].sort((a, b) => (riskOrder[a.risk_level] || 3) - (riskOrder[b.risk_level] || 3));

  return (
    <div style={{ minHeight: "100vh", background: "#f0f9fd" }}>
      {/* Header */}
      <div style={{ background: "white", borderBottom: "1px solid var(--teal-100)", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--slate-600)", fontSize: 14 }}>←</button>
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 19, color: "var(--teal-900)" }}>Psychiatrist Dashboard</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--slate-600)" }}>Dr. {user?.username}</span>
          <button onClick={loadData} style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid var(--teal-300)", background: "white", color: "var(--teal-700)", fontSize: 13 }}>↻ Refresh</button>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
        {/* Stats */}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Total Assessments", value: stats.total_assessments, icon: "📋", color: "#1a7a9a" },
              { label: "Critical", value: stats.critical_count, icon: "🔴", color: "#7c3aed" },
              { label: "High Risk", value: stats.high_count, icon: "🟠", color: "#dc2626" },
              { label: "Moderate", value: stats.moderate_count, icon: "🟡", color: "#d97706" },
              { label: "Low Risk", value: stats.low_count, icon: "🟢", color: "#059669" },
              { label: "Avg PHQ-9", value: stats.avg_phq9?.toFixed(1), icon: "📊", color: "#6366f1" },
              { label: "Avg GAD-7", value: stats.avg_gad7?.toFixed(1), icon: "😰", color: "#f59e0b" },
              { label: "Avg Mood", value: stats.avg_mood?.toFixed(1), icon: "😊", color: "#22c55e" },
            ].map((s, i) => (
              <div key={i} style={{ background: "white", borderRadius: 12, padding: "16px 14px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)", textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginTop: 6 }}>{s.value ?? 0}</div>
                <div style={{ fontSize: 12, color: "var(--slate-500)", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1.6fr" : "1fr", gap: 20 }}>
          {/* Patient List */}
          <div style={{ background: "white", borderRadius: 14, boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--teal-100)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--teal-900)" }}>Patient Queue ({patients.length})</h3>
              <span style={{ fontSize: 12, color: "var(--slate-500)" }}>Sorted by risk level</span>
            </div>
            {loading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--slate-400)" }}>Loading patients...</div>
            ) : sorted.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--slate-400)" }}>No assessments yet. Start the chatbot to generate patient data.</div>
            ) : (
              <div style={{ overflowY: "auto", maxHeight: 600 }}>
                {sorted.map((p, i) => {
                  const rc = RISK_CONFIG[p.risk_level] || RISK_CONFIG.MODERATE;
                  return (
                    <div key={i} onClick={() => setSelected(p)} style={{ padding: "14px 20px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: selected?.assessment_id === p.assessment_id ? "var(--teal-50)" : "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${rc.border}, ${rc.color})`, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 14 }}>
                          {(p.patient_name || p.patient_id)?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--slate-800)" }}>{p.patient_name || p.patient_id}</div>
                          <div style={{ fontSize: 11, color: "var(--slate-500)" }}>{new Date(p.created_at).toLocaleDateString()} · {p.primary_emotion}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span style={{ padding: "3px 10px", borderRadius: 99, background: rc.bg, color: rc.color, fontSize: 11, fontWeight: 700, border: `1px solid ${rc.border}` }}>{p.risk_level}</span>
                        <span style={{ fontSize: 11, color: "var(--slate-500)" }}>PHQ:{p.phq9_score} GAD:{p.gad7_score}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Patient Detail */}
          {selected && (
            <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: "white", borderRadius: 14, padding: "20px 24px", boxShadow: "var(--shadow-sm)", border: `2px solid ${(RISK_CONFIG[selected.risk_level] || RISK_CONFIG.MODERATE).border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--teal-900)" }}>{selected.patient_name || selected.patient_id}</h3>
                    <p style={{ fontSize: 13, color: "var(--slate-500)", marginTop: 2 }}>{new Date(selected.created_at).toLocaleString()}</p>
                  </div>
                  <span style={{ padding: "5px 14px", borderRadius: 99, background: (RISK_CONFIG[selected.risk_level] || {}).bg, color: (RISK_CONFIG[selected.risk_level] || {}).color, fontSize: 13, fontWeight: 700 }}>{selected.risk_level}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
                  {[
                    { l: "PHQ-9", v: `${selected.phq9_score}/27`, s: risk_severity_phq9(selected.phq9_score) },
                    { l: "GAD-7", v: `${selected.gad7_score}/21`, s: risk_severity_gad7(selected.gad7_score) },
                    { l: "Mood", v: `${selected.mood_score}/10`, s: "Self-reported" },
                    { l: "Depression", v: `${Math.round(selected.depression_probability * 100)}%`, s: "AI estimate" },
                    { l: "Anxiety", v: `${Math.round(selected.anxiety_probability * 100)}%`, s: "AI estimate" },
                    { l: "Emotion", v: (selected.primary_emotion || "").charAt(0).toUpperCase() + (selected.primary_emotion || "").slice(1), s: "Primary" },
                  ].map((m, i) => (
                    <div key={i} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontSize: 11, color: "var(--slate-500)" }}>{m.l}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--teal-700)" }}>{m.v}</div>
                      <div style={{ fontSize: 11, color: "var(--slate-400)" }}>{m.s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mini charts */}
              <div style={{ background: "white", borderRadius: 14, padding: "18px 20px", boxShadow: "var(--shadow-sm)", border: "1px solid var(--teal-100)" }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--teal-900)", marginBottom: 14 }}>Risk Profile</h4>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[
                    { name: "Depression", value: Math.round(selected.depression_probability * 100), fill: "#6366f1" },
                    { name: "Anxiety", value: Math.round(selected.anxiety_probability * 100), fill: "#f59e0b" },
                    { name: "PHQ-9 %", value: Math.round(selected.phq9_score / 27 * 100), fill: "#0ea5e9" },
                    { name: "GAD-7 %", value: Math.round(selected.gad7_score / 21 * 100), fill: "#22c55e" },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis domain={[0, 100]} fontSize={11} />
                    <Tooltip formatter={v => [`${v}%`]} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {[{ fill: "#6366f1" }, { fill: "#f59e0b" }, { fill: "#0ea5e9" }, { fill: "#22c55e" }].map((c, i) => <Cell key={i} fill={c.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <button onClick={() => {
                const url = `${API_BASE}/reports/${selected.assessment_id}/pdf`;
                window.open(url, '_blank');
              }} style={{ padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0d4f6c, #1a7a9a)", color: "white", fontWeight: 600, fontSize: 15 }}>
                📄 Download PDF Report
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function risk_severity_phq9(s) {
  if (s <= 4) return "Minimal"; if (s <= 9) return "Mild"; if (s <= 14) return "Moderate"; if (s <= 19) return "Mod. Severe"; return "Severe";
}
function risk_severity_gad7(s) {
  if (s <= 4) return "Minimal"; if (s <= 9) return "Mild"; if (s <= 14) return "Moderate"; return "Severe";
}

function generateMockResult(patientId, conversation, phq9, gad7, mood) {
  const phq9Score = phq9.reduce((a, b) => a + b, 0);
  const gad7Score = gad7.reduce((a, b) => a + b, 0);
  const riskScore = (phq9Score / 27 * 0.5 + gad7Score / 21 * 0.3 + (10 - mood) / 9 * 0.2);
  const rl = riskScore > 0.7 ? "CRITICAL" : riskScore > 0.5 ? "HIGH" : riskScore > 0.3 ? "MODERATE" : "LOW";

  return {
    assessment_id: `demo_${Date.now()}`,
    patient_id: patientId,
    patient_name: patientId,
    created_at: new Date().toISOString(),
    phq9_score: phq9Score,
    phq9_answers: phq9,
    gad7_score: gad7Score,
    gad7_answers: gad7,
    mood_score: mood,
    nlp_features: {
      sentiment_score: -0.35, sentiment_label: "NEGATIVE",
      emotion_label: "sadness", emotion_confidence: 0.67,
      emotion_distribution: { sadness: 0.45, fear: 0.25, anger: 0.1, joy: 0.05, disgust: 0.05, surprise: 0.05, neutral: 0.05 },
      negative_keyword_count: 4, hopelessness_indicators: 1,
      stress_indicators: 2, sleep_related_words: 1, self_harm_related_terms: 0,
      detected_keywords: ["overwhelmed", "tired", "anxious", "sad"],
      psychological_markers: ["elevated_stress", "sleep_disturbance"]
    },
    risk_assessment: {
      depression_probability: Math.min(phq9Score / 27 * 1.3, 0.99),
      anxiety_probability: Math.min(gad7Score / 21 * 1.3, 0.99),
      risk_level: rl,
      risk_score: riskScore,
      contributing_factors: [
        phq9Score >= 10 ? `PHQ-9 score of ${phq9Score} indicates clinically significant depression` : `PHQ-9 score: ${phq9Score}`,
        gad7Score >= 10 ? `GAD-7 score of ${gad7Score} indicates clinically significant anxiety` : `GAD-7 score: ${gad7Score}`,
        `Reported mood score: ${mood}/10`,
      ],
      phq9_severity: risk_severity_phq9(phq9Score),
      gad7_severity: risk_severity_gad7(gad7Score),
    },
    report: {
      patient_id: patientId,
      generated_at: new Date().toISOString(),
      disclaimer: "This is an AI-generated pre-screening report intended to assist licensed mental health professionals. It does NOT constitute a diagnosis.",
      metadata: {
        risk_level: rl, depression_probability: Math.min(phq9Score / 27, 0.99),
        anxiety_probability: Math.min(gad7Score / 21, 0.99),
        phq9_score: phq9Score, phq9_severity: risk_severity_phq9(phq9Score),
        gad7_score: gad7Score, gad7_severity: risk_severity_gad7(gad7Score),
        mood_score: mood, primary_emotion: "sadness", sentiment: "NEGATIVE",
        detected_keywords: ["overwhelmed", "tired", "anxious"],
        psychological_markers: ["elevated_stress"],
      },
      sections: {
        emotional_overview: `The patient presented with a predominantly negative emotional tone throughout the assessment. Sentiment analysis revealed distress indicators consistent with moderate mood disruption. Self-reported mood of ${mood}/10 indicates ${mood <= 4 ? "significant" : mood <= 6 ? "moderate" : "mild"} subjective emotional distress.\n\nThe primary emotion detected was sadness with notable co-occurring fear patterns, suggesting a mixed anxiety-depressive presentation. This is consistent with the questionnaire responses provided.\n\nThe patient's presentation warrants ${RISK_CONFIG[rl]?.label?.toLowerCase()} clinical attention based on the composite analysis of all available data.`,
        behavioral_observations: `Language analysis revealed patterns consistent with emotional avoidance and rumination. The patient described difficulty managing daily responsibilities and interpersonal functioning, which is commonly associated with both depressive and anxiety disorders.\n\nNeurovegetative indicators including fatigue, sleep disruption, and concentration difficulties were identified in both free-text responses and standardized questionnaire items.\n\nThe patient demonstrated adequate insight into their difficulties, which is a positive prognostic indicator for treatment engagement.`,
        depression_risk_analysis: `PHQ-9 Score: ${phq9Score}/27 (${risk_severity_phq9(phq9Score)} range).\n\n${phq9Score >= 10 ? "This score exceeds the clinical significance threshold of 10, indicating probable depressive disorder requiring further evaluation." : "This score falls below the clinical significance threshold, though subthreshold depression may still impact functioning and quality of life."}\n\nAlgorithmic depression probability: ${Math.round(Math.min(phq9Score / 27 * 130, 99))}%. This estimate accounts for PHQ-9 responses, conversational sentiment, and hopelessness language patterns detected during the assessment.`,
        anxiety_risk_analysis: `GAD-7 Score: ${gad7Score}/21 (${risk_severity_gad7(gad7Score)} range).\n\n${gad7Score >= 10 ? "This score exceeds the clinical significance threshold, indicating probable generalized anxiety disorder or significant anxiety symptoms requiring clinical attention." : "This score falls below the clinical significance threshold, though anxiety symptoms may still be impairing functioning."}\n\nAlgorithmic anxiety probability: ${Math.round(Math.min(gad7Score / 21 * 130, 99))}%. Fear and stress language patterns were detected during the conversational assessment.`,
        warning_signs: phq9Score >= 15 || gad7Score >= 15 ? `Elevated questionnaire scores across both PHQ-9 and GAD-7 require prompt clinical review.\n\n• PHQ-9 score of ${phq9Score} — ${risk_severity_phq9(phq9Score)} depression range\n• GAD-7 score of ${gad7Score} — ${risk_severity_gad7(gad7Score)} anxiety range\n• Mood self-report of ${mood}/10 indicates significant subjective distress\n\nPrompt clinical follow-up is recommended.` : `No critical warning signs were detected in this assessment. Standard monitoring protocols are appropriate at this time.\n\nRoutine follow-up recommended within 2-4 weeks to assess symptom trajectory.`,
        recommended_next_steps: `1. ${rl === "CRITICAL" || rl === "HIGH" ? "Schedule urgent psychiatric evaluation within 48 hours" : "Schedule follow-up appointment within 1-2 weeks"}\n2. ${phq9Score >= 10 ? "Conduct formal clinical diagnostic interview for depressive disorders" : "Monitor PHQ-9 scores at next appointment"}\n3. ${gad7Score >= 10 ? "Evaluate for generalized anxiety disorder; consider CBT referral" : "Review anxiety symptoms and functional impact"}\n4. Provide patient with psychoeducation about mental health resources\n5. Assess safety and social support network`,
        consultation_recommendation: `${rl === "CRITICAL" ? "URGENT — SAME DAY CONSULTATION REQUIRED\n\nImmediate psychiatric assessment is warranted." : rl === "HIGH" ? "HIGH PRIORITY — CONSULTATION WITHIN 48 HOURS\n\nPrompt psychiatric or clinical psychology evaluation recommended." : rl === "MODERATE" ? "RECOMMENDED — CONSULTATION WITHIN 1-2 WEEKS\n\nMental health professional evaluation is advised." : "ROUTINE — Standard follow-up with primary care or mental health provider within 4 weeks."}\n\nRecommended provider: ${rl === "CRITICAL" || rl === "HIGH" ? "Psychiatrist or Crisis Mental Health Team" : "Licensed Therapist, Psychologist, or Primary Care Physician"}`
      }
    }
  };
}

// Demo data for dashboard
const DEMO_PATIENTS = [
  { patient_id: "P001", patient_name: "Alex M.", assessment_id: "a001", created_at: new Date(Date.now() - 3600000).toISOString(), risk_level: "HIGH", depression_probability: 0.78, anxiety_probability: 0.65, phq9_score: 17, gad7_score: 14, mood_score: 3, primary_emotion: "Sadness" },
  { patient_id: "P002", patient_name: "Jordan K.", assessment_id: "a002", created_at: new Date(Date.now() - 7200000).toISOString(), risk_level: "MODERATE", depression_probability: 0.48, anxiety_probability: 0.52, phq9_score: 11, gad7_score: 10, mood_score: 5, primary_emotion: "Fear" },
  { patient_id: "P003", patient_name: "Sam R.", assessment_id: "a003", created_at: new Date(Date.now() - 14400000).toISOString(), risk_level: "CRITICAL", depression_probability: 0.91, anxiety_probability: 0.85, phq9_score: 23, gad7_score: 18, mood_score: 2, primary_emotion: "Sadness" },
  { patient_id: "P004", patient_name: "Morgan T.", assessment_id: "a004", created_at: new Date(Date.now() - 86400000).toISOString(), risk_level: "LOW", depression_probability: 0.18, anxiety_probability: 0.22, phq9_score: 4, gad7_score: 3, mood_score: 8, primary_emotion: "Joy" },
  { patient_id: "P005", patient_name: "Casey L.", assessment_id: "a005", created_at: new Date(Date.now() - 172800000).toISOString(), risk_level: "MODERATE", depression_probability: 0.42, anxiety_probability: 0.58, phq9_score: 9, gad7_score: 11, mood_score: 6, primary_emotion: "Fear" },
];

const DEMO_STATS = {
  total_assessments: 5, critical_count: 1, high_count: 1, moderate_count: 2, low_count: 1,
  avg_phq9: 12.8, avg_gad7: 11.2, avg_mood: 4.8
};
