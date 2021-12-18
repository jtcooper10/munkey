import { DeviceDiscoveryDecl, isPeerLinkResponse, PeerIdentityDecl, PeerLinkResponse } from "../discovery";
import * as bonjour from "bonjour";
import https from "https";
import http from "http";

import Service from "./baseService";
import VaultService from "./vault";
import ConnectionService from "./connection";
import IdentityService from "./identity";

interface ActivityServiceContainer {
    vault: VaultService;
    identity: IdentityService;
    connection: ConnectionService;
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
export default class ActivityService extends Service {
    private readonly activePeerList: Map<string, PeerIdentityDecl>;
    private readonly discoveryPool: Map<string, DeviceDiscoveryDecl>;
    private broadcastService: bonjour.Service;

    constructor(private mdnsSource: bonjour.Bonjour) {
        super();
        this.activePeerList = new Map<string, PeerIdentityDecl>();
        this.discoveryPool = new Map<string, DeviceDiscoveryDecl>();
        this.broadcastService = null;
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
            https.get({
                    hostname,
                    port: portNum?.toString(),
                    path: "/link",
                    rejectUnauthorized: false,
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
    public publishDevice(device: DeviceDiscoveryDecl & { uniqueId?: string },
                         deviceMask?: Set<string>): Promise<PeerIdentityDecl|null>
    {
        deviceMask ??= new Set();

        this.logger.info("Attempting to publish peer device %s:%d", device.hostname, device.portNum);
        return this.sendLinkRequest(device.hostname, device.portNum)
            .then(async decl => {
                if (device.uniqueId && device.uniqueId === decl.uniqueId) {
                    this.logger.info("Peer device at %s:%d matches own identity; discarding",
                        device.hostname,
                        device.portNum);
                    return null;
                }
                this.logger.info("Published peer device %s:%d", device.hostname, device.portNum);
                this.activePeerList.set(`${device.hostname}:${device.portNum}`, decl);
                let { activePeerList = [] } = decl ?? {};
                activePeerList = activePeerList.filter(
                    ({ hostname, portNum }) => !deviceMask.has(`${hostname}:${portNum}`)
                );
                activePeerList.forEach(({ hostname, portNum }) => deviceMask.add(`${hostname}:${portNum}`));

                for (let peerDevice of activePeerList) {
                    this.logger.info("Discovered peer device %s:%d", peerDevice.hostname, peerDevice.portNum);
                    await this.publishDevice({ ...device, ...peerDevice }, deviceMask);
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

    public broadcast(uniqueId: string, portNum: number, servicePortNum: number): Promise<boolean> {
        return new Promise(resolve => {
            const broadcastService = this.mdnsSource.publish({
                name: `Munkey Vault[${uniqueId}]`,
                type: "http",
                port: servicePortNum,
                txt: {
                    "__mkey_proto_validate__": "TRUE",
                    "__mkey_proto_uuid__": uniqueId.toLowerCase(),
                }
            })
                .on("up", () => {
                    this.logger.info("Broadcast active on port %d", portNum);
                    this.useBroadcastService(broadcastService);
                    resolve(true);
                })
                .on("down", () => {
                    this.logger.info("lol");
                })
                .on("error", err => {
                    console.error(err);
                    resolve(false);
                });
        });
    }

    public useBroadcastService(broadcastService: bonjour.Service) {
        this.broadcastService = broadcastService;
    }

    public listen(services?: ActivityServiceContainer) {
        this.mdnsSource.find({ type: "http", subtypes: ["munkey-http"] })
            .on("up", async service => {
                // The most reliable way to "filter" for our services is to use a custom TXT entry.
                // All public metadata is included here, most importantly the __mkey_proto_validate__ field.
                // Additionally, we preemptively discard the packet if the provided UUID is our own,
                // though ther validations should be performed during the linking process
                // to ensure we don't link against ourselves.
                if (service?.txt["__mkey_proto_validate__"] !== "TRUE" ||
                    service?.txt["__mkey_proto_uuid__"] === services?.identity.getId().toLowerCase())
                {
                    return;
                }
                this.logger.info("Potential peer found: %s", service.name);
                const { port: portNum } = service;
                const addressList = service.addresses.filter(addr => !!addr.match(/\d{1,3}(\.\d{1,3}){3}/g))
                for (let hostname of addressList) {
                    this.logger.info("Searching for service at %s:%d", hostname, portNum);
                    let peerDecl: PeerIdentityDecl = await this.publishDevice({
                        hostname,
                        portNum,
                        uniqueId: services.identity.getId(),
                    });
                    if (peerDecl && peerDecl?.uniqueId !== services?.identity.getId()) {
                        this.logger.info("Service search at %s:%d was successful", hostname, portNum);
                        peerDecl.vaults.forEach(vaultDecl => {
                            const vaultDatabase = services?.vault.getVaultById(vaultDecl.vaultId);
                            if (vaultDatabase) {
                                services?.connection.publishDatabaseConnection({ hostname, portNum },
                                    vaultDecl.nickname,
                                    vaultDecl.vaultId,
                                    vaultDatabase.vault);
                                this.logger.info("Remote instance %s connected to local vault %s",
                                    vaultDatabase.name, vaultDecl.vaultId);
                            }
                        });
                        break;
                    }
                }
            })
            .on("down", service => {
                const { port: portNum, name } = service;
                const addressList = service.addresses.filter(addr => !!addr.match(/\d{1,3}(\.\d{1,3}){3}/g));

                this.logger.info("Service '%s' has left", name);
                for (let hostname of addressList) {
                    if (this.removeActiveDevice({ hostname, portNum })) {
                        this.logger.info("Removed service at %s:%d", hostname, portNum);
                    }
                }
            });
    }

    public stop(): Promise<void> {
        return new Promise<void>(resolve => {
            this.mdnsSource.unpublishAll(() => {
                this.mdnsSource.destroy();
                this.logger.info("Service discovery disabled");
                resolve();
            });
        });
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

    public *resolveVaultName(vaultName: string): Generator<[string, DeviceDiscoveryDecl]> {
        for (let [location, identity] of this.getAllDevices()) {
            for (let vault of identity.vaults) {
                if (vault.nickname === vaultName) {
                    yield [
                        vault.vaultId,
                        location,
                    ];
                }
            }
        }
    }

    public getDeviceList(): DeviceDiscoveryDecl[] {
        return Array
            .from(this.getAllDevices())
            .map( ([device]) => device );
    }
}
