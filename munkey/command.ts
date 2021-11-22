/**
 * socket.ts
 * 
 * @author  : Joshua Cooper
 * @created : 10/17/2021
 */

import { Readable } from "stream";
import { PeerIdentityDecl } from "./discovery";
import {DatabaseDocument, ServiceContainer} from "./services";

interface CommandServer {
    onUnknownCommand?(args: string[]): Promise<void>;
    onStartup?(): Promise<void>;
    beforeEach?(): void;
    afterEach?(): void;
}

type CommandEntry = ((args: string[]) => Promise<void>) | CommandSet;
type CommandSet = { [command: string]: CommandEntry };

/**
 * Container for managing and dispatching external commands to the application.
 * 
 * Despite the name, CommandServer is not a literal HTTP/TCP/etc. server, but an internal one.
 * The CommandServer is intended to be input-agnostic, and can provide command parsing to any readable stream.
 * 
 * Each abstract method is a potential command that may be received. Implement the method to define its behavior.
 */
abstract class CommandServer {

    private commands: CommandSet = {
        "vault": {
            "new": ([vaultName = null]: string[] = []): Promise<void> => {
                if (vaultName === null) {
                    console.error("Missing name for vault creation");
                    return Promise.resolve();
                }
                return this.onCreateVault(vaultName);
            },

            "delete": ([vaultName = null]: string[] = []): Promise<void> => {
                if (vaultName === null) {
                    console.error("Missing name for vault deletion");
                    return Promise.resolve();
                }
                return this.onDeleteVault(vaultName);
            },

            "use": ([vaultName = null]: string[] = []): Promise<void> => {
                if (vaultName === null) {
                    console.error("Missing name for vault switch");
                    return Promise.resolve();
                }
                return this.onUseVault(vaultName);
            },

            "set": ([entryKey = null, entryData = null]: string[] = []): Promise<void> => {
                if (entryKey === null || entryData === null) {
                    console.error(`Missing ${entryKey ? "data" : "key name"} for entry creation`);
                    return Promise.resolve();
                }
                return this.onSetVaultEntry(entryKey, entryData);
            },

            "get": ([entryKey = null]: string[]): Promise<void> => {
                if (entryKey === null) {
                    console.error("Missing key name for entry retrieval");
                    return Promise.resolve();
                }
                return this.onGetVaultEntry(entryKey);
            },

            "list": this.onListVaults.bind(this),

            "link": ([linkTarget = null, ...rest]: string[]): Promise<void> => {
                if (linkTarget === null) {
                    console.error("Missing link target for vault link");
                    return Promise.resolve();
                }

                const [vaultName, connection]: string[] = linkTarget.split("@");
                if (vaultName.trim().length === 0) {
                    console.error("Missing vault name from link target");
                    return Promise.resolve();
                }

                let hostname: string, portNum: number;
                try {
                    [hostname, portNum] = this.resolveHost(connection);
                }
                catch (err) {
                    console.error("Failed to parse connection string");
                    return Promise.resolve();
                }

                const [subCommand = null, subArg = null]: (string | null)[] = rest;
                if (subCommand?.toLowerCase() === "as") {
                    if (subArg === null) {
                        console.error("Missing local nickname for vault link");
                        return Promise.resolve();
                    }
                    return this.onVaultLink(hostname, portNum, vaultName, subArg);
                }

                return this.onVaultLink(hostname, portNum, vaultName);
            },
        },
        "link": {
            "up": this.onLinkUp.bind(this),
            "down": this.onLinkDown.bind(this),
        },
        "peer": {
            "sync": ([peerId = null]: string[] = []): Promise<void> => {
                if (peerId === null) {
                    console.error("Missing peer id for peer sync");
                    return Promise.resolve();
                }
                return this.onPeerSync(peerId);
            },
            "link": ([connection = null]: string[] = []): Promise<void> => {
                if (connection === null) {
                    console.error("Missing connection string for peer link");
                    return Promise.resolve();
                }

                let hostname: string, portNum: number;
                try {
                    [hostname, portNum] = this.resolveHost(connection);
                }
                catch (err) {
                    console.error("Failed to parse host string");
                    return Promise.resolve();
                }

                return this.onPeerLink(hostname, portNum);
            },
            "list": this.onPeerList.bind(this),
        }
    }

