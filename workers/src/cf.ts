export interface Queue<T = unknown> {
  send(message: T): Promise<void>;
}

export interface Message<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}

export interface MessageBatch<T = unknown> {
  messages: Message<T>[];
}

export interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ForwardableEmailMessage {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
}
