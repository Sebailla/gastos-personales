// Re-exports the typed event payloads and the `UserRegistered` /
// `UserSignedIn` event-name constants for downstream consumers.
// Keeping the constants in their own file lets cross-module
// subscribers import the name without pulling in the
// dispatcher's internals.

export type {
  DomainEvent,
  UserRegisteredPayload,
  UserSignedInPayload,
} from './event-dispatcher';
export { UserRegistered, UserSignedIn } from './event-dispatcher';