    /**
     * Perform command parsing on the provided readable stream.
     * Resolves when the communication stream has been closed.
     * 
     * The abstract method implementations will be invoked on their corresponding commands.
     * 
     * @param stream Node.js Readable stream with expected user input.
     * @returns Promise which resolves once the Readable stream has been closed.
     */
    public async useStream(stream: Readable): Promise<void> {
        await this.onStartup();

        return new Promise((resolve, reject) => {
            stream.on("data", async (chunk: Buffer) => {
                const args: string[] = chunk.toString()
                    .split(/\s+/g)
                    .filter(arg => arg.length > 0);
                await this.parseCommand(args);
                this.afterEach();
            });

            stream.on("end", function() {
                console.log("Reached end of stream.");
                resolve();
            });

            stream.on("error", function(err: Error) {
                reject(err);
            });
        });
    }

    /**
     * Process vault operation commands of the format `vault <...>`
     * 
     * @param args List of args passed to the `vault` command
     * I.e., `vault new vaultname` -> ["new", "vaultname"]
     * @returns Promise corresponding to the given vault command.
     */
    private parseCommand(args: string[]): Promise<void> {
        let command: string,
            commandArgs: string[] = args,
            forward: CommandEntry = this.commands;
        do {
            [command, ...commandArgs] = commandArgs;
            if (!(command in forward)) {

            }
            ({ [command]: forward } = forward);
        } while (forward && !(forward instanceof Function));

        return forward && forward instanceof Function
            ? forward(commandArgs)
            : this.onUnknownCommand(args);
    }

    private resolveHost(connection: string): [string, number] | null {
        // List of errors is tracked rather than one error.
        // This is because there is often >1 issue involved with parsing.
        let errorsFound: string[] = [],
            hostname: string,
            portNum: string|number;
        [hostname, portNum] = connection.split(":", 2);
        portNum = parseInt(portNum) as number;

        if (hostname.length < 1) {
            errorsFound.push(`Could not parse hostname from connection string [${connection}]`);
        }
        if (isNaN(portNum)) {
            errorsFound.push(`Could not parse port number from connection string [${connection}]`);
        }

        if (errorsFound.length > 0) {
            for (let errString of errorsFound) {
                console.error(errString);
            }
            return null;
        }

        return [hostname, portNum];
    }

    abstract onCreateVault(vaultName: string): Promise<void>;
    abstract onUseVault(vaultName: string): Promise<void>;
    abstract onDeleteVault(vaultName: string): Promise<void>;
    abstract onSetVaultEntry(entryKey: string, data: string): Promise<void>;
    abstract onGetVaultEntry(entryKey: string): Promise<void>;
    abstract onListVaults(): Promise<void>;
    abstract onVaultLink(hostname: string, portNum: number, vaultName: string, vaultNickname?: string): Promise<void>;

    abstract onLinkUp(): Promise<void>;
    abstract onLinkDown(): Promise<void>;

    abstract onPeerSync(peerId: string): Promise<void>;
    abstract onPeerLink(hostname: string, portNum: number): Promise<void>;
    abstract onPeerList(): Promise<void>;

    async onUnknownCommand?(args: string[]): Promise<void> {}
    async onStartup?(): Promise<void> {}
    beforeEach?() {}
    afterEach?() {}
}

class ShellCommandServer extends CommandServer {

    constructor(private services: ServiceContainer) {
        super();
    }

    async onCreateVault(vaultName: string): Promise<void> {
        console.info(`Creating new vault (${vaultName})`);

        if (this.services.vault.getVaultByName(vaultName)) {
            return console.error(`Cannot create vault ${vaultName} (already exists)`);
        }

        try {
            const vaultId: string | null = await this.services.vault.createVault(vaultName);
            console.info(`Vault created with ID ${vaultId}`);
        }
        catch (err) {
            console.error(err);
        }
    }

    async onUseVault(vaultName: string): Promise<void> {
        console.info(`Switching to vault ${vaultName}`);

        if (!this.services.vault.getVaultByName(vaultName)) {
            return console.error(`Cannot delete vault ${vaultName} (does not exist)`);
        }
        this.services.vault.setActiveVaultByName(vaultName);
    }

