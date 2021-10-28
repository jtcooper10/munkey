/**
 * Copyright (c) 2021
 *
 * MIT License (MIT)
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the “Software”), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies
 * or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
 * THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
 * OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * @author  : Joshua Cooper
 * @created : 10/13/2021
 */

import express from "express";
import { CommandServer } from "./command";
import { ServiceContainer, configureRoutes, VaultContainer } from "./services";

async function main(app: express.Application, services: ServiceContainer): Promise<void> {
    const commands: CommandServer = new class extends CommandServer {
        private currentVault?: string = null;
        private vault?: any = null;

        async onCreateVault(vaultName: string): Promise<void> {
            console.info(`Creating new vault (${vaultName})`);

            if (services.vault.getVault(vaultName)) {
                return console.error(`Cannot create vault ${vaultName} (already exists)`);
            }

            this.vault = services.vault.createVault(vaultName);
            await this.vault.put({
                _id: "dict",
                entries: {},
            });
            this.currentVault = vaultName;
        }

        async onAddVaultEntry(entryKey: string, data: string): Promise<void> {
            if (this.vault === null) {
                console.error("No vault selected; please select or create a vault");
                return Promise.resolve();
            }

            console.info(`Adding new vault entry to ${this.currentVault}`);
            const { _rev, entries } = await this.vault
                .get("dict")
                .catch(err => console.error(err));

            if (entryKey in entries) {
                console.error("Entry already exists");
                return Promise.resolve();
            }

            await this.vault.put({
                _id: "dict",
                _rev,
                entries: { ...entries, [entryKey]: data },
            }).catch(err => console.error(err));
        }

        async onGetVaultEntry(entryKey: string): Promise<void> {
            if (this.vault === null) {
                console.error("No vault selected; please select or create a vault");
                return Promise.resolve();
            }

            const { entries } = await this.vault.get("dict")
                .catch(err => console.error(err));

            const data = entries[entryKey];
            if (!data) {
                console.error("Vault entry not found");
            }
            else {
                console.info(`[${entryKey}] = ${data}`);
            }
        }

        async onLinkUp(): Promise<void> {
            console.info("Unimplemented command: link up");
        }

        async onLinkDown(): Promise<void> {
            console.info("Unimplemented command: link down");
        }

        async onPeerSync(peerId: string): Promise<void> {
            console.info(`Unimplemented command: peer sync ${peerId}`);
        }

        async onPeerLink(hostname: string, portNum: number): Promise<void> {
            console.log(`Connecting to ${hostname}, port ${portNum}`);
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
    };

    await commands.useStream(process.stdin)
        .then(() => process.exit(0));
}

configureRoutes(express())
    .then(app => main(app, {
        vault: new VaultContainer(),
    }))
    .catch(err => {
        console.error(err);
    });
