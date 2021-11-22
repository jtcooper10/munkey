import * as services from "../../munkey/services";
import express from "express";
import http from "http";

import { describe, it, beforeEach } from "mocha";
import { expect } from "chai";
import request from "supertest";

const sendHttpRequest = function(hostname, port): Promise<http.IncomingMessage> {
    return new Promise(function(resolve, reject) {
            http.get({
                    hostname,
                    port,
                    path: "/",
                }, res => resolve(res))
                .on("error", () => reject(new Error()));
        });
}

describe("Web Server Setup and Teardown", function() {

    let service: services.WebService;
    let app: express.Application;
    let server: http.Server;

    beforeEach(function() {
        app = express();
        service = new services.WebService(app);
        server = null;
    });

    afterEach(function() {
        server?.close();
    });

    it("should be available when listen() is called", async function() {
        app.get("/", (req, res) => res.sendStatus(200));
        server = await service.listen(8000);
        await request(server)
            .get("/")
            .expect(200);
    });

    it("should not be available after close() is called", async function() {
        app.get("/", (req, res) => res.sendStatus(200));
        server = await service.listen(8000);
        await service.close();

        // For some reason, Supertest insists that requests to closed servers are valid.
        // Anytime we need to test for `connection refused`, we must handle it manually.
        await sendHttpRequest("localhost", 8000)
            .then(() => expect.fail("HTTP server was reachable after closing"))
            .catch(err => expect(err).to.be.an("Error"));
    });

    it("should instantiate a unique server after each call to listen()", async function() {
        app.get("/", (req, res) => res.sendStatus(200));
        server = await service.listen(8000);
        await service.close();
        server = await service.listen(8001);

        await sendHttpRequest("localhost", 8000)
            .then(() => expect.fail("HTTP server was still reachable after closing"))
            .catch(err => expect(err).to.be.an("Error"));
        await request(server)
            .get("/")
            .expect(200);
    });
});
