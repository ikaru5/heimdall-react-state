/**
 * Describes the payload sent when notifying subscribers.
 *
 * @typedef {Object} EmitPayload
 * @property {"set" | "delete" | "mutate"} type
 * @property {unknown} [value]
 * @property {unknown} [previousValue]
 */

/**
 * Event that is sent to subscribers when a change is detected.
 *
 * @typedef {EmitPayload & {
 *   path: string[];
 *   key: string;
 *   observerKey: string;
 *   revision: number;
 * }} SubscriptionEvent
 */

/**
 * Event object forwarded through the optional onUpdate callback.
 *
 * @typedef {EmitPayload & {
 *   path: string[];
 *   key: string;
 * }} ContractUpdateEvent
 */

/**
 * Options accepted by {@link ContractStore.subscribe}.
 *
 * @typedef {Object} SubscribeOptions
 * @property {boolean} [exact=false]
 */

/**
 * Reactive wrapper returned by {@link createContractStore}.
 *
 * @typedef {Object} ContractStore
 * @property {unknown} contract
 * @property {(path: string | string[] | undefined, callback: (event: SubscriptionEvent) => void, options?: SubscribeOptions) => () => void} subscribe
 * @property {(path: string | string[] | undefined) => unknown} getValue
 * @property {(path: string | string[], value: unknown) => unknown} setValue
 * @property {(path: string | string[] | undefined) => number} getRevision
 * @property {(...args: unknown[]) => unknown} assign
 * @property {(...args: unknown[]) => unknown} isValid
 * @property {() => unknown} getContract
 * @property {() => unknown} getOriginalContract
 */

export {};
