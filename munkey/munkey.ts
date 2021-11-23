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
import path from "path";
import PouchDB from "pouchdb";
import MemDown from "memdown";
import winston from "winston";
import {ArgumentParser, Action, Namespace } from "argparse";
import {
    AdminService,
    DatabaseConstructor,
    DatabaseDocument
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

interface CommandLineArgs {
    root_dir: string;
    port: number;
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
    parser.add_argument("--in-memory", {
        help: "Use an in-memory database rather than on-disk (all data lost on application exit)",
        action: "store_true",
    })

    return parser.parse_args(argv) as CommandLineArgs;
}

async function main(services: ServiceContainer): Promise<void> {
    const commands: ShellCommandServer = new ShellCommandServer(services);
    await services.vault.useAdminService(
        await services.admin.initialize()
    );
    await commands.useStream(process.stdin)
        .then(() => process.exit(0));
}

generateNewIdentity()
    .then(id => {
        const args = parseCommandLineArgs(process.argv.slice(2));
        const rootPath = args.root_dir;
        const portNum = args.port;

        const LocalDB: DatabaseConstructor<DatabaseDocument> = PouchDB.defaults(
            <PouchDB.Configuration.DatabaseConfiguration> {
                prefix: rootPath + path.sep + "munkey" + path.sep,
                db: args.in_memory ? MemDown : undefined,
            });
        const AdminDB: DatabaseConstructor<DatabaseDocument> = PouchDB.defaults(
            <PouchDB.Configuration.DatabaseConfiguration> {
                prefix: rootPath + path.sep + "admin" + path.sep,
                db: args.in_memory ? MemDown : undefined,
            });

        return Promise.resolve(configureLogging({
                vault: new VaultService(LocalDB),
                identity: new IdentityService(id),
                activity: new ActivityService(),
                connection: new ConnectionService(),
                web: new WebService(express()),
                admin: new AdminService(new AdminDB("info")),
            }))
            .then(services => configureRoutes(services, {
                portNum,
                rootPath,
            }));
    })
    .then(services => main(services))
    .catch(err => {
        console.error(err);
    });
