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
import winston from "winston";
import { DatabaseConstructor, DatabaseDocument } from "./services";

const LocalDB: DatabaseConstructor<DatabaseDocument> = PouchDB.defaults({
    prefix: path.resolve("localhost") + path.sep,
});

import { CommandServer, ShellCommandServer } from "./command";
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

async function main(services: ServiceContainer): Promise<void> {
    const commands: CommandServer = new ShellCommandServer(services);
    await commands.useStream(process.stdin)
        .then(() => process.exit(0));
}

generateNewIdentity()
    .then(id => configureLogging({
        vault: new VaultService(LocalDB),
        identity: new IdentityService(id),
        activity: new ActivityService(),
        connection: new ConnectionService(),
        web: new WebService(express()),
    }))
    .then(services => configureRoutes(services, {
        portNum: process.argv.length > 2 ? parseInt(process.argv[2]) : 8000,
        logging: addUniformLogger("http"),
    }))
    .then(services => main(services))
    .catch(err => {
        console.error(err);
    });
