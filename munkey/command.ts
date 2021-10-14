/**
 * socket.ts
 * 
 * @author  : Joshua Cooper
 * @created : 10/17/2021
 */

import { Readable } from "stream";

interface CommandServer {
    onUnknownCommand?(command: string, args: string[]): Promise<void>;
    onStartup?(): Promise<void>;
    beforeEach?(): void;
    afterEach?(): void;
}

/**
 * Container for managing and dispatching external commands to the application.
 * 
 * Despite the name, CommandServer is not a literal HTTP/TCP/etc. server, but an internal one.
 * The CommandServer is intended to be input-agnostic, and can provide command parsing to any readable stream.
 * 
 * Each abstract method is a potential command that may be received. Implement the method to define its behavior.
 */
abstract class CommandServer {

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
                const [command, ...args]: string[] = chunk.toString().split(/\s+/g);

                switch (command.toLowerCase()) {
                case "vault":
                    await this.parseVaultCommand(args.filter(arg => arg.length > 0));
                default:
                    await this.onUnknownCommand(command, args);
                }

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
     * @param rawArgs List of args passed to the `vault` command
     * I.e., `vault new vaultname` -> ["new", "vaultname"]
     * @returns Promise corresponding to the given vault command.
     */
    private parseVaultCommand(rawArgs: string[]): Promise<void> {
        if (rawArgs.length <= 0) {
            console.error("Not enough arguments");
            return Promise.resolve();
        }

        const [command, ...args] = rawArgs;
        switch (command) {
        case "new":
            if (args.length < 1) {
                console.error("Not enough arguments");
                return Promise.resolve();
            }
            return this.onCreateVault(args[0]);
        case "add":
            if (args.length < 2) {
                console.error("No data provided");
                return Promise.resolve();
            }
            return this.onAddVaultEntry(args[0], args[1]);
        case "get":
            if (args.length < 1) {
                console.error("Not enough arguments");
                return Promise.resolve();
            }
            return this.onGetVaultEntry(args[0]);
        }
    }

    abstract onCreateVault(vaultName: string): Promise<void>;
    abstract onAddVaultEntry(entryKey: string, data: string): Promise<void>;
    abstract onGetVaultEntry(entryKey: string): Promise<void>;

    async onUnknownCommand?(command: string, args: string[]): Promise<void> {}
    async onStartup?(): Promise<void> {}
    beforeEach?() {}
    afterEach?() {}
}

export {
    CommandServer,
};
