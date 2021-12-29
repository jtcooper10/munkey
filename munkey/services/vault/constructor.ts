import PouchDB from "pouchdb";

export type DatabaseConstructor<Doc, Plug = {}>
    = (name?: string, options?: PouchDB.Configuration.DatabaseConfiguration) => PouchDB.Database<Doc> & Plug;

export interface DatabaseContext<Doc, Plug = {}> {
    /**
     * @name load
     * @summary Load a PouchDB database without creating or initializing it.
     * Fails if a database with the given identifier could not be found.
     */
    load: DatabaseConstructor<Doc, Plug>;

    /**
     * @name create
     * @method
     * @summary Create a new PouchDB database without initializing it.
     * Fails if the database already exists.
     */
    create: DatabaseConstructor<Doc, Plug>;
}
