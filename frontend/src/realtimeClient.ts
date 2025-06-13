import { RealtimeSession, RealtimeAgent, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';

type Listener<Args extends any[]> = (...args: Args) => void;

class MiniEmitter<Events extends Record<string, any[]>> {
  #events = new Map<keyof Events, Listener<any[]>[]>();
  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>) {
    const arr = this.#events.get(event) || [];
    arr.push(fn);
    this.#events.set(event, arr);
  }
  emit<K extends keyof Events>(event: K, ...args: Events[K]) {
    const arr = this.#events.get(event) || [];
    arr.forEach((fn) => fn(...args));
  }
}

export type ClientEvents = {
  connection_change: ['connected' | 'connecting' | 'disconnected'];
  raw_event: [any];
};

export interface RealtimeClientOptions {
  getEphemeralKey: () => Promise<string>;
  agent: RealtimeAgent;
  audioElement?: HTMLAudioElement;
}

export class RealtimeClient {
  #session: RealtimeSession | null = null;
  #events = new MiniEmitter<ClientEvents>();
  #options: RealtimeClientOptions;

  constructor(options: RealtimeClientOptions) {
    this.#options = options;
  }

  on<K extends keyof ClientEvents>(event: K, listener: (...args: ClientEvents[K]) => void) {
    this.#events.on(event, listener as any);
  }

  async connect() {
    if (this.#session) return;
    const ek = await this.#options.getEphemeralKey();
    const transportValue: any = this.#options.audioElement
      ? new OpenAIRealtimeWebRTC({ useInsecureApiKey: true, audioElement: this.#options.audioElement })
      : 'webrtc';
    this.#session = new RealtimeSession(this.#options.agent, { transport: transportValue });
    this.#events.emit('connection_change', 'connecting');
    const transport: any = this.#session.transport;
    transport.on('*', (event: any) => this.#events.emit('raw_event', event));
    transport.on('connection_change', (status: any) => {
      if (status === 'disconnected') this.#events.emit('connection_change', 'disconnected');
    });
    await this.#session.connect({ apiKey: ek });
    this.#events.emit('connection_change', 'connected');
  }

  disconnect() {
    this.#session?.close();
    this.#session = null;
    this.#events.emit('connection_change', 'disconnected');
  }

  sendUserText(text: string) {
    if (!this.#session) throw new Error('not connected');
    this.#session.sendMessage(text);
  }

  pushToTalkStart() {
    this.#session?.transport.sendEvent({ type: 'input_audio_buffer.clear' } as any);
  }

  pushToTalkStop() {
    this.#session?.transport.sendEvent({ type: 'input_audio_buffer.commit' } as any);
    this.#session?.transport.sendEvent({ type: 'response.create' } as any);
  }

  interrupt() {
    this.#session?.transport.interrupt();
  }
}