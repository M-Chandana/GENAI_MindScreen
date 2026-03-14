import asyncio
import os
from dotenv import load_dotenv

load_dotenv()
print("GEMINI_API_KEY from os:", os.getenv("GEMINI_API_KEY"))

from services.llm_service import llm_service

async def main():
    q = await llm_service.get_next_question([{'role':'user', 'content':'i feel tired and stressed constantly'}])
    print("Question:", q)

asyncio.run(main())
