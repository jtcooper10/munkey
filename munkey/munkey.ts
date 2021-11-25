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
import bonjour from "bonjour";
import path from "path";
import PouchDB from "pouchdb";
import MemDown from "memdown";
import winston from "winston";
import { ArgumentParser, Action, Namespace } from "argparse";
import {
    AdminDatabaseDocument,
    AdminService,
    DatabaseConstructor,
    DatabaseDocument,
    DatabasePluginAttachment,
} from "./services";

import { ShellCommandServer } from "./command";
import {
    ServiceContainer,
    generateNewIdentity,
    configureRoutes,
    VaultService,
    IdentityService,
    ActivityService,
    ConnectionService,
    WebService,
} from "./services";
import { createCipheriv, createDecipheriv, randomFill } from "crypto";

const uniformPrint = winston.format.printf(function(
    info: winston.Logform.TransformableInfo & { label: string, timestamp: string }): string
{
    let { level, label, message } = info;
    return `[${level}::${label}] ${message}`;
});

const addUniformLogger = function(serviceName: string): winston.Logger {
    winston.loggers.add(serviceName, {
        format: winston.format.combine(
            winston.format.splat(),
            winston.format.colorize(),
            winston.format.label({ label: serviceName }),
            uniformPrint,
        ),
        transports: [
            new winston.transports.Console({ level: "info" }),
        ]
    });

    return winston.loggers.get(serviceName);
};

const configureLogging = function(services: ServiceContainer): typeof services {
    Object.entries(services)
        .forEach(function([serviceName, service]) {
            service.useLogging(addUniformLogger(serviceName));
        });

    return services;
};

const configurePlugins = function<D, P>(
    options: PouchDB.Configuration.DatabaseConfiguration,
    plugins?: P): DatabaseConstructor<PouchDB.Database<D> & P, D>
{
    // TODO: rigorous type assertions to make this squeaky clean.
    // The main reason this is so ugly right now is because PouchDB's types are pretty wonktacular.
    if (plugins) {
        PouchDB.plugin(<unknown> plugins as PouchDB.Plugin);
    }
    return PouchDB
        .defaults(options) as DatabaseConstructor<PouchDB.Database<D> & P, D>;
}

interface CommandLineArgs {
    root_dir: string;
    port: number;
    discovery_port: number;
    in_memory: boolean;
}

const parseCommandLineArgs = function(argv: string[] = process.argv.slice(2)): CommandLineArgs {
    class PathResolver extends Action {
        call(parser: ArgumentParser,
             namespace: Namespace,
             values: string | string[],
             optionString: string | null): void
        {
            if (values instanceof Array) {
                values = values.join(path.sep);
            }
            namespace[this.dest] = path.resolve(values);
        }
    }
    const parser = new ArgumentParser();
    parser.add_argument("-r", "--root-dir", {
        help: "Root directory where all database and configuration files will be stored to and loaded from",
        action: PathResolver,
        // TODO: on release, change this to something else (temp/home dir maybe?)
        default: path.resolve("localhost"),
    });
    parser.add_argument("-p", "--port", {
        help: "Initial port number for the web server to listen on (can be reconfigured at runtime)",
        type: "int",
        default: 8000,
    });
    parser.add_argument("-d", "--discovery-port", {
        help: "Initial port number for the service discovery server to listen on)",
        type: "int",
        required: false,
    })
    parser.add_argument("--in-memory", {
        help: "Use an in-memory database rather than on-disk (all data lost on application exit)",
        action: "store_true",
    })

    return parser.parse_args(argv) as CommandLineArgs;
}

async function main(services: ServiceContainer): Promise<void> {
    const commands: ShellCommandServer = new ShellCommandServer(services);
    await commands.useStream(process.stdin)
        .then(() => process.exit(0));
}

