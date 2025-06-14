
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    os.getenv("FRONTEND_URL", "http://localhost:5173"),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
except KeyError:
    raise RuntimeError("Переменная окружения OPENAI_API_KEY не найдена. Пожалуйста, создайте файл .env")


@app.get("/session")
async def create_session():
    """
    Создает сессию в OpenAI Realtime API и возвращает временный ключ.
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/sessions",
                headers={
                    "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-realtime-preview-2024-12-17",
                },
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            return data
    except httpx.HTTPStatusError as e:
        print(f"Ошибка при создании сессии OpenAI: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=e.response.json())
    except Exception as e:
        print(f"Неожиданная ошибка: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")



