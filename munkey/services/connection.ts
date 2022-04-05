import Service, { VaultDB, DatabaseDocument } from "./baseService";
import { DeviceDiscoveryDecl } from "../discovery";
import { Option, Result } from "../error";
import { deserialize } from "../encryption/serialize";

export type VaultSyncToken = PouchDB.Replication.Sync<DatabaseDocument>;

export enum ConnectionStatus {
    UNAVAILABLE = "CONNECTION_UNAVAILABLE",
}

export type ConnectionResult = Result<ConnectionStatus>;
export type ConnectionOption<T> = Option<T, ConnectionStatus>;

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
export default class ConnectionService extends Service {
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
        localVault: VaultDB,
        onFirstPull?: (success: boolean) => void): VaultSyncToken
    {
        let connectionMap = this.getOrCreateMap(vaultId);
        let connectionKey = `${device.hostname}:${device.portNum}`;
        let connectionUrl = `https://${connectionKey}/db/${vaultName}`

        if (!connectionMap.get(connectionKey)) {
            this.logger.info("Adding remote connection to %s", connectionKey);

            localVault.replicate.from(connectionUrl)
                .then(({ ok }) => onFirstPull && onFirstPull(ok));
            let connection = localVault.sync<DatabaseDocument>(connectionUrl, { live: true, });

            connection
                .on("change", info => {
                    this.logger.info("Changes received", info);
                    if (info.direction !== "pull")
                        return;

                    let { change: changes } = info;
                    changes?.docs?.forEach(change => {
                        let passwords = change && change["_attachments"]["passwords.json"];
                        if (!passwords) {
                            this.logger.info("Empty database update received, validation skipped");
                            return;
                        }

                        let dataset = deserialize(passwords["data"]);
                        if (!dataset.validate(vaultId)) {
                            this.logger.warn("Invalid certificate received for vault %s, rejecting changes", vaultName);
                            localVault.remove("vault", change._rev)
                                .then(response => this.logger.info("Revision %s removed due to invalid certificate", response.rev))
                                .catch(err => this.logger.crit("Failed to reject revision %s for vault %s", change._rev, vaultId, err));
                        }
                    });
                })
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
            onFirstPull(false);
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
