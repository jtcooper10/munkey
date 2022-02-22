using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace MunkeyCli.Contexts
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

        public byte[] Encrypt(string plaintextString)
        {
            return Encrypt(Encoding.ASCII.GetBytes(plaintextString));
        }

        public byte[] Encrypt(byte[] plaintextData)
        {
            using var crypt = Aes.Create();
            crypt.Key = _key;
            crypt.IV = GenerateFill();
            crypt.Mode = CipherMode.CBC;

            ICryptoTransform encrypt = crypt.CreateEncryptor(crypt.Key, crypt.IV);
            // `using` declaration doesn't work for `CryptoStream` for some reason; must use `using` block instead!
            // https://stackoverflow.com/questions/61761053/converting-a-cryptostream-to-using-declaration-makes-memory-stream-empty-when-te
            using MemoryStream memoryStream = new();
            memoryStream.Write(crypt.IV, 0, FILL_SIZE);
            using (CryptoStream cryptoStream = new(memoryStream, encrypt, CryptoStreamMode.Write)) {
                cryptoStream.Write(plaintextData);
            }
            return memoryStream.ToArray();
        }

        public string Decrypt(byte[] encryptedData)
        {
            return Encoding.ASCII.GetString(DecryptBytes(encryptedData));
        }

        public byte[] DecryptBytes(byte[] encryptedData)
        {
            // The first FILL_SIZE bytes are just the unencrypted fill data,
            // everything else is the encrypted portion.
            // Here, we split [fill,encrypted] into [fill] and [encrypted].
            byte[] fillData = encryptedData.Take(FILL_SIZE).ToArray();
            encryptedData = encryptedData.Skip(FILL_SIZE).ToArray();

            using var crypt = Aes.Create();
            crypt.Key = _key;
            crypt.IV = fillData;
            crypt.Mode = CipherMode.CBC;

            ICryptoTransform decrypt = crypt.CreateDecryptor(crypt.Key, crypt.IV);
            using MemoryStream memoryStream = new();
            using (CryptoStream cryptoStream = new(memoryStream, decrypt, CryptoStreamMode.Write))
            {
                cryptoStream.Write(encryptedData, 0, encryptedData.Length);
            }
            byte[] data = memoryStream.ToArray();
            return data;
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
