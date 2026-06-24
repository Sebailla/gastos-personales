import { logger } from '@/shared/logger/logger';

export type DomainEvent =
  | { type: 'UserRegistered'; payload: UserRegisteredPayload }
  | { type: 'UserSignedIn'; payload: UserSignedInPayload }
  | { type: 'TransactionRecorded'; payload: TransactionRecordedPayload };

export interface UserRegisteredPayload {
  userId: string;
  email: string;
  provider: 'local' | 'google';
  occurredAt: string;
}

export interface UserSignedInPayload {
  userId: string;
  provider: 'local' | 'google';
  occurredAt: string;
}

/**
 * Payload of the `TransactionRecorded` event. The transaction
 * service dispatches this once per successful create (REQ-TX-13,
 * BR-TX-11). No subscriber ships in v1; the union membership is
 * the contract — future `reports` and `snapshots` consumers can
 * subscribe without an interface change.
 */
export interface TransactionRecordedPayload {
  userId: string;
  transactionId: string;
  accountId: string;
  direction: 'INCOME' | 'EXPENSE';
  amountMinor: number;
  currency: 'ARS' | 'USD' | 'EUR';
  casa: 'OFICIAL' | 'BLUE' | 'MEP' | 'CCL' | 'CRIPTO' | 'TARJETA' | null;
  convertedAmountMinor: number;
  convertedCurrency: 'ARS' | 'USD' | 'EUR';
  occurredAt: string;
}

/** String constants for type-safe subscribers. */
export const UserRegistered = 'UserRegistered' as const;
export const UserSignedIn = 'UserSignedIn' as const;
export const TransactionRecorded = 'TransactionRecorded' as const;

type Handler<E extends DomainEvent> = (event: E) => void | Promise<void>;

/**
 * In-process event dispatcher. Subscribers are typed per
 * event-type. A subscriber that throws is caught, logged at
 * `warn`, and the dispatcher continues with the next
 * subscriber. Subscribers that return a promise are awaited
 * in registration order.
 */
export class EventDispatcher<E extends DomainEvent = DomainEvent> {
  private readonly subscribers: Map<E['type'], Set<Handler<E>>> = new Map();

  subscribe<T extends E['type']>(type: T, handler: Handler<Extract<E, { type: T }>>): void {
    let set = this.subscribers.get(type);
    if (!set) {
      set = new Set();
      this.subscribers.set(type, set);
    }
    set.add(handler as Handler<E>);
  }

  async dispatch(event: E): Promise<number> {
    const set = this.subscribers.get(event.type);
    if (!set) return 0;
    let count = 0;
    for (const handler of set) {
      try {
        await handler(event);
        count += 1;
      } catch (err) {
        logger.warn('event_subscriber_threw', {
          eventType: event.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return count;
  }
}

/** Process-wide singleton. The auth module publishes; other modules subscribe. */
export const dispatcher = new EventDispatcher();
