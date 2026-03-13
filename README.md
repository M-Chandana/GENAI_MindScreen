# 🧠 MindScreen — AI-Powered Mental Health Pre-Assessment System

> A production-grade, AI-powered mental health screening platform with chatbot-based psychological assessment, NLP analysis, risk stratification, and clinical report generation.

---

## ⚠️ Medical Disclaimer

**MindScreen is a clinical DECISION SUPPORT TOOL — not a diagnostic system.**  
All AI-generated reports must be reviewed by a licensed mental health professional before any clinical decisions are made. This software does not replace professional psychiatric evaluation.

If anyone is in immediate danger, please contact emergency services (911 in the US) or a crisis hotline immediately.

---

## 🏗️ Architecture Overview

```
User → Chatbot (React + Web Speech API) 
     → FastAPI Backend 
     → Adaptive LLM Layer (Claude/Local)
     → NLP Pipeline (BERT + RoBERTa + SBERT)
     → Feature Fusion Module
     → Risk Classifier (Logistic Regression)
     → Report Generator (BART / Claude)
     → Psychiatrist Dashboard
     → PDF Export (ReportLab)
```

---

## 📁 Project Structure

```
mindscreen/
├── backend/
│   ├── main.py                      # FastAPI app entry point
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                 # Environment config template
│   ├── api/
│   │   ├── database.py              # MongoDB connection
│   │   └── routes/
│   │       ├── assessment.py        # Core assessment pipeline
│   │       ├── dashboard.py         # Clinician dashboard API
│   │       ├── reports.py           # PDF generation endpoint
│   │       └── auth.py              # Authentication
│   ├── models/
│   │   └── schemas.py               # Pydantic data models
│   └── services/
│       ├── nlp_service.py           # BERT/RoBERTa/SBERT NLP pipeline
│       ├── risk_service.py          # Feature fusion + Logistic Regression
│       ├── report_service.py        # AI report generation
│       └── pdf_service.py           # ReportLab PDF export
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx                 # React entry point
│       └── App.jsx                  # Complete frontend application
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+
- MongoDB (optional — falls back to in-memory)
- 8GB+ RAM (for NLP models)

---

### Backend Setup

```bash
# 1. Navigate to backend directory
cd mindscreen/backend

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate       # Linux/Mac
# venv\Scripts\activate        # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Download spaCy language model
python -m spacy download en_core_web_sm

# 5. Configure environment
cp .env.example .env
# Edit .env with your settings (MongoDB URL, Anthropic API key, etc.)

# 6. Start the backend server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: http://localhost:8000  
Interactive docs at: http://localhost:8000/docs

---

### Frontend Setup

```bash
# 1. Navigate to frontend directory
cd mindscreen/frontend

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev
```

The frontend will be available at: http://localhost:3000

---

### MongoDB Setup (Optional)

```bash
# Using Docker (recommended)
docker run -d --name mindscreen-mongo -p 27017:27017 mongo:7

# Or install locally: https://www.mongodb.com/docs/manual/installation/
```

> **Note:** The system works without MongoDB using in-memory storage. Data will be lost on server restart.

---

## 🔑 Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| Clinician | `doctor` | `doctor123` |
| Patient | `patient` | `patient123` |
| Admin | `admin` | `admin123` |

---

## 🤖 NLP Models Used

| Model | Task | Source |
|-------|------|--------|
| `cardiffnlp/twitter-roberta-base-sentiment-latest` | Sentiment Analysis | HuggingFace |
| `j-hartmann/emotion-english-distilroberta-base` | Emotion Detection | HuggingFace |
| `all-MiniLM-L6-v2` | Sentence Embeddings | Sentence-Transformers |

> Models are automatically downloaded on first use. Requires ~2GB disk space and 4-8GB RAM.

### Running Without Heavy Models

The system includes a **rule-based fallback** that activates automatically if the transformer models can't be loaded. This allows the system to run on minimal hardware while still providing functional assessments.

---

## 📊 Assessment Pipeline

### 1. Input Layer (Voice-Enabled Chatbot)
- **🎙️ Voice Interaction**: 
    - **Speech-to-Text (STT)**: Use your voice to express feelings naturally.
    - **Text-to-Speech (TTS)**: The AI assistant reads out messages for an immersive experience.
- **🧠 Adaptive AI Exploration**:
    - Unlike static bots, MindScreen uses an LLM to ask **dynamic, personalized follow-up questions** based on your initial input.
- **Validated Questionnaires**:
    - PHQ-9 (9 questions, 0-3 each = 0-27 total)
    - GAD-7 (7 questions, 0-3 each = 0-21 total)
