import PipeCommandServer from "../../server/pipe";

import {
    IVaultClient,
    IVaultServer,
    VaultActionResult,
    VaultClient,
    VaultCreationRequest,
    VaultData,
    VaultRequest, VaultStatus
} from "@munkey/munkey-rpc";
import * as grpc from "@grpc/grpc-js";

import { expect } from "chai";
import { describe, before, beforeEach, it } from "mocha";
import sinon from "sinon";
import { VaultService } from "../../services";
import createVaultServer from "../../server/pipe/rpc";
import { success, successItem } from "../../error";

describe("Test gRPC vault server implementations", function() {
    let vault: VaultService;
    let sandbox: sinon.SinonSandbox;
    let commands: PipeCommandServer;
    let server: IVaultServer;
    let grpcServer: grpc.Server;
    let client: IVaultClient;

    it("calls .onGetContent() correctly when issued a valid GetContent() command", async function() {
        let onGetContent = sandbox
            .stub(commands, "onGetContent")
            .resolves(successItem(Buffer.from("lol")));
        let request = new VaultRequest()
            .setName("lol");

        const result = await new Promise<VaultData>(function(resolve, reject) {
            client.getContent(request, (err, data) => {
                if (err) reject(err);
                resolve(data);
            });
        });
        
        expect(onGetContent.called, ".onGetContent() was not called").to.be.true;
        expect(onGetContent.calledWith("lol"), ".onGetContent called with incorrect vault name").to.be.true;
        // expect(result.getEntry()).to.equal("lol");
        expect(result.getStatus()).to.equal(VaultStatus.OK);
    });

    it("calls .onSetContent() correctly when issued a valid SetContent() command", async function() {
        let onSetContent = sandbox.stub(commands, "onSetContent")
            .resolves(success());
        let request = new VaultCreationRequest()
            .setName("lol")
            .setInitialdata(Buffer.from("{\"value\":\"lol\"}"));

        const result = await new Promise<VaultActionResult>(function(resolve, reject) {
            client.setContent(request, (err, response) => {
                if (err) reject(err);
                resolve(response);
            });
        });

        expect(onSetContent.called, "Call to SetContent() did not invoke .onSetContent()").to.be.true;
        expect(onSetContent.calledWith("lol"),
            "Call to SetContent() invoked .onSetContent() with bad vault name").to.be.true;
        expect(result.getStatus()).to.equal(VaultStatus.OK,
            `Server response indicated failure (return code = ${result.getStatus()})`);
    });

    before(async function() {
        vault = new VaultService(null);
        commands = new PipeCommandServer({
            vault,
            admin: null, web: null, identity: null, connection: null, activity: null
        });
        server = createVaultServer(commands);
        grpcServer = await commands.useGrpc(new grpc.Server());
        client = new VaultClient("127.0.0.1:5050", grpc.credentials.createInsecure());
    });

    beforeEach(function() {
        sandbox = sinon.createSandbox();
    });

    after(function() {
        grpcServer.forceShutdown();
    });

    afterEach(function() {
        sandbox.restore();
    });

});
