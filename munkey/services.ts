/**
 * services.ts: Inversion of Control Containers
 * 
 * @author  : Joshua Cooper
 * @created : 10/23/2021
 */

import {
    DeviceDiscoveryDecl,
    isPeerLinkResponse,
    PeerIdentityDecl, PeerLinkResponse,
    PeerVaultDecl,
} from "./discovery";

import express from "express";
import PouchDB from "pouchdb";
import usePouchDB from "express-pouchdb";
import {randomUUID} from "crypto";
import http from "http";
import winston from "winston";
import ErrnoException = NodeJS.ErrnoException;
import path from "path";

type DatabaseConstructor<X extends PouchDB.Database<T>, T> = {
    new<T>(name?: string, options?: PouchDB.Configuration.DatabaseConfiguration): X;
};

interface ServerOptions {
    portNum: number;
    rootPath?: string;
}

interface DatabaseDocument {
    _id: string;
    _rev?: string;
}

export interface DatabasePluginAttachment {
    putEncryptedAttachment: (
        docId: string,
        attachmentId: string,
        revId: string | Buffer, // Either revId or attachment
        attachment: Buffer | string, // Either attachment or type
        attachmentType?: string | ((err: Error | null, result: PouchDB.Core.Response | null) => void),
        callback?: (err: Error | null, result: PouchDB.Core.Response | null) => void  ) => any;
    getEncryptedAttachment: (docId: string, attachmentId: string,
        options?: {rev?: PouchDB.Core.RevisionId | undefined},
        callback?: (error: Error | null, result: Blob | Buffer | null) => void) => any;
    useEncryption: (encryptionKey: Buffer) => any;

    encryptionKey?: Buffer;
}

type VaultDB = PouchDB.Database<DatabaseDocument> & DatabasePluginAttachment;
type VaultSyncToken = PouchDB.Replication.Sync<DatabaseDocument>;

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
 * @param {string} rootPath Root location of the running application instance.
 * Any configuration files or persisted data will be stored relative to this location.
 * If not specified, no logging is captured.
 *
 * @returns Promise which resolves to a fully-configured Express.js application object.
 * The resolved application object is the same object as is passed in, but configured.
 */
function configureRoutes(
    services: ServiceContainer,
    { portNum = 8000, rootPath = null }: ServerOptions = { portNum: 8000 }): Promise<ServiceContainer>
{
    const app = services.web.getApplication();
    const pouchOptions = !rootPath ? {}
        : { logPath: path.resolve(rootPath) + path.sep + "log.txt" };
    app.use("/link", express.json());

    app.get("/link", async function(
        request,
        response: express.Response<PeerIdentityDecl>)
    {
        const identityResponse: PeerIdentityDecl & { activePeerList: DeviceDiscoveryDecl[] } = {
            uniqueId: services.identity.getId(),
            vaults: await services.vault.getActiveVaultList(),
            activePeerList: services.activity.getDeviceList(),
        };

        response.json(identityResponse).end();
    });

    app.use("/db", usePouchDB(services.vault.getVaultConstructor(), pouchOptions));

    return services.web.listen(portNum)
        .then(() => services);
}

class Service {
    protected logger: winston.Logger;

    constructor() {
        this.logger = winston.child({});
    }

    public useLogging(logger: winston.Logger): this {
        this.logger = logger;
        return this;
    }
}

/**
 * @name VaultService
 * @summary IoC container for the application state of all PouchDB vaults.
 * @class
 */
class VaultService extends Service {
    private readonly vaultMap: Map<string, VaultDB>;
    private readonly vaultIdMap: Map<string, string>;
    private activeVault: [string | null, string | null];
    private adminService?: AdminService;

