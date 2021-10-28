/**
 * socket.ts
 * 
 * @author  : Joshua Cooper
 * @created : 10/17/2021
 */

import { Readable } from "stream";

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

            "set": ([entryKey = null, entryData = null]: string[] = []): Promise<void> => {
                if (entryKey === null || entryData === null) {
                    console.error(`Missing ${entryKey ? "data" : "key name"} for entry creation`);
                    return Promise.resolve();
                }
                return this.onAddVaultEntry(entryKey, entryData);
            },

            "get": ([entryKey = null]: string[]): Promise<void> => {
                if (entryKey === null) {
                    console.error("Missing key name for entry retrieval");
                    return Promise.resolve();
                }
                return this.onGetVaultEntry(entryKey);
            },
        },
        "link": {
            "up": this.onLinkUp,
            "down": this.onLinkDown,
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
                    return Promise.resolve();
                }
                else {
                    return this.onPeerLink(hostname, portNum);
                }
            },
            "list": this.onPeerList,
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

    abstract onCreateVault(vaultName: string): Promise<void>;
    abstract onAddVaultEntry(entryKey: string, data: string): Promise<void>;
    abstract onGetVaultEntry(entryKey: string): Promise<void>;

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

export {
    CommandServer,
};
