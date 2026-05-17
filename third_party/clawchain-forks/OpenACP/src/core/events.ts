/**
 * Centralized event name constants for all event systems in OpenACP.
 *
 * Three distinct event systems:
 *  - Hook     — Middleware pipeline hooks (middlewareChain.execute / ctx.registerMiddleware)
 *  - BusEvent — EventBus events (eventBus.emit / eventBus.on), cross-cutting concerns
 *  - SessionEv — Session TypedEmitter events (session.emit / session.on), per-session state
 */

import type { EventBusEvents } from './event-bus.js';
import type { SessionEvents } from './sessions/session.js';

// ---------------------------------------------------------------------------
// Middleware Hooks
// ---------------------------------------------------------------------------

/**
 * Names for all middleware pipeline hooks.
 * Used with middlewareChain.execute(Hook.X, ...) and ctx.registerMiddleware(Hook.X, ...).
 */
export const Hook = {
  // --- Message flow ---
  /** Incoming message from any adapter — modifiable, can block. */
  MESSAGE_INCOMING: 'message:incoming',
  /** Outgoing message before it reaches the adapter — modifiable, can block. */
  MESSAGE_OUTGOING: 'message:outgoing',

  // --- Agent / turn lifecycle ---
  /** Before a user prompt is sent to the agent — modifiable, can block. */
  AGENT_BEFORE_PROMPT: 'agent:beforePrompt',
  /** Before an agent event is dispatched — modifiable, can block. */
  AGENT_BEFORE_EVENT: 'agent:beforeEvent',
  /** After an agent event is dispatched — read-only, fire-and-forget. */
  AGENT_AFTER_EVENT: 'agent:afterEvent',
  /** Before the current prompt is cancelled — modifiable, can block. */
  AGENT_BEFORE_CANCEL: 'agent:beforeCancel',
  /** Before the agent is switched — modifiable, can block. */
  AGENT_BEFORE_SWITCH: 'agent:beforeSwitch',
  /** After the agent has been switched — read-only, fire-and-forget. */
  AGENT_AFTER_SWITCH: 'agent:afterSwitch',

  // --- Turn boundaries ---
  /** Turn started — read-only, fire-and-forget. */
  TURN_START: 'turn:start',
  /** Turn ended (always fires, even on error) — read-only, fire-and-forget. */
  TURN_END: 'turn:end',

  // --- Session lifecycle ---
  /** Before a new session is created — modifiable, can block. */
  SESSION_BEFORE_CREATE: 'session:beforeCreate',
  /** After a session is destroyed — read-only, fire-and-forget. */
  SESSION_AFTER_DESTROY: 'session:afterDestroy',

  // --- Permissions ---
  /** Before a permission request is shown to the user — modifiable, can block. */
  PERMISSION_BEFORE_REQUEST: 'permission:beforeRequest',
  /** After a permission request is resolved — read-only, fire-and-forget. */
  PERMISSION_AFTER_RESOLVE: 'permission:afterResolve',

  // --- Config ---
  /** Before config options change — modifiable, can block. */
  CONFIG_BEFORE_CHANGE: 'config:beforeChange',

  // --- Filesystem (agent-level) ---
  /** Before a file read operation — modifiable. */
  FS_BEFORE_READ: 'fs:beforeRead',
  /** Before a file write operation — modifiable. */
  FS_BEFORE_WRITE: 'fs:beforeWrite',

  // --- Terminal ---
  /** Before a terminal session is created — modifiable, can block. */
  TERMINAL_BEFORE_CREATE: 'terminal:beforeCreate',
  /** After a terminal session exits — read-only, fire-and-forget. */
  TERMINAL_AFTER_EXIT: 'terminal:afterExit',
} as const;

export type HookName = typeof Hook[keyof typeof Hook];

// ---------------------------------------------------------------------------
// EventBus Events
// ---------------------------------------------------------------------------

/**
 * Names for all EventBus events.
 * Used with eventBus.emit(BusEvent.X, ...) and eventBus.on(BusEvent.X, ...).
 * Type-checked against EventBusEvents interface.
 */
export const BusEvent = {
  // --- Session lifecycle ---
  SESSION_CREATED: 'session:created',
  SESSION_UPDATED: 'session:updated',
  SESSION_DELETED: 'session:deleted',
  SESSION_ENDED: 'session:ended',
  SESSION_NAMED: 'session:named',
  SESSION_THREAD_READY: 'session:threadReady',
  SESSION_CONFIG_CHANGED: 'session:configChanged',
  SESSION_AGENT_SWITCH: 'session:agentSwitch',

  // --- Agent ---
  AGENT_EVENT: 'agent:event',
  AGENT_PROMPT: 'agent:prompt',

  // --- Permissions ---
  PERMISSION_REQUEST: 'permission:request',
  PERMISSION_RESOLVED: 'permission:resolved',

  // --- Message visibility ---
  MESSAGE_QUEUED: 'message:queued',
  MESSAGE_PROCESSING: 'message:processing',

  // --- System lifecycle ---
  KERNEL_BOOTED: 'kernel:booted',
  SYSTEM_READY: 'system:ready',
  SYSTEM_SHUTDOWN: 'system:shutdown',
  SYSTEM_COMMANDS_READY: 'system:commands-ready',

  // --- Plugin lifecycle ---
  PLUGIN_LOADED: 'plugin:loaded',
  PLUGIN_FAILED: 'plugin:failed',
  PLUGIN_DISABLED: 'plugin:disabled',
  PLUGIN_UNLOADED: 'plugin:unloaded',

  // --- Usage ---
  USAGE_RECORDED: 'usage:recorded',
} as const satisfies Record<string, keyof EventBusEvents>;

export type BusEventName = typeof BusEvent[keyof typeof BusEvent];

// ---------------------------------------------------------------------------
// Session TypedEmitter Events
// ---------------------------------------------------------------------------

/**
 * Names for all Session TypedEmitter events.
 * Used with session.on(SessionEv.X, ...) and session.emit(SessionEv.X, ...).
 * Type-checked against SessionEvents interface.
 */
export const SessionEv = {
  AGENT_EVENT: 'agent_event',
  PERMISSION_REQUEST: 'permission_request',
  SESSION_END: 'session_end',
  STATUS_CHANGE: 'status_change',
  NAMED: 'named',
  ERROR: 'error',
  PROMPT_COUNT_CHANGED: 'prompt_count_changed',
  TURN_STARTED: 'turn_started',
} as const satisfies Record<string, keyof SessionEvents>;

export type SessionEvName = typeof SessionEv[keyof typeof SessionEv];
