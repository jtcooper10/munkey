/**
 * services.ts: Inversion of Control Containers
 * 
 * @author  : Joshua Cooper
 * @created : 10/23/2021
 */

import {
    PeerIdentityDecl,
    PeerVaultDecl,
    isPeerIdentityDecl,
} from "./discovery";

import express from "express";
import PouchDB from "pouchdb";
import usePouchDB from "express-pouchdb";
import { randomUUID } from "crypto";

const MemoryDB = PouchDB.defaults({
    db: require("memdown")
});

interface ServerOptions {
    portNum: number;
}

/**
 * 
 */
function generateNewIdentity(): Promise<string> {
    return Promise.resolve(randomUUID());
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
function configureRoutes(app: express.Application,
    services: ServiceContainer,
    { portNum = 8000 }: ServerOptions = { portNum: 8000 }): Promise<ServiceContainer>
{
    app.use("/link", express.json());
    app.post("/link", async function(
        request: express.Request<any, any, PeerIdentityDecl>,
        response: express.Response<PeerIdentityDecl>)
    {
        if (!isPeerIdentityDecl(request.body)) {
            response.status(400).end("Invalid request structure");
            return;
        }

        services.identity.knownPeers.set(request.body.uniqueId, request.body);
        const vaultList: PeerVaultDecl[] = [];
        for await (let activeVault of services.vault.getActiveVaults()) {
            vaultList.push(activeVault);
        }

        response.json({
            uniqueId: services.identity.getId(),
            vaults: vaultList,
        });
        response.end();
    });

    app.use("/db", usePouchDB(MemoryDB));

    return new Promise(function(resolve, reject) {
        app.listen(portNum, function() {
            console.info(`Listening on port ${portNum}`);
            resolve(services);
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
     * @name createVault
     * @description Find or generate the vault with the given ID.
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

    /**
     * @name getVault
     * @description Find the vault with the given ID.
     * If none exists with that ID, returns undefined.
     * 
     * @returns PouchDB instance if one with the provided ID exists.
     * Otherwise, returns undefined.
     */
    public getVault(vaultId: string) {
        return this.vaultMap.get(vaultId);
    }

    /**
     * 
     */
    public async* getActiveVaults(): AsyncIterable<PeerVaultDecl> {
        for (let [vaultName] of this.vaultMap) {
            yield {
                nickname: vaultName,
                vaultId: vaultName,
            };
        }
    }

    public async getActiveVaultList(): Promise<PeerVaultDecl[]> {
        const vaultList: PeerVaultDecl[] = [];
        for await (let vault of this.getActiveVaults()) {
            vaultList.push(vault);
        }
        return vaultList;
    }
}

class IdentityService {
    public knownPeers: Map<string, PeerIdentityDecl>;

    constructor(private uniqueId: string) {
        this.knownPeers = new Map<string, PeerIdentityDecl>();
    }

    public getId(): string {
        return this.uniqueId;
    }
}

interface ServiceContainer {
    vault: VaultContainer;
    identity: IdentityService;
}

export {
    /* Service Classes */
    ServiceContainer,
    VaultContainer,
    IdentityService,

    /* Configuration Functions */
    configureRoutes,
    generateNewIdentity,
};
