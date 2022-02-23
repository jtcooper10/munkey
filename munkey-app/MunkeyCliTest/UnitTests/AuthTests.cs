using Microsoft.VisualStudio.TestTools.UnitTesting;
using MunkeyCli.Contexts;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Moq;
using System.Linq;
using System.Security.Cryptography;

namespace MunkeyCliTest
{
    [TestClass]
    public class AuthenticationTest
    {
        private readonly string _plaintextMessage;

        [DataTestMethod]
        [Description("Keys generated with a valid password can encrypt/decrypt successfully")]
        [DataRow("valid_password123")]
        public void TestKeyWithValidPassword(string password)
        {
            var context = MakeContext(password);
            byte[] encryptedMessage = context.Encrypt(_plaintextMessage);

            Assert.AreNotEqual(Encoding.ASCII.GetBytes(_plaintextMessage), encryptedMessage);
            Assert.AreEqual(context.Decrypt(encryptedMessage), _plaintextMessage);
        }

        [DataTestMethod]
        [Description("A suitable password encrypts string contents properly such that contents cannot be retrieved")]
        [DataRow("valid_password123")]
        public void TestEncryptedContexts(string password)
        {
            byte[] encryptedMessage = MakeContext(password).Encrypt(_plaintextMessage);

            try
            {
                JsonDocument.Parse(encryptedMessage);
                Assert.Fail();
            }
            catch (JsonException ex)
            {
                Assert.IsInstanceOfType(ex, typeof(JsonException));
            }
        }

        [TestMethod]
        [Description("Attempting to decrypt with the wrong key raises a predictable exception")]
        public void TestBadDecryptionError()
        {
            string password1 = "password1", password2 = "password2";
            byte[] encryptedMessage = MakeContext(password1).Encrypt(_plaintextMessage);

            Assert.ThrowsException<CryptographicException>(() => MakeContext(password2).Decrypt(encryptedMessage));
        }

        private AuthenticationContext MakeContext(string password)
        {
            byte[] key = AuthenticationContext.GenerateKey(password);
            return new AuthenticationContext(key);
        }

        public AuthenticationTest()
        {
            _plaintextMessage = "{\"hello\": \"world\"}";
        }
    }

    [TestClass]
    public class CryptographyTests
    {
        private byte[] _randomData;
        private ValidationContext _context;

        [TestMethod]
        [Description("Signatures pass validation in the same context")]
        public void TestValidSignatureVerification()
        {
            byte[] signature = _context.Sign(_randomData);

            Assert.IsNotNull(signature);
            Assert.IsTrue(_context.Validate(_randomData, signature));
        }

        [TestMethod]
        [Description("Context generated from an exported private key can be used to validate signature")]
        public void TestExportedPrivateKey()
        {
            byte[] signature = _context.Sign(_randomData);
            byte[] exportedKey = _context.ExportPrivateKey();
            Assert.IsNotNull(exportedKey);

            using var newContext = ValidationContext.FromKey(exportedKey);
            Assert.IsNotNull(newContext);
            Assert.AreNotSame(_context, newContext);
            Assert.IsTrue(newContext.Validate(_randomData, signature));
        }

        [TestMethod]
        [Description("Public key exported from context can be used to validate signature")]
        public void TestExportedPublicKeyValidation()
        {
            byte[] signature = _context.Sign(_randomData);
            byte[] publicKey = _context.ExportPublicKey();
            Assert.IsNotNull(publicKey);

            using var newContext = ValidationContext.FromPublicKey(publicKey);
            Assert.IsNotNull(newContext);
            Assert.AreNotSame(_context, newContext);
            Assert.IsTrue(newContext.Validate(_randomData, signature));
        }

        [TestMethod]
        [Description("Valid signatures on invalid data are rejected")]
        public void TestRejectsInvalidData()
        {
            byte[] signature = _context.Sign(_randomData);
            _randomData[0] += 1; // slightly modify the source data

            Assert.IsFalse(_context.Validate(_randomData, signature));
        }

        [TestMethod]
        public void TestRejectsInvalidSignature()
        {
            byte[] signature = _context.Sign(_randomData);
            signature[0] += 1; // slightly modify the signature

            Assert.IsFalse(_context.Validate(_randomData, signature));
        }

        [TestMethod]
        [Description("Wrapping a payload and unwrapping it generates the original payload and passed validation")]
        public void TestAcceptsWrappedPayload()
        {
            byte[] wrapped = _context.Wrap(_randomData);
            Assert.IsNotNull(wrapped);
            CollectionAssert.AreEqual(_randomData, _context.Unwrap(wrapped));
        }

        [TestMethod]
        [Description("Modifying a wrapped payload does not pass validation")]
        public void TestRejectsModifiedWrappedPayload()
        {
            byte[] wrapped = _context.Wrap(_randomData);
            Assert.IsNotNull(wrapped);
            wrapped[0] += 1;
            Assert.ThrowsException<System.Exception>(() => _context.Unwrap(wrapped));
        }

        [TestInitialize]
        public void BeforeEach()
        {
            _context = ValidationContext.Create();
            _randomData = RandomNumberGenerator.GetBytes(128);
        }

        [TestCleanup]
        public void AfterEach()
        {
            _context.Dispose();
        }
    }
}
