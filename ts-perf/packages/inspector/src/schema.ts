import { StrictEventEmitter } from "@ts-perf/events";

import * as inspector from "./inspector";
import { Session } from "./session";

export interface SchemaEvents {
}

/**
 * Provides information about the protocol schema.
 */
export class Schema extends StrictEventEmitter<SchemaEvents> {
    public readonly session: Session;

    constructor(session: Session) {
        super();
        this.session = session;
    }

    /**
     * Returns supported domains.
     */
    public getDomains() {
        return this.session.postAsync("Schema.getDomains");
    }
}

export namespace Schema {
    export import Domain = inspector.Schema.Domain;
    export import GetDomainsReturnType = inspector.Schema.GetDomainsReturnType;
}

export import Domain = inspector.Schema.Domain;
