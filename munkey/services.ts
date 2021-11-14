/**
 * services.ts: Inversion of Control Containers
 * 
 * @author  : Joshua Cooper
 * @created : 10/23/2021
 */

import {
    PeerIdentityDecl,
    PeerVaultDecl,
    DeviceDiscoveryDecl,
    isPeerIdentityDecl,
} from "./discovery";

import express from "express";
import PouchDB from "pouchdb";
import usePouchDB from "express-pouchdb";
import { randomUUID } from "crypto";
import http from "http";

const MemoryDB = PouchDB.defaults({
    db: require("memdown")
});

interface ServerOptions {
    portNum: number;
}

/**
 * @name generateNewIdentity
 * @summary Create a brand-new identity object (as of v0.0.1, just a string) from random.
 * @function
 *
 * @returns Promise which resolves to a new unique identifier string.
 */
function generateNewIdentity(): Promise<string> {
    return Promise.resolve(randomUUID());
}

/**
 * @name configureRoutes
 * @description Set up default Express.js endpoints based on IoC configurations.
 * Override options will be accepted but may be ignored.
 * @function
 *
 * @param app Express.js application to attach basic endpoints to.
 * @param {ServiceContainer} services Service container to attach endpoints to.
 * Any updates issued by the web server will be applied to this service container.
 * @param {number} portNum Port number for the web server to listen on.
 *
 * @returns Promise which resolves to a fully-configured Express.js application object.
 * The resolved application object is the same object as is passed in, but configured.
 */
function configureRoutes(
    app: express.Application,
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
        }).end();
    });

    app.use("/db", usePouchDB(MemoryDB));

    return new Promise(function(resolve, reject) {
        app.listen(portNum, function() {
            console.info(`Listening on port ${portNum}`);
            resolve(services);
        });

        app.on("error", err => reject(err));
    });
}

/**
 * @name VaultContainer
 * @summary IoC container for the application state of all PouchDB vaults.
 * @class
 */
class VaultContainer {
    private readonly vaultMap: Map<string, any>;

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
     * @name getActiveVaults
     * @summary Iterate over the internal vault list as Peer Vault Declaration records.
     * @description Return the unique Peer Vault Declaration record for each active vault in the container.
     * No guarantees are made by the function in terms of race conditions.
     * If, for example, a new vault entry is added before the vault iteration completes,
     * it is not guaranteed that the new entry will be made visible to the iterator.
     *
     * @returns Async iterable which resolves to a unique Peer Vault Declaration record on each iteration.
     */
    public async* getActiveVaults(): AsyncIterable<PeerVaultDecl> {
        for (let [vaultName] of this.vaultMap) {
            yield {
                nickname: vaultName,
                vaultId: vaultName,
            };
        }
    }

    /**
     * @name getActiveVaultList
     * @summary Generate a list of active Peer Vault Declaration records.
     * @description Generate an array containing the Peer Vault Declaration record for all active vaults.
     * Similar to the method {@link VaultContainer#getActiveVaults}, but returns a complete list instead of iterating.
     * No guarantees are made by the function in terms of race conditions.
     * If, for example, a new vault entry is added before the vault iteration completes,
     * it is not guaranteed that the new entry will be made visible to the iterator.
     *
     * @returns Promise which resolves to a {@link PeerVaultDecl} array.
     */
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

class ActivityService {
    private async sendLinkRequest(
        hostname: string,
        portNum: number,
        request: string): Promise<PeerIdentityDecl|null>
    {
        const peerResponse: string|null = await new Promise<string>(function(resolve, reject) {
            const req = http.request({
                    hostname,
                    port: portNum.toString(),
                    path: "/link",
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": request.length,
                    }
                },
                function(res) {
                    const data: string[] = [];
                    res.on("data", chunk => data.push(chunk));
                    res.on("error", err => reject(err));
                    res.on("end", () => resolve(data.join("")));
                });
            req.write(request);
            req.on("error", (err: NodeJS.ErrnoException) => {
                if (err.code === "ECONNREFUSED") {
                    console.error("Connection refused");
                    resolve(null);
                }
                else {
                    reject(err);
                }
            });
            req.end();
        }).catch(err => {
            console.error(err);
            return null;
        });

        const parsedResponse = peerResponse && JSON.parse(peerResponse);
        return isPeerIdentityDecl(parsedResponse) ? parsedResponse : null;
    }

    public publishDevice(
        device: DeviceDiscoveryDecl,
        reqContent: PeerIdentityDecl): Promise<PeerIdentityDecl|null>
    {
        const request = JSON.stringify(reqContent);
        return this.sendLinkRequest(device.hostname, device.portNum, request)
            .then(decl => {
                return decl as PeerIdentityDecl;
            })
            .catch(err => {
                console.error(err);
                return null;
            });
    }
}

interface ServiceContainer {
    vault: VaultContainer;
    identity: IdentityService;
    activity: ActivityService;
}

export {
    /* Service Classes */
    ServiceContainer,
    VaultContainer,
    IdentityService,
    ActivityService,

    /* Configuration Functions */
    configureRoutes,
    generateNewIdentity,
};
