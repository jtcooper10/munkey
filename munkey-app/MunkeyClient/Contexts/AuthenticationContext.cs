using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace MunkeyClient.Contexts
{
    public class AuthenticationContext
    {
        public static readonly int KEY_SIZE = 24;
        public static readonly int FILL_SIZE = 16;
        public static readonly int ITER_SIZE = 64_000;
        public static readonly HashAlgorithmName HASH_ALGO = HashAlgorithmName.SHA512;

        private byte[] _key;

        public AuthenticationContext(byte[] key)
        {
            this._key = key;
        }
        
        public static AuthenticationContext PromptPassword()
        {
            string? password;
            do {
                Console.Write("Enter password: ");
                password = Prompt();
            } while (string.IsNullOrEmpty(password));
            
            return new AuthenticationContext(GenerateKey(password));
        }

        private static string? Prompt()
        {
            StringBuilder builder = new();
            ConsoleKeyInfo key;
            while ((key = Console.ReadKey(true)).Key != ConsoleKey.Enter) {
                builder.Append(key.KeyChar);
            }

            Console.WriteLine();
            return builder.ToString();
        }

        public byte[] Encrypt(string plaintextString, byte[] privateKey)
        {
            return Encrypt(Encoding.ASCII.GetBytes(plaintextString), privateKey);
        }

        public byte[] Encrypt(byte[] plaintextData, byte[] privateKey)
        {
            IVaultPayload payload;
            
            using (var crypt = Aes.Create())
            {
                crypt.Key = _key;
                crypt.IV = GenerateFill();
                crypt.Mode = CipherMode.CBC;
                ICryptoTransform encrypt = crypt.CreateEncryptor();

                using MemoryStream memoryStream = new();

                // `using` declaration doesn't work for `CryptoStream` for some reason; must use `using` block instead!
                // https://stackoverflow.com/questions/61761053/converting-a-cryptostream-to-using-declaration-makes-memory-stream-empty-when-te
                using (CryptoStream cryptoStream = new(memoryStream, encrypt, CryptoStreamMode.Write))
                using (BinaryWriter writer = new(cryptoStream))
                {
                    // Temporary handler: the private key is wrapped and included as part of the payload.
                    writer.Write(privateKey.Length);
                    writer.Write(privateKey);
                    writer.Write(plaintextData.Length);

                    writer.Write(plaintextData);
                }
                payload = new RawVaultPayload
                {
                    Seed = crypt.IV,
                    Vault = memoryStream.ToArray(),
                };
            }

            return payload.Serialize();
        }

        public byte[] DecryptBytes(byte[] ciphertext, out byte[] privateKey)
        {
            IVaultPayload payload = new RawVaultPayload()
                .Deserialize(ciphertext);

            using var crypt = Aes.Create();
            crypt.Key = _key;
            crypt.IV = payload.Seed;
            crypt.Mode = CipherMode.CBC;

            ICryptoTransform decrypt = crypt.CreateDecryptor();
            using MemoryStream stream = new();
            using (CryptoStream crypto = new(stream, decrypt, CryptoStreamMode.Write))
            {
                crypto.Write(payload.Vault);
                crypto.Flush();
                crypto.FlushFinalBlock();

                stream.Position = 0;
                using BinaryReader binary = new(stream);
                privateKey = binary.ReadBytes(binary.ReadInt32());
                return binary.ReadBytes(binary.ReadInt32());
            }
        }

        public string Decrypt(byte[] encryptedData, out byte[] privateKey)
        {
            return Encoding.ASCII.GetString(DecryptBytes(encryptedData, out privateKey));
        }

        private static byte[] GenerateFill()
        {
            return RandomNumberGenerator.GetBytes(FILL_SIZE);
        }

        public static byte[] GenerateKey(string password)
        {
            // TODO: in all interfaces, replace salt with generated salt.
            byte[] salt = Encoding.ASCII.GetBytes("munkey-salt");
            byte[] rawPassword = Encoding.ASCII.GetBytes(password);
            return Rfc2898DeriveBytes.Pbkdf2(rawPassword, salt, ITER_SIZE, HashAlgorithmName.SHA256, KEY_SIZE);
        }

        public static AuthenticationContext Create(string password)
        {
            return new AuthenticationContext(GenerateKey(password));
        }
    }
}
