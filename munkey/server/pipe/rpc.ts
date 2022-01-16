import CommandServer from "../CommandServer";
import {
    IVaultServer,
    VaultActionResult, VaultCollection,
    VaultCollectionRequest,
    VaultCreationRequest,
    VaultData,
    VaultRequest
} from "@munkey/munkey-rpc";
import { sendUnaryData, ServerReadableStream, ServerWritableStream } from "@grpc/grpc-js";

export default function createVaultServer<T extends CommandServer>(commands: T): IVaultServer {
    return {
        create(call: ServerReadableStream<VaultCreationRequest, VaultActionResult>,
               respond: sendUnaryData<VaultActionResult>): void
        {
            call.on("data", data => {
                console.log("[Server]", data.getName(), new TextDecoder("utf-8").decode(data.getInitialdata()));
                respond(null, new VaultActionResult().setMessage("not implemented"));
            });
        },
        delete(call: ServerReadableStream<VaultRequest, VaultActionResult>,
               respond: sendUnaryData<VaultActionResult>): void
        {
            respond(null, new VaultActionResult().setMessage("not implemented"));
        },
        getContent(call: ServerWritableStream<VaultRequest, VaultData>): void {
        },
        list(call: ServerWritableStream<VaultCollectionRequest, VaultCollection>): void {
            call.write(
                new VaultCollection()
                    .setSize(0)
                    .setListList([]),
                () => call.end());
        },
        setContent(call: ServerReadableStream<VaultCreationRequest, VaultActionResult>,
                   respond: sendUnaryData<VaultActionResult>): void
        {
            call.on("data", data => {
                console.log("[Server]", data.getName(), new TextDecoder("utf-8").decode(data.getInitialdata()));
                respond(null, new VaultActionResult().setMessage("not implemented"));
            });
        }

    };
}