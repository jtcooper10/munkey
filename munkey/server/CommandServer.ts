/**
 * socket.ts
 * 
 * @author  : Joshua Cooper
 * @created : 10/17/2021
 */

import { DeviceDiscoveryDecl, PeerIdentityDecl, PeerVaultDecl } from "../discovery";
import {
    ServiceContainer,
    VaultOption,
    VaultStatus,
    ConnectionResult,
    ConnectionStatus
} from "../services";
import { fail, failItem, Option, Result, Status, successItem } from "../error";
import { randomUUID } from "crypto";


/**
 * Container for managing and dispatching external commands to the application.
 * 
 * Despite the name, CommandServer is not a literal HTTP/TCP/etc. server, but an internal one.
 * The CommandServer is intended to be input-agnostic, and can provide command parsing to any readable stream.
 * 
 * Each abstract method is a potential command that may be received. Implement the method to define its behavior.
 */
abstract class CommandServer {

    protected constructor(protected services: ServiceContainer) {

    }

    async onCreateVault(vaultName: string, initialData: Buffer): Promise<VaultOption<string>> {
        if (this.services.vault.getVaultByName(vaultName)) {
            return failItem<string, VaultStatus>({
                status: VaultStatus.CONFLICT,
                message: `Cannot create vault with name ${vaultName}, already exists`,
            });
        }

        try {
            const vaultId = randomUUID();
            const vaultResult = await this.services.vault.createVault(vaultName, vaultId, initialData);

            return vaultResult.success
                ? successItem(vaultId, { message: "Vault created successfully" })
                : failItem({ message: vaultResult.message });
        }
        catch (err) {
            return failItem<string, VaultStatus>({
                status: Status.FAILURE,
                message: err?.message ?? "An unknown error has occurred",
            });
        }
    }

    async onDeleteVault(vaultName: string): Promise<VaultOption<string>> {
        const vault = this.services.vault._getVaultByName(vaultName);
        if (!vault) {
            return failItem<string, VaultStatus>({
                message: `Could not resolve vault name ${vaultName}`,
                status: VaultStatus.NOT_FOUND,
            });
        }

        return vault.delete();
    }

    async onListVaults(): Promise<Option<{ vaults: PeerVaultDecl[], connections: [string, string][] }>> {
        const vaultList = this.services.vault.getActiveVaultList();
        const connectionList: [string, string][] = Array.from(this.services.connection.getAllConnections());
        const data = {
            vaults: await vaultList,
            connections: connectionList,
        };

        if (data.vaults.length > 0 || data.connections.length > 0) {
            return {
                status: Status.SUCCESS,
                success: true,
                message: "Active vault enumeration was successful",
                data,
                unpack: () => data,
            };
        }
        else {
            return {
                status: Status.FAILURE,
                success: false,
                message: "No local or remote vaults found",
                data: null,
                unpack: option => option,
            };
        }
    }

    async onVaultLink(
        hostname: string, portNum: number,
        vaultName: string, vaultNickname: string = vaultName): Promise<ConnectionResult>
    {
        // There are 3 general cases for `vault link`:
        //  1. The remote database is new, not active nor inactive.
        //     This creates a new PouchDB database locally, syncs the remote one here.
        //  2. The remote database is known, and is active.
        //     It is added to the APL, and we're done.
        //  3. The remote database is known, but belongs to an inactive database.
        //     The inactive database is loaded and set as active, then do case 2.

        // All 3 cases require the remote DB to exist in the APL.
        let activeDevice: PeerIdentityDecl | null = await this.services
            .activity
            .publishDevice({ hostname, portNum });

        // Query the APL to find the vault ID with that nickname.
        let { vaultId = null } = activeDevice?.vaults.find(vault => vault.nickname === vaultName) ?? {};
        if (vaultId) {
            try {
                let localVaultResult = await this.services.vault.linkVault(vaultNickname, vaultId);
                if (!localVaultResult.success) {
                    return fail({
                        message: localVaultResult.message,
                    });
                }
                let localVault = localVaultResult.unpack(this.services.vault.getVaultById(vaultId));

                this.services.connection
                    .publishDatabaseConnection({ hostname, portNum }, vaultName, vaultId, localVault.vault)
                    .catch(err => console.error(err));
            }
            catch (err) {
                return fail(err?.message ?? null);
            }
        }
        else {
            return {
                status: ConnectionStatus.UNAVAILABLE,
                success: false,
                message: `Remote vault ${vaultName}@${hostname}:${portNum} could not be resolved`,
            };
        }
    }

    async onLinkUp(portNum: number): Promise<Option<number>> {
        return this.services.web.listen({ portNum })
            .then(() => ({
                status: Status.SUCCESS,
                success: true,
                message: `Server now listening on port ${portNum}`,
                data: portNum,
                unpack: () => portNum,
            }))
            .catch(err => ({
                status: Status.FAILURE,
                success: false,
                message: err?.code === "EADDRINUSE"
                    ? "Cannot open server, port is in use"
                    : "An unknown error occurred while trying to stop the server",
                data: null,
                unpack: (option) => option,
            }));
    }

    async onLinkDown(): Promise<Result> {
        return this.services.web.close()
            .then(() => ({
                status: Status.SUCCESS,
                success: true,
                message: "Server closed successfully",
            }))
            .catch(err => ({
                status: Status.FAILURE,
                success: false,
                message: err?.code === "ERR_SERVER_NOT_RUNNING"
                    ? "Cannot stop server (not running)"
                    : "An unknown error occurred while trying to stop the server",
            }));
    }

    async onPeerLink(hostname: string, portNum: number): Promise<Result> {
        const response: PeerIdentityDecl|null = await this.services.activity
            .publishDevice({ hostname, portNum });

        return response === null
            ? { status: Status.FAILURE, success: false, message: `Failed to link with peer ${hostname}:${portNum}` }
            : { status: Status.SUCCESS, success: true, message: `Successfully linked with peer ${hostname}:${portNum}` };
    }

    async onPeerList(): Promise<Option<(PeerIdentityDecl & DeviceDiscoveryDecl)[]>> {
        const deviceList = Array.from(this.services.activity.getAllDevices()).map(([peer, device]) => ({
                uniqueId: device.uniqueId,
                hostname: peer.hostname,
                portNum: peer.portNum,
                vaults: device.vaults,
            }));

        if (deviceList?.length > 0) {
            return {
                status: Status.SUCCESS,
                success: true,
                message: "Peer list enumerated successfully",
                data: deviceList,
                unpack: () => deviceList,
            };
        }
        else {
            return {
                status: Status.FAILURE,
                success: false,
                message: "No peers found",
                data: null,
                unpack: option => option,
            };
        }
    }

}

export default CommandServer;
