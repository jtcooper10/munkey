/**
 * socket.ts
 * 
 * @author  : Joshua Cooper
 * @created : 10/17/2021
 */

import { pbkdf2 } from "crypto";
import {createInterface, Interface} from "readline";
import { Readable, Writable } from "stream";
import { PeerIdentityDecl } from "./discovery";
import { ServiceContainer } from "./services";

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

    async onCreateVault(vaultName: string, encryptionKey: Buffer): Promise<void> {
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
            const vaultId: string | null = await this.services.vault.createVault(vaultName, null, encryptionKey);
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

    async onVaultLogin(vaultName: string, encryptionKey: Buffer) {
        const vault = this.services.vault.getVaultByName(vaultName);
        if (!vault) {
            return console.error(`Cannot login to vault ${vaultName} (does not exist)`);
        }
        vault?.useEncryption(encryptionKey);
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
        const { _rev } = await vault
            .get("vault")
            .catch(err => {
                console.error(err);
                return { _rev: null };
            })

        if (_rev === null) {
            // Document fetch failed; do nothing.
            return Promise.resolve();
        }

        const passwordDoc: { [key: string]: string } = await vault
            .getEncryptedAttachment("vault", "passwords.json")
            .then((attachment: Buffer) => JSON.parse(attachment.toString()));
        passwordDoc[entryKey] = data;
        await vault.putEncryptedAttachment("vault", "passwords.json", _rev, Buffer.from(JSON.stringify(passwordDoc)), "text/plain");
    }

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

    async onVaultLink(
        hostname: string, portNum: number,
        vaultName: string, vaultNickname: string = vaultName,
        derivedKey: Buffer): Promise<void>
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
                vaultId = await this.services.vault.createVault(vaultNickname, vaultId, derivedKey);
                let localVault = this.services.vault.getVaultById(vaultId);
                this.services.connection
                    .publishDatabaseConnection({ hostname, portNum }, vaultName, vaultId, localVault)
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
        for (let [{ hostname, portNum }, identity] of this.services.activity.getAllDevices()) {
            console.info(` Peer[${identity.uniqueId}]@${hostname}:${portNum}`);
            for (let vault of identity.vaults) {
                console.info(`\t* "${vault.nickname}": Vault[${vault.vaultId}]`);
            }
        }
    }

}

type CommandReadCallback = ((sessionInterface: Interface) => Promise<any>) | null;
type CommandEntry = ((args: string[]) => Promise<CommandReadCallback>) | CommandSet;
type CommandSet = { [command: string]: CommandEntry };

class SilentTerminal {
    constructor(
        private silent: boolean = false,
        private baseWritable: Writable = process.stdout)
    {

    }

    public createWritable(): Writable {
        return new Writable({
            write: this.write.bind(this),
        });
    }

    public setSilent(silent: boolean = true) {
        this.silent = silent;
    }

    private write(chunk: any,
        encoding: BufferEncoding | ((error: Error | null | undefined) => void),
        cb?: (error: Error | null | undefined) => void): boolean
    {
        if (!this.silent) {
            return this.baseWritable.write(chunk, encoding as BufferEncoding, cb);
        }
        cb(null);
        return false;
    }
}

class ShellCommandServer extends CommandServer {
    private term: SilentTerminal;

    constructor(services: ServiceContainer) {
        super(services);
        this.term = new SilentTerminal(false);
    }

