"""
LLM Service for Adaptive Chat and Personalized Reports
- Integrates with Gemini (Free Tier) and Anthropic (Paid)
- Provides fallback logic for adaptive questioning
"""

import os
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY", "")
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
        
        # Check availability
        self.has_gemini = bool(self.gemini_key and "your_" not in self.gemini_key)
        self.has_anthropic = bool(self.anthropic_key and "your_" not in self.anthropic_key)
        self.is_available = self.has_gemini or self.has_anthropic
        
    async def get_next_question(self, conversation: List[Dict[str, str]]) -> str:
        """Determines next adaptive question using Gemini first, then Anthropic."""
        if not self.is_available:
            return self._get_fallback_question(conversation)
            
        try:
            # 1. Try Gemini (Free Tier)
            if self.has_gemini:
                return await self._get_gemini_question(conversation)
            
            # 2. Try Anthropic (Paid)
            if self.has_anthropic:
                return await self._get_anthropic_question(conversation)
                
        except Exception as e:
            logger.error(f"LLM Chat Error: {e}")
            return self._get_fallback_question(conversation)

    async def summarize_conversation(self, conversation: List[Dict[str, str]]) -> str:
        """Generates a clinical summary of the user's responses."""
        if not self.is_available:
            # Fallback: simple join
            user_msgs = [m['content'] for m in conversation if m['role'] == 'user']
            return " ".join(user_msgs[:5])[:600]

        try:
            prompt = """You are a clinical psychologist. Summarize the following conversation history into a concise, professional clinical summary (max 150 words). 
Focus on the patient's emotional state, key concerns mentioned, and any significant behavioral markers. 
Maintain a neutral, clinical tone.

CONVERSATION:
"""
            history = "\n".join([f"{m['role']}: {m['content']}" for m in conversation])
            
            if self.has_gemini:
                import google.generativeai as genai
                genai.configure(api_key=self.gemini_key)
                model = genai.GenerativeModel('gemini-1.5-flash')
                response = model.generate_content(prompt + history)
                return response.text.strip()
            
            elif self.has_anthropic:
                import anthropic
                client = anthropic.Anthropic(api_key=self.anthropic_key)
                message = client.messages.create(
                    model="claude-3-haiku-20240307",
                    max_tokens=300,
                    messages=[{"role": "user", "content": prompt + history}]
                )
                return message.content[0].text
                
        except Exception as e:
            logger.error(f"LLM Summary Error: {e}")
            user_msgs = [m['content'] for m in conversation if m['role'] == 'user']
            return " ".join(user_msgs[:5])[:600]

    async def _get_gemini_question(self, conversation: List[Dict[str, str]]) -> str:
        import google.generativeai as genai
        genai.configure(api_key=self.gemini_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        history = "\n".join([f"{m['role']}: {m['content']}" for m in conversation])
        prompt = f"""You are MindScreen, an empathetic mental health screening assistant.
Review the conversation history below and ask ONE highly personalized, empathetic follow-up question.
The goal is to encourage the patient to elaborate on their feelings or specific challenges they mentioned.
Avoid generic questions; instead, reference something they just said if possible.
Keep the tone supportive and professional. Do not diagnose.

CONVERSATION HISTORY:
{history}

NEXT PERSONALIZED QUESTION:"""
        
        response = model.generate_content(prompt)
        return response.text.strip()

    async def _get_anthropic_question(self, conversation: List[Dict[str, str]]) -> str:
        import anthropic
        client = anthropic.Anthropic(api_key=self.anthropic_key)
        history = "\n".join([f"{m['role']}: {m['content']}" for m in conversation])
        prompt = f"""You are MindScreen, an empathetic mental health screening assistant.
Review the conversation history below and ask ONE highly personalized, empathetic follow-up question.
The goal is to encourage the patient to elaborate on their feelings or specific challenges they mentioned.
Reference their previous input to make the conversation feel natural and personalized.
CONVERSATION HISTORY:
{history}

NEXT PERSONALIZED QUESTION:"""
        
        message = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

    def _get_fallback_question(self, conversation: List[Dict[str, str]]) -> str:
        user_msgs = [m['content'] for m in conversation if m['role'] == 'user']
        last_msg = user_msgs[-1].lower() if user_msgs else ""
        
        # Simple rule-based personalization
        if any(w in last_msg for w in ["sleep", "tired", "awake", "night"]):
            return "I hear you're having trouble with sleep. How has that been affecting your daily energy and concentration?"
        if any(w in last_msg for w in ["work", "job", "office", "stress"]):
            return "It sounds like work has been a significant factor lately. How are you managing the pressure there?"
        if any(w in last_msg for w in ["alone", "lonely", "family", "friends"]):
            return "Connections with others can be tough when you feel this way. Have you been able to talk to anyone close to you about this?"
        
        count = len(user_msgs)
        fallbacks = [
           "Could you tell me a bit more about how that specifically makes you feel during the day?",
           "When you feel this way, what usually goes through your mind?",
           "How have your energy levels been throughout the day lately?",
           "Have you noticed any changes in your interest in hobbies or activities you usually enjoy?",
           "Is there anything else you'd like to share about your recent mood?"
        ]
        return fallbacks[(count - 1) % len(fallbacks)]

llm_service = LLMService()
