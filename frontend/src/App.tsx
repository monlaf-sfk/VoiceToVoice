import { useState, useRef, useEffect } from 'react';
import { RealtimeClient } from './realtimeClient';
import { RealtimeAgent } from '@openai/agents/realtime';

// Типы для нашего приложения
type TranscriptItem = { id: string; role: 'user' | 'assistant'; text: string; };
type SessionStatus = 'disconnected' | 'connecting' | 'connected';

// URL бэкенда из переменных окружения
const API_BASE_URL = import.meta.env.VITE_API_URL;

// Агент, с которым мы будем общаться
const chatAgent = new RealtimeAgent({
    name: 'VoiceAssistant',
    voice: 'shimmer',
    instructions: 'You are a friendly and helpful voice assistant. Keep your responses concise and conversational.',
    tools: [],
    handoffs: [],
});

function App() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('disconnected');
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<RealtimeClient | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioElementRef.current) {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      audioElementRef.current = audio;
    }
  }, []);

  const addOrUpdateTranscript = (id: string, role: 'user' | 'assistant', text: string, isDelta: boolean) => {
    setTranscript(prev => {
        const existingIndex = prev.findIndex(t => t.id === id);
        if (existingIndex > -1) {
            const updated = [...prev];
            updated[existingIndex].text = isDelta ? updated[existingIndex].text + text : text;
            return updated;
        }
        return [...prev, { id, role, text }];
    });
  };

  const fetchEphemeralKey = async (): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/session`);
    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Failed to fetch session key. Response body:", errorBody);
        throw new Error('Failed to fetch session key from API.');
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

      // Обработчик событий остается, чтобы видеть, что происходит под капотом
      client.on('raw_event', (event) => {
        // Можно раскомментировать для отладки
        // console.log('[Realtime Event]', event);

        if (event.type === 'conversation.input_audio_transcription.delta') {
            addOrUpdateTranscript(event.item_id, 'user', event.delta, true);
        }
        else if (event.type === 'conversation.item.input_audio_transcription.completed') {
            addOrUpdateTranscript(event.item_id, 'user', event.transcript, false);
        }
        else if (event.type === 'response.text.delta') {
            addOrUpdateTranscript(event.item_id, 'assistant', event.delta, true);
        }
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
        setError(err.name === 'NotAllowedError' ? "Microphone permission denied." : err.message);
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

  const getStatusColor = () => {
    if (sessionStatus === 'connected') return 'text-green-500';
    if (sessionStatus === 'connecting') return 'text-yellow-500';
    return 'text-red-500';
  }

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
      <h1 className="text-4xl font-bold mb-2">Voice-to-Voice Chat</h1>
      <p className="mb-6">Status: <span className={`font-bold ${getStatusColor()}`}>{sessionStatus}</span></p>

      {error && (
        <div className="bg-red-900 border border-red-700 text-white px-4 py-3 rounded-lg relative mb-4 max-w-2xl text-center" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {/* Окно транскрипта остается, чтобы видеть, что происходит */}
      <div className="w-full max-w-2xl h-3/5 bg-gray-800 rounded-lg p-4 overflow-y-auto mb-6 border border-gray-700 flex flex-col-reverse">
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

      {/* --- МАКСИМАЛЬНО УПРОЩЕННЫЙ БЛОК УПРАВЛЕНИЯ --- */}
      <div className="flex items-center justify-center gap-4 h-20">
        {sessionStatus === 'disconnected' ? (
          <button onClick={connect} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold text-lg transition-colors">Connect</button>
        ) : (
          <button onClick={disconnect} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold text-lg transition-colors">Disconnect</button>
        )}
      </div>
    </div>
  );
}

export default App;