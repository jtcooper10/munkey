import { createInterface, Interface } from "readline";
import { Readable, Writable } from "stream";

import CommandServer from "./CommandServer";
import { DeviceDiscoveryDecl } from "../discovery";
import { ServiceContainer } from "../services";
import { EncryptionCipher } from "../pouch";
import { Result } from "../error";

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
    private activeVault: string | null;

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
                .then(password => this.onCreateVault(vaultName, new EncryptionCipher(password)))
                .then(() => {
                    this.activeVault = vaultName;
                    return null;
                }));
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

    public async vaultDelete([vaultName = null]: string[] = []): Promise<CommandReadCallback> {
        if (vaultName === null) {
            console.error("Missing name for vault deletion");
            return Promise.resolve(null);
        }

        const vaultResult = await this.onDeleteVault(vaultName);
        if (vaultResult.success) {
            console.info(`Successfully deleted vault ${vaultName} (${vaultResult.unpack("[unknown_id]")})`);
            if (vaultName === this.activeVault)
                this.activeVault = null;
        }
        else
            console.error("Failed to delete vault: ", vaultResult.message);

        return null;
    }

    public vaultUse([vaultName = null]: string[] = []): Promise<CommandReadCallback> {
        if (vaultName === null) {
            console.error("Missing name for vault switch");
        }
        else if (!this.services.vault.getVaultByName(vaultName)) {
            console.error(`No vault found with name ${vaultName}`);
        }
        else {
            this.activeVault = vaultName;
            console.info(`Active vault set to ${this.activeVault}`);
        }
        return Promise.resolve(null);
    }

    public vaultSet([entryKey = null, entryData = null]: string[] = []): Promise<CommandReadCallback> {
        if (entryKey === null || entryData === null) {
            console.error(`Missing ${entryKey ? "data" : "key name"} for entry creation`);
            return Promise.resolve(null);
        }
        else if (!this.activeVault) {
            console.error("No vault selected");
            return Promise.resolve(null);
        }

        return this.onSetVaultEntry(this.activeVault, entryKey, entryData).then(null);
    }

    public vaultGet([entryKey = null]: string[]): Promise<CommandReadCallback> {
        if (entryKey === null) {
            console.error("Missing key name for entry retrieval");
            return Promise.resolve(null);
        }
        else if (!this.activeVault) {
            console.error("No vault selected");
            return Promise.resolve(null);
        }

        return this.onGetVaultEntry(this.activeVault, entryKey).then(null);
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
            const linkResult = await this.onVaultLink(hostname, portNum, vaultName, subArg, new EncryptionCipher(derivedKey));
            if (!linkResult.success) {
                console.error(`Failed to link vault: ${linkResult.message ?? "An unknown error occurred"}`);
            }
        });
    }

    public async vaultList(): Promise<null> {
        const vaultList = await this.onListVaults();

        if (!vaultList.success) {
            console.error(vaultList.message);
        }
        else {
            promptList(vaultList.data.vaults, "Active Vaults");
            for (let vault of vaultList.data.vaults) {
                console.info(
                    ` ${vault.nickname === this.activeVault ? "*" : " "} \"${vault.nickname}\" = Vault[${vault.vaultId}]`);
            }

            promptList(vaultList.data.connections, "Remote Vaults");
            for (let [name, url] of vaultList.data.connections) {
                console.info(`   ${url} = RemoteVault[${name}]`);
            }
        }

        function promptList(list: any[], message: string) {
            if (list.length > 0) {
                console.info(`:: :: ${message} :: ::`);
            }
        }

        return Promise.resolve(null);
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

        console.info(`Connecting to ${hostname}, port ${portNum}`);
        return this.onPeerLink(hostname, portNum).then(result => {
            if (result.success) {
                console.info(result.message);
            }
            else {
                console.error(result.message);
            }
            return null;
        });
    }

    public async peerList(): Promise<void> {
        const peerList = await this.onPeerList();

        if (!peerList.success) {
            console.error(`Failed to resolve peer list: ${peerList.message}`);
            return;
        }

        for (let { hostname, portNum, uniqueId, vaults } of peerList.unpack([])) {
            console.info(` Peer[${uniqueId}]@${hostname}:${portNum}`);
            for (let vault of vaults) {
                console.info(`\t* "${vault.nickname}": Vault[${vault.vaultId}]`);
            }
        }
    }

    public async linkUp([portNum = null]: string[] = []): Promise<void> {
        const portNumParsed: number = parseInt(portNum) || 8000;
        const result = await this.onLinkUp(portNumParsed);
        if (result.success) {
            console.info(`Server now listening on port ${result.unpack(portNumParsed)}`);
        }
        else {
            console.error(result.message);
        }
    }

    public async linkDown(): Promise<void> {
        const serverResult: Result = await this.onLinkDown();
        if (serverResult.success) {
            console.log("Server closed successfully");
        }
        else {
            console.error(`Failed to close server: ${serverResult.message}`);
        }
    }

    private commands: CommandSet = {
        "vault": {
            "new": this.vaultNew.bind(this),
            "login": this.vaultLogin.bind(this),
            "delete": this.vaultDelete.bind(this),
            "use": this.vaultUse.bind(this),
            "set": this.vaultSet.bind(this),
            "get": this.vaultGet.bind(this),
            "list": this.vaultList.bind(this),
            "link": this.vaultLink.bind(this),
        },
        "link": {
            "up": this.linkUp.bind(this),
            "down": this.linkDown.bind(this),
        },
        "peer": {
            "link": this.peerLink.bind(this),
            "list": this.peerList.bind(this),
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
            prompt: `(${this.activeVault ?? "mkey"}) % `,
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
            commandInterface.setPrompt(`(${this.activeVault ?? "mkey"}) % `);
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
