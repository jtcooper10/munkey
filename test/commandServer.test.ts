import { CommandServer, ShellCommandServer } from "../munkey/command";
import * as services from "../munkey/services";
import { Readable } from "stream";

import { describe, it, before, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";

describe("Test behavior of shell commands", function() {

    let container: services.ServiceContainer;
    let consoleSpy;
    let server: CommandServer;

    before(() => {
        container = {
            activity: new services.ActivityService(),
            vault: new services.VaultContainer(),
            identity: new services.IdentityService(""),
        };
        server = new ShellCommandServer(container);
        sinon.stub(server, "onStartup");
        sinon.stub(server, "afterEach");
        consoleSpy = sinon.createSandbox();
    });

    beforeEach(() => {
        // Stubs are to prevent info/error messages from appearing.
        // Remove when internal calls are replaces with a logger.
        consoleSpy.stub(console);
    });

    afterEach(() => {
        consoleSpy.restore();
    });

    it("should create a new vault on `vault new`", async function() {
        const stub = sinon.stub(container.vault, "createVault");

        await server.useStream(Readable.from("vault new testing123\n"));
        expect(stub.called).to.be.true;

        stub.restore();
    });

    it("should fail to create a vault when no id is provided to `vault new`", async function() {
        const stub = sinon.stub(container.vault, "createVault");

        await server.useStream(Readable.from("vault new\n"));
        expect(stub.called).to.be.false;

        stub.restore();
    });
});
