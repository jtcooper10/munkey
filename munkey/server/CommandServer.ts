/**
 * socket.ts
 * 
 * @author  : Joshua Cooper
 * @created : 10/17/2021
 */

import { pbkdf2 } from "crypto";
import { PeerIdentityDecl } from "../discovery";
import { ServiceContainer } from "../services";
import { EncryptionCipher } from "../pouch";

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

    public static createDerivedKey(password: string, salt: string): Promise<Buffer> {
        return new Promise<Buffer>(function(resolve, reject) {
            pbkdf2(Buffer.from(password), Buffer.from(salt), 64000, 24, "sha256", (err, derivedKey) => {
                if (err) reject(err);
                else {
                    resolve(derivedKey);
                }
            });
        });
    }

    async onCreateVault(vaultName: string, cipher: EncryptionCipher): Promise<void> {
        console.info(`Creating new vault (${vaultName})`);

        if (this.services.vault.getVaultByName(vaultName)) {
            return console.error(`Cannot create vault ${vaultName} (already exists)`);
        }

        // Step 1: Prompt user to create a password.
        // Step 2: Transform password into derived key
        // Step 3: Pass this key into the vault creation thing.
        //         Have it store the key internally, and expire after a certain amount of time.
        // Step 4: Modify read/update to include an `integrityKey`.

        try {
            const vaultId: string | null = await this.services.vault.createVault(vaultName, null, cipher);
            // LOG
            console.info(`Vault created with ID ${vaultId}`);
        }
        catch (err) {
            // LOG
            console.error(err);
        }
    }

    // MOVE
    async onUseVault(vaultName: string): Promise<void> {
        console.info(`Switching to vault ${vaultName}`);

        if (!this.services.vault.getVaultByName(vaultName)) {
            return console.error(`Cannot switch to vault ${vaultName} (does not exist)`);
        }
        this.services.vault.setActiveVaultByName(vaultName);
    }

    // UPDATE: should accept a password, authenticate it, and return the result.
    async onVaultLogin(vaultName: string, encryptionKey: Buffer) {
        const vaultDatabase = this.services.vault.getVaultByName(vaultName);
        if (!vaultDatabase) {
            return console.error(`Cannot login to vault ${vaultName} (does not exist)`);
        }
        vaultDatabase?.setPassword(new EncryptionCipher(encryptionKey));
        this.services.vault.setActiveVaultByName(vaultName);
    }

    async onDeleteVault(vaultName: string): Promise<void> {
        if (!this.services.vault.getVaultByName(vaultName)) {
            // LOG
            return console.error(`Cannot delete vault ${vaultName} (does not exist)`);
        }
        await this.services.vault.deleteVaultByName(vaultName);
    }

    // UPDATE: instead of just printing the vaults,
    // it should instead enumerate them and return a list.
    async onListVaults(): Promise<void> {
        const activeVaultId = this.services.vault.getActiveVaultId();
        let atLeastOne: boolean = false, vaultsFound: number = 0;

        for (let vault of await this.services.vault.getActiveVaultList()) {
            if (!atLeastOne) {
                atLeastOne = true;
                console.info(":: :: Active  Vaults :: ::");
            }
            vaultsFound++;
            console.info(
                ` ${vault.vaultId === activeVaultId ? "*" : " "} \"${vault.nickname}\" = Vault[${vault.vaultId}]`);
        }

        atLeastOne = false;
        for (let [name, url] of this.services.connection.getAllConnections()) {
            if (!atLeastOne) {
                atLeastOne = true;
                console.info(":: :: Remote  Vaults :: ::");
            }
            vaultsFound++;
            console.info(`   ${url} = RemoteVault[${name}]`);
        }

        if (vaultsFound === 0) {
            console.error("No vaults found!");
        }
    }

    // UPDATE: instead of setting a single value,
    // it should accept an entirely new vault to attach.
    async onSetVaultEntry(entryKey: string, data: string): Promise<void> {
        const vault = this.services.vault.getActiveVault();
        if (vault === null) {
            console.error("No vault selected; please select or create a vault");
            return Promise.resolve();
        }
        else if (await vault.setEntry(entryKey, data) === null) {
            console.error("Failed to encrypt database (bad password)");
            return Promise.resolve();
        }
        console.info(`[${entryKey}] = ${data}`);
    }

    // REMOVE: use `onVaultLogin` exclusively.
    async onGetVaultEntry(entryKey: string): Promise<void> {
        const vaultId: string = this.services.vault.getActiveVaultId();
        if (vaultId === null) {
            console.error("No vault selected; please select or create a vault");
            return Promise.resolve();
        }

        const data: string | null = await this.services.vault.getVaultEntry(vaultId, entryKey);
        if (!data) {
            console.error("Vault entry not found");
        }
        else {
            console.info(`[${entryKey}] = ${data}`);
        }
    }

    // MOVE
    async onVaultLink(
        hostname: string, portNum: number,
        vaultName: string, vaultNickname: string = vaultName,
        cipher: EncryptionCipher): Promise<void>
    {
        console.info(`Connecting with vault ${vaultName}@${hostname}:${portNum}`);

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
                vaultId = await this.services.vault.createVault(vaultNickname, vaultId, cipher);
                let localVault = this.services.vault.getVaultById(vaultId);
                this.services.connection
                    .publishDatabaseConnection({ hostname, portNum }, vaultName, vaultId, localVault.vault)
                    .catch(err => console.error(err));
            }
            catch (err) {
                console.error("Failed to create local vault: ", err.message);
            }
        }
        else {
            console.error(`Vault unavailable: ${vaultName}@${hostname}:${portNum}`);
        }
    }

    // UPDATE: accept a port to listen on, move selection logic to shell, add return value
    async onLinkUp(): Promise<void> {
        await this.services.web.listen()
            .catch(err => {
                if (err.code === "EADDRINUSE") {
                    console.error(`Cannot open server, port is in use`);
                }
                else {
                    console.error("Failed to open server");
                }
            });
    }

    // UPDATE: remove logs, add return value
    async onLinkDown(): Promise<void> {
        await this.services.web.close()
            .catch(err => {
                if (err?.code === "ERR_SERVER_NOT_RUNNING") {
                    console.error("Cannot stop server (not running)");
                }
                else {
                    console.error("An unknown error occurred while trying to stop the server");
                }
            });
    }

    // MOVE
    async onPeerLink(hostname: string, portNum: number): Promise<void> {
        console.info(`Connecting to ${hostname}, port ${portNum}`);
        const response: PeerIdentityDecl|null = await this.services.activity
            .publishDevice({ hostname, portNum });

        if (response !== null) {
            console.info(`Successfully linked with peer ${hostname}:${portNum}`);
        }
        else {
            console.info(`Failed to link with peer ${hostname}:${portNum}`);
        }
    }

    // MOVE
    async onPeerList(): Promise<void> {
        let atLeastOne: boolean = false;
        for (let [{ hostname, portNum }, identity] of this.services.activity.getAllDevices()) {
            atLeastOne = true;
            console.info(` Peer[${identity.uniqueId}]@${hostname}:${portNum}`);
            for (let vault of identity.vaults) {
                console.info(`\t* "${vault.nickname}": Vault[${vault.vaultId}]`);
            }
        }

        if (!atLeastOne) {
            console.error("No peers found!");
        }
    }

}

export default CommandServer;
