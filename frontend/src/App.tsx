import { useState, useRef, useEffect } from 'react';
import { RealtimeClient } from './realtimeClient';
import { RealtimeAgent } from '@openai/agents/realtime';

// Типы для нашего приложения
type TranscriptItem = { id: string; role: 'user' | 'assistant'; text: string; };
type SessionStatus = 'disconnected' | 'connecting' | 'connected';

// URL бэкенда из переменных окружения
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Простой агент, с которым мы будем общаться
const chatAgent = new RealtimeAgent({
    name: 'VoiceAssistant',
    voice: 'shimmer', // Популярный мужской голос. Другие варианты: 'alloy', 'echo', 'fable', 'onyx', 'nova'
    instructions: 'You are a friendly and helpful voice assistant. Keep your responses concise and conversational.',
    tools: [],
    handoffs: [],
});

function App() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [isTalking, setIsTalking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<RealtimeClient | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Создаем аудио элемент при первом рендере
  useEffect(() => {
    if (!audioElementRef.current) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      audioElementRef.current = audio;
    }
  }, []);

  // Функция для безопасного обновления транскрипта
  const addOrUpdateTranscript = (id: string, role: 'user' | 'assistant', text: string, isDelta: boolean) => {
    setTranscript(prev => {
        const existingIndex = prev.findIndex(t => t.id === id);
        // Если элемент уже есть в списке
        if (existingIndex > -1) {
            const updated = [...prev];
            // Если это delta (часть), дописываем текст. Иначе - заменяем.
            updated[existingIndex].text = isDelta ? updated[existingIndex].text + text : text;
            return updated;
        }
        // Если элемента нет, добавляем новый
        return [...prev, { id, role, text }];
    });
  };

  // Получаем временный ключ сессии с нашего FastAPI бэкенда
  const fetchEphemeralKey = async (): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/session`);
    if (!response.ok) {
        // Пробуем прочитать тело ответа, чтобы понять ошибку
        const errorBody = await response.text();
        console.error("Failed to fetch session key. Response body:", errorBody);
        throw new Error('Failed to fetch session key. Is the backend running?');
    }
    const data = await response.json();
    return data.client_secret.value;
  };

  const connect = async () => {
    if (clientRef.current) return;
    setError(null);
    setTranscript([]);

    try {
      const client = new RealtimeClient({
        getEphemeralKey: fetchEphemeralKey,
        agent: chatAgent,
        audioElement: audioElementRef.current!,
      });

      client.on('connection_change', setSessionStatus);

      // Главный обработчик всех событий от OpenAI
      client.on('raw_event', (event) => {
        // console.log('[Realtime Event]', event); // Раскомментируйте для глубокой отладки

        // Потоковая транскрипция речи пользователя
        if (event.type === 'conversation.input_audio_transcription.delta') {
            addOrUpdateTranscript(event.item_id, 'user', event.delta, true);
        }
        // Завершенная транскрипция речи пользователя
        else if (event.type === 'conversation.item.input_audio_transcription.completed') {
            addOrUpdateTranscript(event.item_id, 'user', event.transcript, false);
        }
        // Потоковый текстовый ответ ассистента
        else if (event.type === 'response.text.delta') {
            addOrUpdateTranscript(event.item_id, 'assistant', event.delta, true);
        }
        // Завершенное сообщение от ассистента
        else if (event.type === 'conversation.item.message.completed' && event.item?.role === 'assistant') {
             const textContent = (event.item.content || []).map((c: any) => c.text || '').join('').trim();
             if (textContent) {
                addOrUpdateTranscript(event.item.id, 'assistant', textContent, false);
             }
        }
      });

      clientRef.current = client;
      await client.connect();
    } catch (err) {
      console.error("Connection failed:", err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError("Permission to use microphone was denied. Please check your browser settings.");
        } else {
          setError(err.message);
        }
      } else {
        setError("An unknown error occurred during connection.");
      }
      setSessionStatus('disconnected');
      clientRef.current = null;
    }
  };

  const disconnect = () => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setTranscript([]);
    setSessionStatus('disconnected');
  };

  const handleTalkButtonDown = () => {
    if (sessionStatus !== 'connected' || !clientRef.current) return;
    clientRef.current.interrupt(); // Прерываем ассистента, если он говорит
    clientRef.current.pushToTalkStart();
    setIsTalking(true);
  };

  const handleTalkButtonUp = () => {
    if (sessionStatus !== 'connected' || !clientRef.current) return;
    clientRef.current.pushToTalkStop();
    setIsTalking(false);
  };

  const getStatusColor = () => {
    if(sessionStatus === 'connected') return 'text-green-500';
    if(sessionStatus === 'connecting') return 'text-yellow-500';
    return 'text-red-500';
  }

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <h1 className="text-4xl font-bold mb-2">Voice-to-Voice Chat</h1>
      <p className="mb-6">
        Status: <span className={`font-bold ${getStatusColor()}`}>{sessionStatus}</span>
      </p>

      {error && (
        <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded-lg relative mb-4 max-w-2xl text-center" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="w-full max-w-2xl h-3/5 bg-gray-800 rounded-lg p-4 overflow-y-auto mb-6 border border-gray-700 flex flex-col-reverse">
        {/* Пустой div для прокрутки вниз */}
        <div>
          {[...transcript].reverse().map((item) => (
            <div key={item.id} className={`mb-3 flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`inline-block px-3 py-2 rounded-lg max-w-md ${item.role === 'user' ? 'bg-blue-600' : 'bg-gray-600'}`}>
                <strong className="font-semibold capitalize">{item.role}:</strong> {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {sessionStatus === 'disconnected' ? (
          <button onClick={connect} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors">
            Connect
          </button>
        ) : (
          <button onClick={disconnect} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-lg transition-colors">
            Disconnect
          </button>
        )}

        <button
          onMouseDown={handleTalkButtonDown}
          onMouseUp={handleTalkButtonUp}
          // onTouchStart={handleTalkButtonDown}
          onTouchEnd={handleTalkButtonUp}
          disabled={sessionStatus !== 'connected'}
          className={`px-8 py-4 rounded-full font-bold text-xl transition-all duration-200
            ${isTalking ? 'bg-yellow-400 text-black scale-110' : 'bg-blue-600 text-white'}
            ${sessionStatus !== 'connected' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}`}
        >
          {/*{isTalking ? 'Listening...' : 'Hold to Talk'}*/}
        </button>
      </div>
    </div>
  );
}

export default App;