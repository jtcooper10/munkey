import PipeCommandServer from "./server/pipe";
import * as grpc from "@grpc/grpc-js";
import { VaultService } from "./services";

async function main() {
    const cmd = new PipeCommandServer({
        vault: new VaultService({
            create: name => (console.log(`create(${name})`), null),
            load: name => (console.log(`load(${name})`), null),
        }),
        activity: null, connection: null, admin: null, identity: null, web: null,
    });
    const server = await cmd.useGrpc(new grpc.Server(), "127.0.0.1:8000");

    server.forceShutdown();
}

main()
    .then(() => console.log("Finished."));
