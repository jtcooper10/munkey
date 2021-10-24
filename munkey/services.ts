/**
 * services.ts: Inversion of Control Containers
 * 
 * @author  : Joshua Cooper
 * @created : 10/23/2021
 */

import express from "express";
import PouchDB from "pouchdb";
import usePouchDB from "express-pouchdb";

const MemoryDB = PouchDB.defaults({
    db: require("memdown")
});

interface ServerOptions {
    portNum: number;
}

/**
 * @name configureRoutes
 * @description Set up default Express.js endpoints based on IoC configurations.
 * Override options will be accepted but may be ignored.
 * 
 * @function
 * @param app Express.js application to attach basic endpoints to.
 * @param {ServerOptions} options Option overrides for IoC configutation.
 * Not guaranteed to be included, effictively a "recommendation."
 * @param {number} options.portNum Default port number to listen on.
 * 
 * @returns Promise which resolves to a fully-configured Express.js application object.
 * The resolved application object is the same object as is passed in, but configured.
 */
function configureRoutes(app: express.Application, { portNum = 8000 }: ServerOptions = { portNum: 8000 })
    : Promise<express.Application>
{
    app.get("/", function(request, response) {
        response.send("Hello, world!\n");
    });

    app.use("/db", usePouchDB(MemoryDB));

    return new Promise(function(resolve, reject) {
        app.listen(portNum, function() {
            console.info(`Listening on port ${portNum}`);
            resolve(app);
        });
    });
}

/**
 * @name VaultContainer
 * @description IoC container for the application state of all PouchDB vaults.
 * @class
 */
class VaultContainer {
    private vaultMap: Map<string, any>;

    constructor() {
        this.vaultMap = new Map<string, any>();
    }

    /**
     * @name getVault
     * @description Find or generate the vault with the given name.
     * If a vault with that ID doesn't exist yet, it is created.
     * If a vault with that ID already exists, it is returned unmodified.
     * 
     * @param {string} vaultId Unique ID corresponding to the desired vault.
     * @returns Potentially new PouchDB instance with the specified name.
     */
    public createVault(vaultId: string) {
        let vault: any = this.vaultMap.get(vaultId);
        return vault ?? this.vaultMap
            .set(vaultId, new MemoryDB(vaultId))
            .get(vaultId);
    }
}

interface ServiceContainer {
    vault: VaultContainer;
}

export {
    /* Service Classes */
    ServiceContainer,
    VaultContainer,

    /* Configuration Functions */
    configureRoutes,
};
