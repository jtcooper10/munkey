import CommandServer from "../CommandServer";
import {
    IVaultServer,
    VaultActionResult,
    VaultCollection,
    VaultCollectionRequest,
    VaultCreationRequest,
    VaultData,
    VaultEntry,
    VaultRequest,
    VaultStatus
} from "@munkey/munkey-rpc";
import {
    sendUnaryData,
    ServerReadableStream,
    ServerUnaryCall,
    ServerWritableStream,
    UntypedHandleCall
} from "@grpc/grpc-js";


export default function createVaultServer<T extends CommandServer>(commands: T): IVaultServer {
    class VaultServer implements IVaultServer {
        [name: string]: UntypedHandleCall;

        public createVault(call: ServerReadableStream<VaultCreationRequest, VaultActionResult>,
                           respond: sendUnaryData<VaultActionResult>): void
        {
            call.on("data", data => {
                commands.onCreateVault(data.getName(), Buffer.from(data.getInitialdata()))
                    .then(result => {
                        if (!result.success) {
                            return respond(new Error(result.message));
                        }

                        respond(null,
                            new VaultActionResult()
                                .setMessage(result.message)
                                .setStatus(VaultStatus.OK)
                        );
                    });
            });
        }

        public deleteVault(call: ServerUnaryCall<VaultRequest, VaultActionResult>,
                           respond: sendUnaryData<VaultActionResult>): void
        {
            call.on("data", async data => {
                const deleteResult = await commands.onDeleteVault(data.getName());
                if (!deleteResult.success) {
                    return respond(new Error(), null);
                }
                respond(null,
                    new VaultActionResult()
                        .setMessage(deleteResult.message)
                        .setStatus(VaultStatus.OK)
                );
            });
        }

        public getContent(call: ServerWritableStream<VaultRequest, VaultData>): void {
            commands.onGetContent(call.request.getName())
                .then(content => {
                    call.write(
                        new VaultData()
                            .setEntry(new VaultEntry().setName(call.request.getName()))
                            .setData(content.unpack(Buffer.from("{\"no_content\": null}")))
                            .setStatus(VaultStatus.OK)
                    );
                });
        }

        public listVaults(call: ServerWritableStream<VaultCollectionRequest, VaultCollection>): void {
            call.write(
                new VaultCollection()
                    .setSize(0)
                    .setListList([]),
                () => call.end());
        }

        public setContent(call: ServerReadableStream<VaultCreationRequest, VaultActionResult>,
                   respond: sendUnaryData<VaultActionResult>): void
        {
            call.on("data", data => {
                commands.onSetContent(data.getName(), data.getInitialdata())
                    .then(content => {
                        if (!content.success) {
                            return respond(new Error(content.message));
                        }
                        respond(null,
                            new VaultActionResult()
                                .setMessage(content.message)
                                .setStatus(VaultStatus.OK)
                        );
                    });
            });
        }

    }

    return new VaultServer();
}
