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

import http from "http";
import PouchDB from "pouchdb";
import express from "express";
import usePouchDB from "express-pouchdb";
const MemoryDB = PouchDB.defaults({
    db: require("memdown")
});

const portNum: number = process.argv.length > 2
    ? parseInt(process.argv[2])
    : 8000;

const connectPort: number|null = process.argv.length > 3
    ? parseInt(process.argv[3])
    : null;

let server: http.Server = null;

async function configureRoutes(app: express.Application): Promise<express.Application> {
    app.get("/", function(request, response) {
        response.send("Hello, world!\n");
    });

    app.use("/db", usePouchDB(MemoryDB));

    return app;
}

async function main(): Promise<void> {
    const sendString = connectPort === null
        ? "Initial value"
        : "This document has been changed!";

    const db = new MemoryDB("local");
    await db.put({
        _id: "testdoc",
        value: sendString,
    });

    if (connectPort !== null) {
        console.info("Posting data to another server");
        const remoteDb = new MemoryDB(`http://localhost:${connectPort}/db/local`);
        await db.replicate.to(remoteDb);
    }

    db.changes({
        live: true,
    }).on("change", function(change) {
        console.log("Got a change!");
        db.get(change.id).then(doc => console.log(doc));
    });
}

configureRoutes(express())
    .then(app => {
        server = app.listen(portNum, () => {
            console.log(`Listening on port ${portNum}`);
        });
    })
    .then(main)
    .catch(err => {
        console.error(err);
        if (server !== null) {
            server = server.close(serverErr => {
                console.error(serverErr);
            });
        }
    });
