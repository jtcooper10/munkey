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

import http from "http";
import PouchDB from "pouchdb";
import express from "express";
import usePouchDB from "express-pouchdb";
import { CommandServer } from "./command";

const MemoryDB = PouchDB.defaults({
    db: require("memdown")
});

const portNum: number = process.argv.length > 2
    ? parseInt(process.argv[2])
    : 8000;

let server: http.Server = null;

async function configureRoutes(app: express.Application): Promise<express.Application> {
    app.get("/", function(request, response) {
        response.send("Hello, world!\n");
    });

    app.use("/db", usePouchDB(MemoryDB));

    return app;
}

async function main(): Promise<void> {
    const vaultDb = new MemoryDB("vault");

    const commands: CommandServer = new class extends CommandServer {
        private currentVault?: string = null;

        async onCreateVault(vaultName: string): Promise<void> {
            console.info(`Creating new vault (${vaultName})`);

            await vaultDb.put({
                _id: vaultName,
                entries: {},
            })
            .then(() => {
                this.currentVault = vaultName;
            })
            .catch(err => {
                if (err.status === 409) {
                    console.error(`Cannot create vault ${vaultName} (already exists)`);
                }
                else {
                    console.error(err);
                }
            });
        }

        async onAddVaultEntry(entryKey: string, data: string): Promise<void> {
            if (this.currentVault === null) {
                console.error("No vault selected; please select or create a vault");
                return Promise.resolve();
            }

            console.info(`Adding new vault entry to ${this.currentVault}`);
            const vault = await vaultDb.get(this.currentVault)
                .catch(err => console.error(err));

            if (vault) {
                const { entries } = vault;
                if (entryKey in entries) {
                    console.error("Entry already exists");
                    return Promise.resolve();
                }

                await vaultDb.put({
                    _id: this.currentVault,
                    _rev: vault._rev,
                    entries: { ...entries, [entryKey]: data },
                }).catch(err => console.error(err));
            }
        }

        async onGetVaultEntry(entryKey: string): Promise<void> {
            if (this.currentVault === null) {
                console.error("No vault selected; please select or create a vault");
                return Promise.resolve();
            }

            const vault = await vaultDb.get(this.currentVault)
                .catch(err => console.error(err));
            
            if (vault) {
                const data = vault.entries[entryKey];
                if (!data) {
                    console.error("Vault entry not found");
                }
                else {
                    console.info(`[${entryKey}] = ${data}`);
                }
            }
        }

        async onUnknownCommand([command = "unknown", ...args]: string[] = []): Promise<void> {
            if (["q", "quit", "exit"].includes(command?.toLowerCase())) {
                console.info("Goodbye!");
                process.exit(0);
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
    .then(app => (
        new Promise<http.Server>(function(resolve)  {
            server = app.listen(portNum, () => {
                console.log(`Listening on port ${portNum}`);
                resolve(server);
            });
        })
    ))
    .then(main)
    .catch(err => {
        console.error(err);
        if (server !== null) {
            server = server.close(serverErr => {
                console.error(serverErr);
            });
        }
    });
