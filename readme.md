# VoiceToVoice

## Установка и запуск

```bash
git clone https://github.com/monlaf-sfk/VoiceToVoice.git
cd VoiceToVoice
```

Создайте файл `.env` в корне проекта и добавьте в него следующие переменные:

```
# Ваш ключ API от OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Порт, на котором будет доступно приложение (по умолчанию 80)
APP_PORT=80

# URL для API, который будет встроен во фронтенд
VITE_API_URL=/api
```

Запустите приложение с помощью Docker Compose:

```bash
docker-compose up --build
```

> ⚠️ В текущей конфигурации приложение не будет работать при развертывании на удаленном сервере по IP-адресу или домену с использованием http.  
> API для доступа к микрофону и камере можно использовать только в "безопасном контексте" (Secure Context).
