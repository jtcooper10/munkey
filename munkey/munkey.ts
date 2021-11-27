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
import { ArgumentParser, Action, Namespace } from "argparse";

import {
    AdminDatabaseDocument,
    AdminService,
    DatabaseDocument,
} from "./services";
import {
    configureRoutes,
    configurePlugins,
    configureLogging,
    DatabasePluginAttachment, encryptionPlugin,
} from "./configure";
import { ShellCommandServer } from "./command";
import {
    generateNewIdentity,
    ServiceContainer,
    VaultService,
    IdentityService,
    ActivityService,
    ConnectionService,
    WebService,
} from "./services";
import { LoggingOptions } from "./logging";

interface CommandLineArgs {
    root_dir: string;
    port: number;
    discovery_port: number;
    in_memory: boolean;
    verbose: boolean;
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
    });
    parser.add_argument("--in-memory", {
        help: "Use an in-memory database rather than on-disk (all data lost on application exit)",
        action: "store_true",
    });
    parser.add_argument("--verbose", {
        help: "Print all logging information to the console",
        action: "store_true",
    });

    return parser.parse_args(argv) as CommandLineArgs;
}

async function main(services: ServiceContainer): Promise<void> {
    const commands: ShellCommandServer = new ShellCommandServer(services);
    await commands.useStream(process.stdin)
        .then(() => process.exit(0));
}

const commandLineArgs = parseCommandLineArgs(process.argv.slice(2));

generateNewIdentity(commandLineArgs.root_dir)
    .then(({ uniqueId, ...keyPair }) => {
        // IMPORTANT: This line is to allow for self-signed certificates.
        // Since we use TLS only for establishing an encrypted connection, not for validation,
        // there is no need to validate the source. So, we set strict TLS to false.
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

        const {
            root_dir: rootPath,
            port: portNum,
            discovery_port: discoveryPortNum,
            in_memory: isInMemory,
            verbose,
        } = commandLineArgs;
        const loggingOptions: LoggingOptions = {
            logLevel: "info",
            loggingLocation: path.resolve(rootPath, "munkey.log"),
            useConsole: verbose,
        };

        const LocalDB = configurePlugins<DatabaseDocument, DatabasePluginAttachment>(
            {
                prefix: rootPath + path.sep + "munkey" + path.sep,
                db: isInMemory ? MemDown : undefined,
            } as PouchDB.Configuration.DatabaseConfiguration,
            encryptionPlugin,
        );
        const AdminDB = configurePlugins<AdminDatabaseDocument, {}>(
            {
                prefix: rootPath + path.sep + "admin" + path.sep,
                db: isInMemory ? MemDown : undefined,
            } as PouchDB.Configuration.DatabaseConfiguration,
        );

        return Promise.resolve(configureLogging({
                vault: new VaultService(LocalDB),
                identity: new IdentityService(uniqueId, keyPair),
                activity: new ActivityService(bonjour()),
                connection: new ConnectionService(),
                web: new WebService(express()),
                admin: new AdminService(new AdminDB("info")),
            }, loggingOptions))
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
