import asyncio
from dotenv import load_dotenv
load_dotenv()
from services.llm_service import llm_service
import traceback

async def main():
    try:
        q = await llm_service._get_gemini_question([{'role':'user', 'content':'tired'}])
        print(q)
    except Exception as e:
        with open("error.log", "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())

asyncio.run(main())
