export type ArgTypes<F> = F extends (...args: infer A) => any ? A
    : any[];

export type MatchingKeys<TRecord, TMatch> = [keyof TRecord] extends [infer K]
    ? K extends (TRecord[Extract<keyof TRecord, K>] extends TMatch ? K : never) ? K : never
    : never;

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
