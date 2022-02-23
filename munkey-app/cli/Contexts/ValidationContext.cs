using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Security.Cryptography;

namespace MunkeyCli.Contexts
{
    public sealed class ValidationContext : IDisposable
    {
        public static readonly HashAlgorithmName HASH_ALGO = HashAlgorithmName.SHA512;
        private readonly ECDsa _dsa;

        private ValidationContext(ECDsa dsa)
        {
            _dsa = dsa;
        }

        public static ValidationContext FromKey(byte[] key)
        {
            var dsa = ECDsa.Create();
            dsa.ImportECPrivateKey(key, out _);
            return new ValidationContext(dsa);
        }

        public static ValidationContext FromPublicKey(byte[] publicKey)
        {
            var dsa = ECDsa.Create();
            dsa.ImportSubjectPublicKeyInfo(publicKey, out int bytesRead);
            return new ValidationContext(dsa);
        }

        public static ValidationContext Create()
        {
            return new ValidationContext(ECDsa.Create());
        }

        public byte[] Wrap(byte[] payload)
        {
            return new VaultDataset(Sign(payload), payload).Serialize();
        }

        public byte[] Unwrap(byte[] document)
        {
            var data = VaultDataset.Deserialize(document);

            if (!Validate(data.Payload, data.Signature))
                throw new CryptographicException("Database signature is invalid");

            return data.Payload;
        }

        public byte[] Sign(byte[] data)
        {
            return _dsa.SignData(data, HASH_ALGO);
        }

        public bool Validate(byte[] data, byte[] signature)
        {
            return _dsa.VerifyData(data, signature, HASH_ALGO);
        }

        public byte[] ExportPublicKey()
        {
            return _dsa.ExportSubjectPublicKeyInfo();
        }

        public byte[] ExportPrivateKey()
        {
            return _dsa.ExportECPrivateKey();
        }

        public void Dispose() => _dsa.Dispose();
    }
}
