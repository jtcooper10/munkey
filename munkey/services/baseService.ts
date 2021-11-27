import PouchDB from "pouchdb";
import winston from "winston";

import { DatabasePluginAttachment } from "../pouch";

export type VaultDB = PouchDB.Database<DatabaseDocument> & DatabasePluginAttachment;

export interface DatabaseDocument {
    _id: string;
    _rev?: string;
}

export default abstract class Service {
    protected logger: winston.Logger;

    protected constructor() {
        this.logger = winston.child({});
    }

    public useLogging(logger: winston.Logger): this {
        this.logger = logger;
        return this;
    }
}