    private commands: CommandSet = {
        "vault": {
            "new": ([vaultName = null]: string[] = []): Promise<CommandReadCallback> => {
                if (vaultName === null) {
                    console.error("Missing name for vault creation");
                    return Promise.resolve(null);
                }
                return Promise.resolve(stream => this
                    .promptPasswordCreation(stream)
                    .then(password => this.onCreateVault(vaultName, password)));
            },

            "login": ([vaultName = null]: string[] = []): Promise<CommandReadCallback> => {
                if (vaultName === null) {
                    console.error("Missing name for vault login");
                    return Promise.resolve(null);
                }
                return Promise.resolve(stream => this
                    .promptPasswordCreation(stream)
                    .then(password => this.onVaultLogin(vaultName, password)));
            },

            "delete": ([vaultName = null]: string[] = []): Promise<CommandReadCallback> => {
                if (vaultName === null) {
                    console.error("Missing name for vault deletion");
                    return Promise.resolve(null);
                }
                return this.onDeleteVault(vaultName).then(null);
            },

            "use": ([vaultName = null]: string[] = []): Promise<CommandReadCallback> => {
                if (vaultName === null) {
                    console.error("Missing name for vault switch");
                    return Promise.resolve(null);
                }
                return this.onUseVault(vaultName).then(null);
            },

            "set": ([entryKey = null, entryData = null]: string[] = []): Promise<CommandReadCallback> => {
                if (entryKey === null || entryData === null) {
                    console.error(`Missing ${entryKey ? "data" : "key name"} for entry creation`);
                    return Promise.resolve(null);
                }
                return this.onSetVaultEntry(entryKey, entryData).then(null);
            },

            "get": ([entryKey = null]: string[]): Promise<CommandReadCallback> => {
                if (entryKey === null) {
                    console.error("Missing key name for entry retrieval");
                    return Promise.resolve(null);
                }
                return this.onGetVaultEntry(entryKey).then(null);
            },

            "list": this.onListVaults.bind(this),

            "link": ([linkTarget = null, ...rest]: string[]): Promise<CommandReadCallback> => {
                if (linkTarget === null) {
                    console.error("Missing link target for vault link");
                    return Promise.resolve(null);
                }

                const [vaultName, connection]: string[] = linkTarget.split("@");
                if (vaultName.trim().length === 0) {
                    console.error("Missing vault name from link target");
                    return Promise.resolve(null);
                }

                let hostname: string, portNum: number;
                try {
                    [hostname, portNum] = this.resolveHost(connection);
                }
                catch (err) {
                    console.error("Failed to parse connection string");
                    return Promise.resolve(null);
                }

                const [subCommand = null, subArg]: (string | null)[] = rest;
                if (subCommand?.toLowerCase() === "as" && !subArg) {
                    console.error("Missing local nickname for vault link");
                    return Promise.resolve(null);
                }

                return Promise.resolve(async (terminal: Interface): Promise<void> => {
                    const derivedKey = await this.promptPasswordCreation(terminal);
                    if (!derivedKey) {
                        console.error("Bad password");
                        return null;
                    }
                    await this.onVaultLink(hostname, portNum, vaultName, subArg, derivedKey);
                });
            },
        },
        "link": {
            "up": this.onLinkUp.bind(this),
            "down": this.onLinkDown.bind(this),
        },
        "peer": {
            "sync": ([peerId = null]: string[] = []): Promise<CommandReadCallback> => {
                if (peerId === null) {
                    console.error("Missing peer id for peer sync");
                    return Promise.resolve(null);
                }
                return this.onPeerSync(peerId).then(null);
            },
            "link": ([connection = null]: string[] = []): Promise<CommandReadCallback> => {
                if (connection === null) {
                    console.error("Missing connection string for peer link");
                    return Promise.resolve(null);
                }

                let hostname: string, portNum: number;
                try {
                    [hostname, portNum] = this.resolveHost(connection);
                }
                catch (err) {
                    console.error("Failed to parse host string");
                    return Promise.resolve(null);
                }

                return this.onPeerLink(hostname, portNum).then(null);
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
        const commandInterface = createInterface({
            input: stream,
            output: this.term.createWritable(),
            terminal: true,
            prompt: `(${this.services.vault.getActiveVaultName() ?? "mkey"}) % `,
        });

        const commandParseHandler = async function(input: string) {
            commandInterface.removeListener("line", commandParseHandler);

            const args: string[] = input
                            .trim()
                            .split(/\s+/g)
                            .filter(arg => arg.length > 0);

            await this.parseCommand(args)
                .then(async possiblyCallback => {
                    if (!possiblyCallback) {
                        return;
                    }
                    await possiblyCallback(commandInterface);
                })
                .catch(err => console.error(err));

            commandInterface.addListener("line", commandParseHandler);
            commandInterface.setPrompt(`(${this.services.vault.getActiveVaultName() ?? "mkey"}) % `);
            commandInterface.prompt();
        }.bind(this);

        commandInterface.prompt();
        await new Promise<void>(async (resolve, reject) => {
                commandInterface
                    .on("line", commandParseHandler)
                    .on("pause", resolve)
                    .on("error", reject);
            })
            .catch(err => {
                if (err) {
                    console.error("Error:", err);
                }
            });
        commandInterface.close();
    }

    /**
     * Process vault operation commands of the format `vault <...>`
     *
     * @param args List of args passed to the `vault` command
     * I.e., `vault new vaultname` -> ["new", "vaultname"]
     * @returns Promise corresponding to the given vault command.
     */
    private parseCommand(args: string[]): Promise<CommandReadCallback> {
        let command: string,
            commandArgs: string[] = args,
            forward: CommandEntry = this.commands;
        do {
            [command, ...commandArgs] = commandArgs;
            ({ [command]: forward } = forward);
        } while (forward && !(forward instanceof Function));

        return forward && forward instanceof Function
            ? forward(commandArgs)
            : this.onUnknownCommand(args).then(null);
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

    async onUnknownCommand([command = "unknown"]: string[] = []): Promise<void> {
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
    afterEach = this.onStartup.bind(this);

    private async promptPasswordCreation(terminal: Interface): Promise<Buffer | null> {
        process.stdout.write("Enter a password: ");
        return new Promise<string | null>((resolve) => {
                this.term.setSilent(true);
                terminal.once("line", answer => resolve(answer));
            })
            .then(password => {
                // TODO: replace constant salt with a randomly-generated, stored one.
                return CommandServer.createDerivedKey(password, "munkey-salt");
            })
            .catch(err => {
                console.error("Error during password get: ", err);
                return null;
            })
            .finally(() => {
                process.stdout.write("\n");
                this.term.setSilent(false)
            });
    }

}

export {
    CommandServer,
    ShellCommandServer,
};
