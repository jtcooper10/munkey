/**
 * services.ts: Inversion of Control Containers
 * 
 * @author  : Joshua Cooper
 * @created : 10/23/2021
 */

import {
    DeviceDiscoveryDecl,
    isPeerIdentityDecl,
    PeerIdentityDecl,
    PeerVaultDecl,
} from "./discovery";

import express from "express";
import PouchDB from "pouchdb";
import usePouchDB from "express-pouchdb";
import {randomUUID} from "crypto";
import http from "http";
import memdown from "memdown";

const MemoryDB = PouchDB.defaults(<PouchDB.Configuration.DatabaseConfiguration> {
    db: memdown
});

interface ServerOptions {
    portNum: number;
}

interface DatabaseDocument {
    _id: string;
    _rev?: string;
    entries?: { [entry: string]: string };
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

    app.get("/link", async function(
        request,
        response: express.Response<PeerIdentityDecl>)
    {
        const identityResponse: PeerIdentityDecl = {
            uniqueId: services.identity.getId(),
            vaults: await services.vault.getActiveVaultList(),
        };

        response.json(identityResponse).end();
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
    private readonly vaultMap: Map<string, PouchDB.Database<DatabaseDocument>>;
    private readonly vaultIdMap: Map<string, string>;
    private activeVault: string | null;

    constructor() {
        this.vaultMap = new Map<string, PouchDB.Database<DatabaseDocument>>();
        this.vaultIdMap = new Map<string, string>();
        this.activeVault = null;
    }

    /**
     * @name createVault
     * @description Find or generate the vault with the given ID.
     * If a vault with that ID doesn't exist yet, it is created.
     * If a vault with that ID already exists, it is returned unmodified.
     * 
     * @param {string} vaultName Unique "nickname" corresponding to the desired vault.
     * The vault is issued a new, randomly generated UUID on creation.
     * @param {string} vaultId Suggested UUID for the new vault.
     * Recommended only when the vault you are creating already exists.
     * @returns {string|null} UUID of new (or existing) PouchDB database.
     */
    public createVault(vaultName: string, vaultId?: string | null): Promise<string | null> {
        if (!vaultName) {
            throw new ReferenceError(`Invalid vault name: ${vaultName}`);
        }

        vaultId ??= (this.vaultIdMap.get(vaultName) || null);
        let vault: PouchDB.Database<DatabaseDocument> | null = vaultId && this.vaultMap.get(vaultId) || null;

        if (!vault) {
            // Vault not found; create it and initialize its schema.
            this.vaultIdMap.set(vaultName, vaultId ??= randomUUID());
            this.vaultMap.set(vaultId, vault = new MemoryDB(vaultName));
            this.activeVault = vaultId;
            return vault.put({
                    _id: "dict",
                    entries: {},
                })
                .then(() => vault)
                .catch(err => {
                    console.error(err);
                    return null;
                });
        }

        return Promise.resolve(vaultId);
    }

    /**
     * @name getVaultByName
     * @description Find the vault with the given ID.
     * If none exists with that ID, returns undefined.
     * 
     * @returns PouchDB instance if one with the provided ID exists.
     * Otherwise, returns undefined.
     */
    public getVaultByName(vaultName: string): PouchDB.Database<DatabaseDocument> | null {
        let vaultId: string | null = this.vaultIdMap.get(vaultName) || null;
        return vaultId && this.getVaultById(vaultId);
    }

    public getVaultById(vaultId: string): PouchDB.Database<DatabaseDocument> | null {
        return this.vaultMap.get(vaultId) || null;
    }

    public getActiveVault(): PouchDB.Database<DatabaseDocument> | null {
        return this.vaultMap.get(this.activeVault) || null;
    }

    public getActiveVaultId(): string | null {
        return this.activeVault;
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
        for (let [vaultName, vaultId] of this.vaultIdMap) {
            yield {
                nickname: vaultName,
                vaultId: vaultId,
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

/**
 * @name IdentityService
 * @summary Service container for local identity information.
 * @description Service container which manages known identities on the network.
 * The identifier for each device is required to be unique within any particular vault network,
 * and must correspond to the public/private key-pair of the same identity.
 * The identity's key-pair is used to validate the identity for each request.
 * @class
 */
class IdentityService {
    private readonly uniqueId: string;
    constructor(uniqueId: string) {
        this.uniqueId = uniqueId;
    }

    /**
     * @name getId
     * @description Get the unique identifier for the local device's identity.
     *
     * @returns String representing the UUID of the local device's identity.
     */
    public getId(): string {
        return this.uniqueId;
    }
}

/**
 * @name ActivityService
 * @summary Service container for peer discovery activity.
 * @description Service container which manages the local device's knowledge of peer network activity.
 * This service container actively manages and tracks the lifetime of peer discovery entries.
 *
 * Newly discovered (potential) devices on the local area network are added to the ActivityService database,
 * which manages the lifetime (including, for example, timeouts) of the device.
 * Note that active connections are not handled by this container, only locational entries.
 */
class ActivityService {
    private readonly activePeerList: Map<string, PeerIdentityDecl>;
    private readonly discoveryPool: Map<string, DeviceDiscoveryDecl>;

    constructor() {
        this.activePeerList = new Map<string, PeerIdentityDecl>();
        this.discoveryPool = new Map<string, DeviceDiscoveryDecl>();
    }

    /**
     * @name sendLinkRequest
     * @private
     * @function
     *
     * @summary Resolve a network address and determines if it points to an active peer device.
     * @description Connect with the device at the given network address and determine its status.
     *
     * The device located at the given endpoint is assumed to be a valid Munkey peer.
     * If this is the case, the identity information contained at that endpoint is returned.
     * If the endpoint is invalid (for example, the connection was refused or is not a valid
     * Munkey peer server), then no identity information is returned.
     *
     * @param hostname {string} IP address or hostname of the device.
     * @param portNum {number} TCP port number of the device.
     * @returns A valid Peer Identity Declaration struct if the endpoint is valid.
     * Otherwise, returns null.
     */
    private async sendLinkRequest(
        hostname: string,
        portNum: number): Promise<PeerIdentityDecl|null>
    {
        const peerResponse: string|null = await new Promise<string>(function(resolve, reject) {
            http.get({
                    hostname,
                    port: portNum.toString(),
                    path: "/link",
                },
                function(res: http.IncomingMessage) {
                    const data: string[] = [];
                    res.on("data", chunk => data.push(chunk));
                    res.on("error", err => reject(err));
                    res.on("end", () => resolve(data.join("")));
                })
                .on("error", (err: NodeJS.ErrnoException) => {
                    if (err.code === "ECONNREFUSED") {
                        console.error("Connection refused");
                        resolve(null);
                    }
                    else {
                        reject(err);
                    }
                });
        })
        .catch(err => {
            console.error(err);
            return null;
        });

        const parsedResponse = peerResponse && JSON.parse(peerResponse);
        return isPeerIdentityDecl(parsedResponse) ? parsedResponse : null;
    }

    /**
     * @name publishDevice
     * @public
     * @function
     *
     * @summary Submit a discovered endpoint for a potential peer device.
     * @description Submit an endpoint for processing and validation.
     *
     * The service container will handle validation of the endpoint.
     * If valid, it will (eventually) be listed as an entry in the Active Peer List.
     * Absolutely no guarantees are made that the published device will actually appear,
     * as the published device information may be discarded if deemed invalid for any reason.
     *
     * If the success/failure of the published device record must be known,
     * then the returned promise may be used, though this is not necessary.
     * Note that the processing of a published device is highly asynchronous,
     * and may take a significant amount of time to complete.
     * It is discouraged to "block" execution (i.e. `await`) based on the result.
     *
     * @param device {DeviceDiscoveryDecl} Device discovery record to publish to the APL.
     * @returns {Promise<PeerIdentityDecl | null>} Promise which resolves to an APL entry,
     * or null if the device endpoint is deemed invalid.
     */
    public publishDevice(device: DeviceDiscoveryDecl): Promise<PeerIdentityDecl|null>
    {
        return this.sendLinkRequest(device.hostname, device.portNum)
            .then(decl => {
                this.activePeerList.set(`${device.hostname}:${device.portNum}`, decl);
                return decl as PeerIdentityDecl;
            })
            .catch(err => {
                console.error(err);
                return null;
            });
    }

    /**
     * @name getActiveDevice
     * @public
     * @function
     *
     * @description Get the identity document of the device from the APL.
     *
     * @param device {DeviceDiscoveryDecl} Device discovery record to find the internally known identity of.
     * @returns Peer identity document belonging to the given device record, if it exists.
     * If the record was not found, returns null.
     */
    public getActiveDevice(device: DeviceDiscoveryDecl): PeerIdentityDecl | null {
        return this.activePeerList.get(`${device.hostname}:${device.portNum}`) ?? null;
    }

    /**
     * @name removeActiveDevice
     * @public
     * @function
     *
     * @description Remove the given device's information from the APL.
     * Note that this does not remove any existing connections with the device,
     * it only prevents future link requests from being automatically made.
     *
     * @param device {DeviceDiscoveryDecl} Device discovery record to remove from the APL.
     * @returns Boolean indicated whether that device was found in the APL.
     * Return of false indicates that record did not exist, and so no change was made to the APL.
     */
    public removeActiveDevice(device: DeviceDiscoveryDecl): boolean {
        return this.activePeerList.delete(`${device.hostname}:${device.portNum}`);
    }

    /**
     * @name getAllDevices
     * @public
     * @function
     *
     * @summary Iterate over the contents of the APL.
     * @description Iterate over the list of device and identity entries in the APL.
     * The values returned by the iterator are considered a point-in-time "snapshot" of the APL.
     * As such, no guarantee is made that the entries will remain valid after iteration.
     *
     * @returns Iterator over tuple: (hostname, portNum, identityDocument).
     * Each tuple represents a single entry in the APL.
     */
    public *getAllDevices(): Generator<[string, number, PeerIdentityDecl]> {
        for (let [location, identity] of this.activePeerList) {
            const [hostname, portNum]: string[] = location.split(":", 2);
            yield [hostname, parseInt(portNum), identity];
        }
    }
}

/**
 * @name ConnectionService
 * @class
 * @summary Service container for peer database connections.
 * @description Service container for managing peer endpoints for CouchDB connections.
 * Endpoints listed in the container may or may not be currently active, no guarantees are made about
 * the endpoint itself (except the fact that it, at one point, contained an active database).
 *
 * For the most part, operations are performed in aggregate over all active databases.
 * In rare cases, you may request and operate on a single endpoint.
 */
class ConnectionService {
    /**
     * @name connections
     * @private
     *
     * @summary Map containing active database connection objects.
     * Map keys are the UUID of the remote vault, values are the connections themselves.
     */
    private readonly connections: Map<string, PouchDB.Database<DatabaseDocument>>;

    constructor() {
        this.connections = new Map<string, PouchDB.Database<DatabaseDocument>>();
    }

    public publishDatabaseConnection(device: DeviceDiscoveryDecl, vaultName: string, vaultId: string) {
        this.connections.set(
            vaultId,
            new PouchDB(`http://${device.hostname}:${device.portNum}/db/${vaultName}`),
        );
    }

    /**
     * @name getAllConnections
     * @public
     * @function
     *
     * @summary Iterate over (id, database) pairs of active database connections.
     */
    public *getAllConnections(): Generator<[string, PouchDB.Database<DatabaseDocument>]> {
        for (let [connection, database] of this.connections) {
            yield [
                connection,
                database
            ];
        }
    }

    public *getActiveConnections(vaultId: string): Generator<PouchDB.Database<DatabaseDocument>> {
        for (let [connId, connection] of this.connections) {
            if (connId === vaultId) {
                yield connection;
            }
        }
    }

    public applyAll(applicationCallback: (db: PouchDB.Database) => boolean) {
        const removals: string[] = [];

        for (let [location, database] of this.connections) {
            if (!applicationCallback(database)) {
                removals.push(location);
            }
        }

        removals.forEach(removalKey => this.connections.delete(removalKey));
    }
}

interface ServiceContainer {
    vault: VaultContainer;
    identity: IdentityService;
    activity: ActivityService;
    connection: ConnectionService;
}

export {
    /* Service Classes */
    ServiceContainer,
    VaultContainer,
    IdentityService,
    ActivityService,
    ConnectionService,

    /* Configuration Functions */
    configureRoutes,
    generateNewIdentity,

    /* TS Interfaces */
    DatabaseDocument,
};
