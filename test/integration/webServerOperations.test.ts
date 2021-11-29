import * as services from "../../munkey/services";
import express from "express";
import http from "http";

import { describe, it, beforeEach } from "mocha";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import request from "supertest";

chai.use(chaiAsPromised);

const sendHttpRequest = function(hostname, port): Promise<http.IncomingMessage> {
    return new Promise(function(resolve, reject) {
            http.get({
                    hostname,
                    port,
                    path: "/",
                }, res => resolve(res))
                .on("error", err => reject(err));
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
        server = await service.listen({ portNum: 8000, hostname: "localhost" });
        await request(server)
            .get("/")
            .expect(200);
    });

    it("should not be available after close() is called", async function() {
        app.get("/", (req, res) => res.sendStatus(200));
        server = await service.listen({ portNum: 8000, hostname: "localhost" });
        await service.close();

        // For some reason, Supertest insists that requests to closed servers are valid.
        // Anytime we need to test for `connection refused`, we must handle it manually.
        await expect(sendHttpRequest("localhost", 8000)).to.be.rejected;
    });

    it("should instantiate a unique server after each call to listen()", async function() {
        app.get("/", (req, res) => res.sendStatus(200));
        server = await service.listen({ portNum: 8000, hostname: "localhost" });
        await service.close();
        server = await service.listen({ portNum: 8001, hostname: "localhost" });

        await expect(sendHttpRequest("localhost", 8000)).to.be.rejected;
        await expect(sendHttpRequest("localhost", 8001)).to.be.fulfilled;
    });

});
