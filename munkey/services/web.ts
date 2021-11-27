import http from "http";
import https from "https";
import ip from "ip";
import express from "express";

import Service from "./baseService";
import { TlsKeyPair } from "./identity";
import ErrnoException = NodeJS.ErrnoException;

interface WebServiceListenerOptions {
    hostname?: string;
    portNum?: number;
    tlsKeyPair?: TlsKeyPair;
}

export default class WebService extends Service {
    private server: http.Server | https.Server;
    private defaultPort: number;
    private defaultTlsKeyPair: TlsKeyPair;

    constructor(private app: express.Application) {
        super();
        this.server = null;
        this.defaultPort = 8000;
        this.defaultTlsKeyPair = null;
    }

    public getApplication(): express.Application {
        return this.app;
    }

    public listen(options?: WebServiceListenerOptions): Promise<http.Server>
    {
        const {
            hostname = ip.address(),
            portNum = this.defaultPort,
            tlsKeyPair = this.defaultTlsKeyPair,
        } = options;
        this.defaultTlsKeyPair = this.defaultTlsKeyPair ?? tlsKeyPair;

        if (tlsKeyPair) {
            this.logger.info("Creating HTTPS server at https://%s:%d", hostname, portNum);
            this.server = https.createServer({ rejectUnauthorized: false, ...tlsKeyPair }, this.getApplication());
        }
        else {
            this.logger.info("Creating HTTP server at http://%s:%d", hostname, portNum);
            this.server = http.createServer(this.getApplication());
        }

        return new Promise<http.Server>((resolve, reject) => {
            this.server.listen(
                this.defaultPort = portNum,
                hostname, () => {
                    this.logger.info("Listening on port %d", portNum);
                    resolve(this.server);
                })
                .on("error", (err: ErrnoException) => {
                    if (err.code === "EADDRINUSE") {
                        this.logger.warn(`Port ${portNum} not available`);
                    }
                    reject(err);
                });
        })
            .then(server => this.server = server);
    }

    public close(): Promise<void> {
        return new Promise(function(resolve, reject) {
            this.server = this.server?.close(err => {
                if (err) reject(err);
                else {
                    this.logger.info("Server closed");
                    resolve();
                }
            });
        }.bind(this));
    }
}
