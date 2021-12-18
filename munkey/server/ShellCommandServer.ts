import { createInterface, Interface } from "readline";
import { Readable, Writable } from "stream";

import CommandServer from "./CommandServer";
import { DeviceDiscoveryDecl } from "../discovery";
import { ServiceContainer } from "../services";
import { EncryptionCipher } from "../pouch";

type CommandReadCallback = ((sessionInterface: Interface) => Promise<any>) | null;
type CommandEntry = ((args: string[]) => Promise<CommandReadCallback>) | CommandSet;
type CommandSet = { [command: string]: CommandEntry };

class SilentTerminal {
    constructor(
        private silent: boolean = false,
        private baseWritable: Writable = process.stdout) {

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
        cb?: (error: Error | null | undefined) => void): boolean {
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

    public vaultNew([vaultName = null]: string[] = []): Promise<CommandReadCallback> {
        if (vaultName === null) {
            console.error("Missing name for vault creation");
            return Promise.resolve(null);
        }
        return Promise.resolve(stream => this
            .promptPasswordCreation(stream)
            .then(password => this.onCreateVault(vaultName, new EncryptionCipher(password))));
    }

    public vaultLogin([vaultName = null]: string[] = []): Promise<CommandReadCallback> {
        if (vaultName === null) {
            console.error("Missing name for vault login");
            return Promise.resolve(null);
        }
        return Promise.resolve(stream => this
            .promptPasswordCreation(stream)
            .then(password => this.onVaultLogin(vaultName, password)));
    }

    public vaultDelete([vaultName = null]: string[] = []): Promise<CommandReadCallback> {
        if (vaultName === null) {
            console.error("Missing name for vault deletion");
            return Promise.resolve(null);
        }
        return this.onDeleteVault(vaultName).then(null);
    }

    public vaultUse([vaultName = null]: string[] = []): Promise<CommandReadCallback> {
        if (vaultName === null) {
            console.error("Missing name for vault switch");
            return Promise.resolve(null);
        }
        return this.onUseVault(vaultName).then(null);
    }

    public vaultSet([entryKey = null, entryData = null]: string[] = []): Promise<CommandReadCallback> {
        if (entryKey === null || entryData === null) {
            console.error(`Missing ${entryKey ? "data" : "key name"} for entry creation`);
            return Promise.resolve(null);
        }
        return this.onSetVaultEntry(entryKey, entryData).then(null);
    }

    public vaultGet([entryKey = null]: string[]): Promise<CommandReadCallback> {
        if (entryKey === null) {
            console.error("Missing key name for entry retrieval");
            return Promise.resolve(null);
        }
        return this.onGetVaultEntry(entryKey).then(null);
    }

    public vaultLink([linkTarget = null, ...rest]: string[]): Promise<CommandReadCallback> {
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
            // There's still hope; try to resolve the vault name from the APL
            let vaultsFound: DeviceDiscoveryDecl[] = [];
            for (let [vaultId, device] of this.services.activity.resolveVaultName(vaultName)) {
                if (vaultsFound.length === 0) {
                    console.info("Potential vaults ahoy!");
                }
                console.info(`  * RemoteVault[${vaultId}]@${device.hostname}:${device.portNum}`);
                vaultsFound.push(device);
            }

            // TODO: when >1 device resolved, prompt the user to pick a vault from the list
            // For now, we just pick the last one from the list.
            ({ hostname, portNum } = vaultsFound.pop() ?? {});
            if (!hostname || !portNum) {
                console.error(`Failed to resolve ${vaultName} to a remote vault`);
                return Promise.resolve(null);
            }
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
            await this.onVaultLink(hostname, portNum, vaultName, subArg, new EncryptionCipher(derivedKey));
        });
    }

    public peerLink([connection = null]: string[] = []): Promise<CommandReadCallback> {
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
    }

    private commands: CommandSet = {
        "vault": {
            "new": this.vaultNew.bind(this),
            "login": this.vaultLogin.bind(this),
            "delete": this.vaultDelete.bind(this),
            "use": this.vaultUse.bind(this),
            "set": this.vaultSet.bind(this),
            "get": this.vaultGet.bind(this),
            "list": this.onListVaults.bind(this),
            "link": this.vaultLink.bind(this),
        },
        "link": {
            "up": this.onLinkUp.bind(this),
            "down": this.onLinkDown.bind(this),
        },
        "peer": {
            "link": this.peerLink.bind(this),
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

        const commandParseHandler = async function (input: string) {
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
            portNum: string | number;
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
            await this.services.activity.stop();
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

export default ShellCommandServer;