generateNewIdentity()
    .then(id => {
        const args = parseCommandLineArgs(process.argv.slice(2));
        const {
            root_dir: rootPath,
            port: portNum,
            discovery_port: discoveryPortNum,
        } = args;

        const storedProcedures = {
            putAttachment: PouchDB.prototype.putAttachment,
            getAttachment: PouchDB.prototype.getAttachment,
        };

        // Plugin options are created separately so that we can do full type-checking (see call to .plugin)
        const pluginOptions: DatabasePluginAttachment = {
            putEncryptedAttachment(...args) {
                if (!this.hasOwnProperty("encryptionKey")) {
                    return storedProcedures.putAttachment.call(this, ...args);
                }

                // PouchDB's function signatures are strange...
                // The "optional" argument is revId, which is right in the MIDDLE of the call signature...
                // So, depending on if this "optional" arg is provided, the attachment is either
                // `attachment` (if provided) or `revId` (if not provided).
                let [
                    docId,
                    attachmentId,
                    revId,          // revId | attachment
                    attachment,     // attachment | attachmentType
                    attachmentType, // attachmentType | callback | none
                    callback,       // callback | none
                    ...remainingArgs
                ]: any[] = args;
                let outputArgs: any[] = [ docId, attachmentId ];

                // 3 cases:
                // Case 1: Caller provided no revId. `revId` is actually an attachment.
                //   1a: `attachmentType` is a function, and `callback` is undefined.
                //   1b: `attachmentType` is also undefined (promise-based).
                // Case 2: Caller provided a revId, `attachmentType` is a string: `attachment` is an attachment.
                if (["function", "undefined"].includes(typeof (attachmentType ?? undefined))) {
                    callback = attachmentType;
                    attachmentType = attachment;
                    attachment = revId;
                }
                else if (typeof attachmentType === "string") {
                    outputArgs.push(revId);
                }

                // Determine if it's a promise-based or callback-based call.
                if (typeof callback === "function") {
                    // It's callback-based.
                    throw new Error("Callback-based .putAttachment() proxy not implemented, please use Promise API");
                }
                else {
                    // It's promise-based.
                    return new Promise<Buffer>((resolve, reject) => {
                            randomFill(Buffer.alloc(16), (err, fill) => {
                                if (err) reject(err)
                                else {
                                    resolve(fill);
                                }
                            });
                        })
                        .then(fill => {
                            const cipher = createCipheriv("aes-192-cbc", this.encryptionKey, fill);
                            attachment = Buffer.concat([ fill, cipher.update(attachment), cipher.final() ]);
                            return storedProcedures.putAttachment.call(this,
                                ...outputArgs,
                                attachment,
                                attachmentType,
                                callback,
                                ...remainingArgs);
                        });
                }
            },
            getEncryptedAttachment(...args) {
                if (!this.hasOwnProperty("encryptionKey")) {
                    return storedProcedures.getAttachment.call(this, ...args);
                }

                let callback = args[3];
                if (typeof callback === "function") {
                    // It's callback-based.
                    throw new Error("Callback-based encryption intercept not implemented; please use Promise API");
                }
                else {
                    // It's promise-based.
                    return storedProcedures.getAttachment
                        .call(this, ...args)
                        .then((result: Buffer) => {
                            const fill = result.slice(0, 16);
                            const attachment = result.slice(16);
                            const decipher = createDecipheriv("aes-192-cbc", this.encryptionKey, fill);
                            return Buffer.concat([ decipher.update(attachment), decipher.final() ]);
                        });
                }
            },
            useEncryption(encryptionKey: Buffer) {
                this.encryptionKey = encryptionKey;
            },
        };

        const LocalDB = configurePlugins<DatabaseDocument, DatabasePluginAttachment>(
            {
                prefix: rootPath + path.sep + "munkey" + path.sep,
                db: args.in_memory ? MemDown : undefined,
            } as PouchDB.Configuration.DatabaseConfiguration,
            pluginOptions,
        );
        const AdminDB = configurePlugins<AdminDatabaseDocument, {}>(
            {
                prefix: rootPath + path.sep + "admin" + path.sep,
                db: args.in_memory ? MemDown : undefined,
            } as PouchDB.Configuration.DatabaseConfiguration,
        );

        return Promise.resolve(configureLogging({
                vault: new VaultService(LocalDB),
                identity: new IdentityService(id),
                activity: new ActivityService(bonjour()),
                connection: new ConnectionService(),
                web: new WebService(express()),
                admin: new AdminService(new AdminDB("info")),
            }))
            .then(services => configureRoutes(services, {
                portNum,
                rootPath,
                discoveryPortNum,
            }));
    })
    .then(services => main(services))
    .catch(err => {
        console.error(err);
    });