    async onDeleteVault(vaultName: string): Promise<void> {
        if (!this.services.vault.getVaultByName(vaultName)) {
            return console.error(`Cannot delete vault ${vaultName} (does not exist)`);
        }
        await this.services.vault.deleteVaultByName(vaultName);
    }

    async onListVaults(): Promise<void> {
        const activeVaultId = this.services.vault.getActiveVaultId();

        console.info(":: :: Active  Vaults :: ::");
        for (let vault of await this.services.vault.getActiveVaultList()) {
            console.info(
                ` ${vault.vaultId === activeVaultId ? "*" : " "} \"${vault.nickname}\" = Vault[${vault.vaultId}]`);
        }

        console.info(":: :: Remote  Vaults :: ::");
        for (let [name, url] of this.services.connection.getAllConnections()) {
            console.info(`   ${url} = RemoteVault[${name}]`);
        }
    }

    async onSetVaultEntry(entryKey: string, data: string): Promise<void> {
        const vault = this.services.vault.getActiveVault();
        const vaultId = this.services.vault.getActiveVaultId();
        if (vault === null) {
            console.error("No vault selected; please select or create a vault");
            return Promise.resolve();
        }

        console.info(`Adding new vault entry to ${vaultId}`);
        const { _rev, entries } = await vault
            .get<DatabaseDocument>("dict")
            .catch(err => {
                console.error(err);
                return { _rev: null, entries: {} };
            });

        if (_rev === null) {
            // Document fetch failed; do nothing.
            return Promise.resolve();
        }

        await vault?.put({
            _id: "dict",
            _rev,
            entries: { ...entries, [entryKey]: data },
        }).catch(err => console.error(err));
    }

    async onGetVaultEntry(entryKey: string): Promise<void> {
        const vault = this.services.vault.getActiveVault();
        if (vault === null) {
            console.error("No vault selected; please select or create a vault");
            return Promise.resolve();
        }

        const { entries } = await vault
            .get<DatabaseDocument>("dict")
            .catch(err => {
                console.error(err);
                return { entries: {} }
            });

        const data = entries[entryKey];
        if (!data) {
            console.error("Vault entry not found");
        }
        else {
            console.info(`[${entryKey}] = ${data}`);
        }
    }

    async onVaultLink(
        hostname: string, portNum: number,
        vaultName: string, vaultNickname: string = vaultName): Promise<void>
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
                vaultId = await this.services.vault.createVault(vaultNickname, vaultId);
                let localVault = this.services.vault.getVaultById(vaultId);
                let remoteConn = this.services.connection
                    .publishDatabaseConnection({ hostname, portNum }, vaultName, vaultId, localVault);
                remoteConn.catch(err => console.error(err));
            }
            catch (err) {
                console.error("Failed to create local vault: ", err.message);
            }
        }
        else {
            console.error(`Vault unavailable: ${vaultName}@${hostname}:${portNum}`);
        }
    }

    async onLinkUp(): Promise<void> {
        await this.services.web.listen()
            .catch(() => console.error("Failed to open server"));
    }

    async onLinkDown(): Promise<void> {
        await this.services.web.close()
            .catch(() => console.error("Failed to close server"));
    }

    async onPeerSync(peerId: string): Promise<void> {
        console.info(`Unimplemented command: peer sync ${peerId}`);
    }

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

    async onPeerList(): Promise<void> {
        for (let [hostname, portNum, identity] of this.services.activity.getAllDevices()) {
            console.info(` Peer[${identity.uniqueId}]@${hostname}:${portNum}`);
            for (let vault of identity.vaults) {
                console.info(`\t* "${vault.nickname}": Vault[${vault.vaultId}]`);
            }
        }
    }

    async onUnknownCommand([command = "unknown", ...args]: string[] = []): Promise<void> {
        if (["q", "quit", "exit"].includes(command?.toLowerCase())) {
            console.info("Goodbye!");
            process.exit(0);
        }
        else {
            console.error("Unknown command");
        }
    }

    async onStartup() {
        return await new Promise<void>((resolve, reject) => {
            process.stdout.write("% ", err => {
                if (err) reject(err);
                else {
                    resolve();
                }
            });
        });
    }
    afterEach = this.onStartup

}

export {
    CommandServer,
    ShellCommandServer,
};
