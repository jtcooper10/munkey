import { randomBytes } from "crypto";

import { describe, it, before, beforeEach } from "mocha";
import { expect } from "chai";

import { EncryptionCipher } from "../munkey/pouch";


describe("Test Surface Area of EncryptionCipher Class", function() {

    let password: string;
    let incorrectPassword: string;

    beforeEach(function() {
        password = randomBytes(32).toString("hex");
        do {
            incorrectPassword = randomBytes(32).toString("hex");
        } while (password === incorrectPassword);
    });

    it("should create an unparsable string on encrypt", async function() {
        const cipher = await EncryptionCipher.fromPassword(password);
        const plainText = Buffer.from('{\"message\":\"hello\"}');
        const plainTextParsed = JSON.parse(plainText.toString());
        const cipherText = (await cipher.encrypt(plainText)).toString();

        expect(() => JSON.parse(cipherText)).to.throw;
        expect(plainTextParsed.message).to.equal("hello");
    });

});
