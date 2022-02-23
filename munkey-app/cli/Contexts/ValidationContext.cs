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
            using MemoryStream document = new();
            using BinaryWriter binary = new(document);
            byte[] signature;

            signature = Sign(payload);
            binary.Write(payload.Length);
            binary.Write(signature.Length);
            binary.Write(0); // TODO: configure hash algo enum
            binary.Write(signature);
            binary.Write(payload);

            return document.ToArray();
        }

        public byte[] Unwrap(byte[] document)
        {
            var (signature, payload) = ParseUnwrap(document);

            if (!Validate(payload, signature))
                throw new CryptographicException("Signature could not be validated");

            return payload;
        }

        private static (byte[], byte[]) ParseUnwrap(byte[] document)
        {
            using MemoryStream stream = new(document);
            using BinaryReader binary = new(stream);
            byte[] signature, payload;
            int algoEnum;

            payload = new byte[binary.ReadInt32()];
            signature = new byte[binary.ReadInt32()];
            algoEnum = binary.ReadInt32();
            binary.Read(signature, 0, signature.Length);
            binary.Read(payload, 0, payload.Length);

            return (signature, payload);
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