- **Mood Rating**: Instant self-scaling (1-10)

### 2. Data Processing Layer
```
Conversation Text
  → BERT Sentiment Analysis (score: -1 to +1)
  → RoBERTa Emotion Classification (6 emotions)
  → Keyword Feature Extraction
      - Hopelessness indicators
      - Stress markers
      - Sleep disturbance language
      - Self-harm language (⚠️ triggers CRITICAL flag)
```

### 3. Feature Fusion Module
Combines 18 features:
- NLP features (sentiment, emotion, keywords)
- Questionnaire scores (PHQ-9, GAD-7, mood)
- Derived clinical indicators

### 4. Risk Classification (Logistic Regression)
```
Output:
  - Depression probability (0-100%)
  - Anxiety probability (0-100%)
  - Risk Level: LOW | MODERATE | HIGH | CRITICAL
```

Risk scoring thresholds:
- **LOW**: risk_score < 0.35
- **MODERATE**: 0.35 ≤ risk_score < 0.55
- **HIGH**: 0.55 ≤ risk_score < 0.75
- **CRITICAL**: risk_score ≥ 0.75 OR any self-harm language detected

### 5. Intelligence Layer (Report)
Generates 7-section clinical report:
1. Emotional Overview
2. Behavioral Observations
3. Depression Risk Analysis
4. Anxiety Risk Analysis
5. Warning Signs
6. Recommended Next Steps
7. Professional Consultation Recommendation

---

## 🎛️ API Endpoints

### Assessment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/assessment/submit` | Run full assessment pipeline |
| GET | `/api/assessment/{id}` | Get assessment by ID |
| GET | `/api/assessment/patient/{patient_id}` | Get patient's assessments |
| GET | `/api/assessment/` | List all assessments |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Aggregate statistics |
| GET | `/api/dashboard/patients` | Patient list with risk levels |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/{id}/pdf` | Download PDF report |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (returns JWT token) |
| POST | `/api/auth/register` | Register new user |

---

## 🔧 Configuration

### Adding Anthropic AI Report Generation

1. Get an API key from https://console.anthropic.com
2. Add to `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Reports will now use Claude for clinical narrative generation

### MongoDB Integration

Update `.env`:
```
MONGO_URL=mongodb://localhost:27017
DATABASE_NAME=mindscreen
```

---

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d
```

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongo_data:/data/db"]
  
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: ./backend/.env
    depends_on: [mongo]
  
  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [backend]

volumes:
  mongo_data:
```

---

## 🧪 Demo Mode

The frontend includes a full **Demo Mode** that works without the backend server:
- Simulates the complete assessment flow
- Generates realistic mock results based on questionnaire scores
- Shows all charts and visualizations
- Demonstrates the psychiatrist dashboard with sample patients

Click **"▶ Demo Mode"** on the landing page to try it.

---

## 🔒 Security Considerations

For production deployment:
1. Enable HTTPS (use Let's Encrypt / nginx)
2. Use bcrypt for password hashing (replace current SHA-256)
3. Set strong `SECRET_KEY` in `.env`
4. Configure CORS for your specific domain
5. Enable MongoDB authentication
6. Add rate limiting for API endpoints
7. Implement audit logging for HIPAA compliance
8. Use environment variables for all secrets

---

## 📋 PHQ-9 Severity Guide

| Score | Severity | Recommended Action |
|-------|----------|-------------------|
| 1-4 | Minimal | Monitor |
| 5-9 | Mild | Watchful waiting |
| 10-14 | Moderate | Treatment plan |
| 15-19 | Moderately Severe | Active treatment |
| 20-27 | Severe | Immediate referral |

## 📋 GAD-7 Severity Guide

| Score | Severity | Recommended Action |
|-------|----------|-------------------|
| 1-4 | Minimal | Monitor |
| 5-9 | Mild | Watchful waiting |
| 10-14 | Moderate | Treatment plan |
| 15-21 | Severe | Active treatment |

---

## 🛣️ Roadmap

- [ ] FHIR integration for EHR compatibility
- [ ] Multi-language support
- [ ] Longitudinal tracking (trend charts over time)
- [ ] Video assessment with facial expression analysis
- [ ] Integration with teletherapy platforms
- [ ] Clinician annotation and case notes
- [ ] Outcome tracking (post-treatment reassessment)
- [ ] Mobile app (React Native)

---

## 📄 License

MIT License — For research and educational use.  
**NOT certified for clinical use without appropriate regulatory approval.**

---

## 🆘 Crisis Resources

If you or someone you know is in crisis:
- **US National Suicide Prevention Lifeline**: 988
- **Crisis Text Line**: Text HOME to 741741
- **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/
