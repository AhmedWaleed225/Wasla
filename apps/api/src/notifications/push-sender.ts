import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  token: string;
  title?: string;
  body: string;
  /** Opened by the app when the notification is tapped. Never put private data here. */
  data: Record<string, string>;
}

export interface PushResult {
  /** Tokens the push service says are no longer valid (app uninstalled, etc.). */
  invalidTokens: string[];
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult>;
}
export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** PUSH_PROVIDER=none: nothing leaves the server; the in-app inbox still works. */
@Injectable()
export class NoopPushSender implements PushSender {
  async send(): Promise<PushResult> {
    return { invalidTokens: [] };
  }
}

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/** Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export class ExpoPushSender implements PushSender {
  private readonly logger = new Logger('ExpoPush');
  private static readonly URL = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly accessToken?: string) {}

  async send(messages: PushMessage[]): Promise<PushResult> {
    const invalidTokens: string[] = [];
    // Expo accepts at most 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await fetch(ExpoPushSender.URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(
            batch.map((m) => ({ to: m.token, title: m.title, body: m.body, data: m.data, sound: 'default', priority: 'high' })),
          ),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          this.logger.warn(`Expo push returned HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as { data?: ExpoTicket[] };
        json.data?.forEach((ticket, idx) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[idx]!.token);
        });
      } catch (err) {
        this.logger.warn({ err }, 'Expo push request failed');
      }
    }
    return { invalidTokens };
  }
}
