const grpc = require("./bin/ts/munkey_grpc_pb");
const pb = require("./bin/ts/munkey_pb");

module.exports = {
    ...grpc,
    ...pb,
};
