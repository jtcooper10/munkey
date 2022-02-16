using Microsoft.VisualStudio.TestTools.UnitTesting;
using MunkeyCli;
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
}
