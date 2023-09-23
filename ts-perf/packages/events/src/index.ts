import { EventEmitter } from "node:events";

export type StrictEventArgTypes<F> = F extends (...args: infer A) => any ? A
    : never;

export type StrictEventsBase<TEvents> = { [P in Extract<keyof TEvents, string | symbol>]: (...args: any[]) => void; };

export interface StrictEventEmitter<TEvents extends StrictEventsBase<TEvents>> extends EventEmitter {
    addListener<E extends keyof TEvents>(
        event: E,
        listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
    ): this;
    addListener(event: never, listener: (...args: any[]) => void): this;
    removeListener<E extends keyof TEvents>(
        event: E,
        listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
    ): this;
    removeListener(event: never, listener: (...args: any[]) => void): this;
    prependListener<E extends keyof TEvents>(
        event: E,
        listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
    ): this;
    prependListener(event: never, listener: (...args: any[]) => void): this;
    prependOnceListener<E extends keyof TEvents>(
        event: E,
        listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
    ): this;
    prependOnceListener(event: never, listener: (...args: any[]) => void): this;
    on<E extends keyof TEvents>(
        event: E,
        listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
    ): this;
    on(event: never, listener: (...args: any[]) => void): this;
    once<E extends keyof TEvents>(
        event: E,
        listener: (this: this, ...args: StrictEventArgTypes<TEvents[E]>) => void,
    ): this;
    once(event: never, listener: (...args: any[]) => void): this;
    emit<E extends keyof TEvents>(event: E, ...args: StrictEventArgTypes<TEvents[E]>): boolean;
    emit(event: never, ...args: any[]): boolean;
    listenerCount(event: keyof TEvents): number;
    listenerCount(event: never): number;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class StrictEventEmitter<TEvents extends StrictEventsBase<TEvents>> extends EventEmitter {
}