    constructor(private Vault: DatabaseConstructor<VaultDB, DatabaseDocument>) {
        super();
        this.vaultMap = new Map<string, VaultDB>();
        this.vaultIdMap = new Map<string, string>();
        this.activeVault = [null, null];
        this.adminService = null;
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
     * @param {string} encryptionKey Symmetric key used to encrypt/decrypt the contents of the vault.
     * @returns {string|null} UUID of new (or existing) PouchDB database.
     */
    public createVault(vaultName: string, vaultId?: string | null, encryptionKey?: Buffer | null): Promise<string | null>
    {
        if (!vaultName) {
            throw new ReferenceError(`Invalid vault name: ${vaultName}`);
        }

        vaultId ??= (this.vaultIdMap.get(vaultName) || null);
        let vault: VaultDB | null = vaultId && this.vaultMap.get(vaultId) || null;

        if (this.vaultIdMap.get(vaultName) && this.vaultIdMap.get(vaultName) !== vaultId) {
            throw new Error(`Name conflict; local nickname ${vaultName} already exists`);
        }
        else if (!vault) {
            // Vault not found; create it and initialize its schema.
            this.vaultIdMap.set(vaultName, vaultId ??= randomUUID());
            this.vaultMap.set(vaultId, vault = new this.Vault(vaultName));
            this.activeVault = [vaultName, vaultId];

            if (encryptionKey) {
                vault.useEncryption(encryptionKey);
            }

            return vault
                .get("vault")
                .then(() => {
                    this.logger.info("Database loaded successfully: id %s", vaultId);
                    return vaultId;
                })
                .catch(err => {
                    if (err.status === 404) {
                        this.logger.info("Database load failed; creating new instance: id %s", vaultId);
                        const blankAttachment = Buffer.from(JSON.stringify({}));
                        return vault
                            .putEncryptedAttachment("vault", "passwords.json", blankAttachment, "text/plain")
                            .then(() => {
                                this.logger.info("Database created successfully: id %s", vaultId);
                                return this.adminService?.recordVaultCreation(vaultName, vaultId);
                            })
                            .then(() => vaultId);
                    }
                    this.logger.error("Failed to create local database", err);
                    return null;
                });
        }

        return Promise.resolve(vaultId);
    }

    public async useAdminService(adminService: AdminService): Promise<this> {
        this.adminService = adminService;

        const vaultRecords = await this.adminService.getAllVaultRecords();
        await Promise.all(vaultRecords?.map(({ vaultName, vaultId }) =>
            this.createVault(vaultName, vaultId)
        ) ?? []);

        return this;
    }

    public async deleteVaultById(vaultId: string, vaultName: string): Promise<void> {
        const vault = this.vaultMap.get(vaultId);

        if (vault) {
            this.logger.info("Deleting...");

            this.activeVault = [null, null];
            this.vaultMap.delete(vaultId);
            this.vaultIdMap.delete(vaultName);
            await vault.destroy()
                .catch(err => this.logger.error("Failed to delete database with ID %s", vaultId, err));
        }
        else {
            this.logger.error(`Could not resolve vault ID ${vaultId}`, { action: "delete" });
        }
    }

    public async deleteVaultByName(vaultName: string): Promise<void> {
        const vaultId: string = this.vaultIdMap.get(vaultName);

        if (vaultId) {
            await this.deleteVaultById(vaultId, vaultName);
        }
        else {
            this.logger.warning(`Could not resolve local vault name: ${vaultName}`, { action: "delete" });
        }
    }

    /**
     * @name getVaultByName
     * @description Find the vault with the given ID.
     * If none exists with that ID, returns undefined.
     * 
     * @returns PouchDB instance if one with the provided ID exists.
     * Otherwise, returns undefined.
     */
    public getVaultByName(vaultName: string): VaultDB | null {
        let vaultId: string | null = this.vaultIdMap.get(vaultName) || null;
        return vaultId && this.getVaultById(vaultId);
    }

    public async getVaultEntry(vaultId: string, entryKey: string): Promise<string | null> {
        const vault = this.getVaultById(vaultId) ?? null;
        const entries: { [key: string]: string } = await vault?.getEncryptedAttachment("vault", "passwords.json")
            .then((attachment: Buffer) => JSON.parse(attachment.toString()))
            .catch(err => {
                console.error(err);
                return null;
            }) ?? {};
        return entries[entryKey] ?? null;
    }

    public getVaultById(vaultId: string): VaultDB | null {
        return this.vaultMap.get(vaultId) || null;
    }

    public setActiveVaultById(vaultId: string, vaultName: string = "unknown"): VaultDB | null {
        const vault = this.vaultMap.get(vaultId) || null;
        if (vault) {
            this.activeVault = [vaultName, vaultId];
        }
        return vault;
    }

    public setActiveVaultByName(vaultName: string): VaultDB | null {
        const vaultId: string = this.vaultIdMap.get(vaultName) || null;
        return this.setActiveVaultById(vaultId, vaultName);
    }

    public getActiveVault(): VaultDB | null {
        return this.vaultMap.get(this.getActiveVaultId()) || null;
    }

    public getActiveVaultId(): string | null {
        const [vaultName, vaultId] = this.activeVault;
        return vaultId;
    }

    public getActiveVaultName(): string | null {
        const [vaultName] = this.activeVault;
        return vaultName;
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
     * Similar to the method {@link VaultService#getActiveVaults}, but returns a complete list instead of iterating.
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

    public getVaultConstructor(): DatabaseConstructor<VaultDB, DatabaseDocument> {
        return this.Vault;
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
class IdentityService extends Service {
    private readonly uniqueId: string;
    constructor(uniqueId: string) {
        super();
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
class ActivityService extends Service {
    private readonly activePeerList: Map<string, PeerIdentityDecl>;
    private readonly discoveryPool: Map<string, DeviceDiscoveryDecl>;

    constructor() {
        super();
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
        portNum: number): Promise<PeerLinkResponse|null>
    {
        const logger = this.logger;
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
                        logger.error("Connection Refused %s:%d", hostname, portNum);
                    }
                    reject(err);
                });
        });

        const parsedResponse = peerResponse && JSON.parse(peerResponse);
        return isPeerLinkResponse(parsedResponse) ? parsedResponse : null;
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
     * @param {Set<string>} deviceMask Optional set of already-discovered devices.
     * Used to limit the depth of recursively-published devices and prevent infinite loops.
     * Any hosts listed in the given set are skipped during the recursive publish search.
     * @returns {Promise<PeerIdentityDecl | null>} Promise which resolves to an APL entry,
     * or null if the device endpoint is deemed invalid.
     */
    public publishDevice(device: DeviceDiscoveryDecl, deviceMask?: Set<string>): Promise<PeerIdentityDecl|null>
    {
        deviceMask ??= new Set();

        this.logger.info("Attempting to publish peer device %s:%d", device.hostname, device.portNum);
        return this.sendLinkRequest(device.hostname, device.portNum)
            .then(async decl => {
                this.logger.info("Published peer device %s:%d", device.hostname, device.portNum);
                this.activePeerList.set(`${device.hostname}:${device.portNum}`, decl);
                let { activePeerList = [] } = decl ?? {};
                activePeerList = activePeerList.filter(
                    ({ hostname, portNum }) => !deviceMask.has(`${hostname}:${portNum}`)
                );
                activePeerList.forEach(({ hostname, portNum }) => deviceMask.add(`${hostname}:${portNum}`));

                for (let peerDevice of activePeerList) {
                    this.logger.info("Discovered peer device %s:%d", peerDevice.hostname, peerDevice.portNum);
                    await this.publishDevice(peerDevice, deviceMask);
                }

                return decl as PeerIdentityDecl;
            })
            .catch(err => {
                this.activePeerList.delete(`${device.hostname}:${device.portNum}`);
                this.logger.error(err);
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
    public *getAllDevices(): Generator<[DeviceDiscoveryDecl, PeerIdentityDecl]> {
        for (let [location, identity] of this.activePeerList) {
            const [hostname, portNum]: string[] = location.split(":", 2);
            yield [{ hostname, portNum: parseInt(portNum) }, identity];
        }
    }

    public getDeviceList(): DeviceDiscoveryDecl[] {
        return Array
            .from(this.getAllDevices())
            .map( ([device]) => device );
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
class ConnectionService extends Service {
    /**
     * @name connections
     * @private
     *
     * @summary Map containing active database connection objects.
     * Map keys are the UUID of the remote vault, values are the connections themselves.
     */
    private readonly connections: Map<string, Map<string, VaultSyncToken>>;

    constructor() {
        super();
        this.connections = new Map<string, Map<string, VaultSyncToken>>();
    }

    public publishDatabaseConnection(
        device: DeviceDiscoveryDecl,
        vaultName: string,
        vaultId: string,
        localVault: VaultDB): VaultSyncToken
    {
        let connectionMap = this.getOrCreateMap(vaultId);
        let connectionKey = `${device.hostname}:${device.portNum}`;
        let connectionUrl = `http://${connectionKey}/db/${vaultName}`

        if (!connectionMap.get(connectionKey)) {
            this.logger.info("Adding remote connection to %s", connectionKey);

            localVault.replicate.from(connectionUrl);
            let connection = localVault.sync<DatabaseDocument>(connectionUrl, { live: true, });
            connection
                .on("change", info => this.logger.info("Changes received", info))
                .on("error", err => {
                    this.logger.error("Error in Sync", err);
                    this.removeRemoteConnection(vaultId, device);
                })
                .on("paused", err => this.logger.error("Sync Paused", err))
                .on("complete", err => this.logger.error("Sync Finished", err))
                .catch(err => {
                    this.logger.error("Rejected Promise in Sync", err);
                });

            return connectionMap.set(connectionKey, connection).get(connectionKey);
        }
        else {
            this.logger.warn("Cannot add remote connection to %s, already exists", connectionKey);
            return connectionMap.get(connectionKey);
        }
    }

    public removeRemoteConnection(vaultId: string, device: DeviceDiscoveryDecl): boolean {
        let connectionMap = this.connections.get(vaultId) || null;
        let connectionKey = `${device.hostname}:${device.portNum}`;

        if (connectionMap) {
            connectionMap.get(connectionKey).cancel();
            return connectionMap
                .delete(connectionKey);
        }
        return false;
    }

    private getOrCreateMap(vaultId: string): Map<string, VaultSyncToken> {
        let connectionMap;
        return (connectionMap = this.connections.get(vaultId) || null)
            ? connectionMap
            : this.connections
                .set(vaultId, new Map<string, VaultSyncToken>())
                .get(vaultId);
    }

    /**
     * @name getAllConnections
     * @public
     * @function
     *
     * @summary Iterate over (id, remoteUrl) pairs of active database connections.
     */
    public *getAllConnections(): Generator<[string, string]> {
        for (let [vaultId, connectionList] of this.connections) {
            for (let [connectionKey] of connectionList) {
                yield [
                    vaultId,
                    connectionKey
                ];
            }
        }
    }
}

class WebService extends Service {
    private server: http.Server;
    private defaultPort: number;

    constructor(private app: express.Application) {
        super();
        this.server = null;
        this.defaultPort = 8000;
    }

    public getApplication(): express.Application {
        return this.app;
    }

    public listen(portNum: number = this.defaultPort): Promise<http.Server> {
        return new Promise<http.Server>((resolve, reject) => {
                const server: http.Server = this.getApplication().listen(this.defaultPort = portNum, () => {
                        this.logger.info("Listening on port %d", portNum);
                        resolve(server);
                    })
                    .on("error", (err: ErrnoException) => {
                        if (err.code === "EADDRINUSE") {
                            this.logger.warn(`Port ${portNum} not available`);
                        }
                        reject(err);
                    });
            })
            .then(server => this.server = server);
    }

    public close(): Promise<void> {
        return new Promise(function(resolve, reject) {
                this.server = this.server?.close(err => {
                    if (err) reject(err);
                    else {
                        this.logger.info("Server closed");
                        resolve();
                    }
                });
            }.bind(this));
    }
}

interface AdminDatabaseDocument {
    _id: string;
    vaultIds: { vaultName: string, vaultId: string }[];
}

type AdminDB = PouchDB.Database<AdminDatabaseDocument>;

class AdminService extends Service {
    constructor(private adminDatabase: AdminDB) {
        super();
    }

    public initialize(): Promise<this> {
        return this.adminDatabase
            .get<AdminDatabaseDocument>("vaultIds")
            .then(() => {
                this.logger.info("Admin database validated successfully");
                return this;
            })
            .catch(err => {
                if (err.status === 404) {
                    return this.adminDatabase.put({
                            _id: "vaultIds",
                            vaultIds: [],
                        })
                        .then(doc => {
                            this.logger.info("Admin database initialization: %s", (doc.ok ? "Success" : "Failure"));
                            return this;
                        });
                }
                throw err;
            });
    }

    public recordVaultCreation(vaultName: string, vaultId: string): Promise<void> {
        return this.adminDatabase
            .get<AdminDatabaseDocument>("vaultIds")
            .then(doc => {
                const { _id, _rev, vaultIds } = doc;
                return this.adminDatabase.put({
                        _id,
                        _rev,
                        vaultIds: [...vaultIds, { vaultName, vaultId }],
                    })
                    .then(result => {
                        this.logger.info("Vault record creation: %s", result.ok ? "Success" : "Failure");
                    });
            });
    }

    public async getAllVaultRecords(): Promise<{ vaultName: string, vaultId: string }[]> {
        const { vaultIds = [] } = await this.adminDatabase
            .get<AdminDatabaseDocument>("vaultIds")
            .catch(err => {
                if (err.status === 404) {
                    this.logger.error("Vault ID entries not found. Did you forget to initialize() the admin database?");
                }
                this.logger.error("Could not retrieve vault IDs from admin database: status %d", err.status, err);
                return null;
            }) ?? {};

        return vaultIds;
    }
}

interface ServiceList {
    [serviceName: string]: Service;
}

interface ServiceContainer extends ServiceList {
    vault: VaultService;
    identity: IdentityService;
    activity: ActivityService;
    connection: ConnectionService;
    web: WebService;
    admin: AdminService;
}

export {
    /* Service Classes */
    ServiceContainer,
    VaultService,
    IdentityService,
    ActivityService,
    ConnectionService,
    WebService,
    AdminService,

    /* Configuration Functions */
    configureRoutes,
    generateNewIdentity,

    /* TS Interfaces */
    DatabaseDocument,
    AdminDatabaseDocument,
    DatabaseConstructor,
    Service,
    ServiceList,
};
