
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
    "12"
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



# class OpenAIRequestBody(BaseModel):
#     model: str | None = None
#     input: List[Dict[str, Any]] | None = None
#     text: Dict[str, Any] | None = None
#     extra_data: Dict[str, Any] = Field(default_factory=dict, alias='extra_data')
#
#     class Config:
#         extra = 'allow'


# @app.post("/api/responses")
# async def proxy_openai_responses(request: Request):
#     """
#     Проксирует запросы к OpenAI Responses API (parse или create).
#     """
#     body = await request.json()
#
#     # Определяем, какой метод вызывать: parse или create
#     is_structured = body.get("text", {}).get("format", {}).get("type") == 'json_schema'
#
#     try:
#         if is_structured:
#             # openai.responses.parse не является async, но мы можем запустить его в потоке,
#             # чтобы не блокировать event loop. Но для простоты пока оставим так.
#             # В SDK openai > 1.0 эти методы стали синхронными
#             response = openai_client.beta.responses.parse(**body)
#         else:
#             response = openai_client.beta.responses.create(**body)
#
#         # Pydantic v2+ модели нужно конвертировать в dict для JSON-ответа
#         return response.model_dump()
#
#     except Exception as e:
#         print(f"Ошибка в прокси для OpenAI Responses: {e}")
#         raise HTTPException(status_code=500, detail={"error": "failed"})
#
# # Команда для запуска сервера: uvicorn main:app --reload --port 8000