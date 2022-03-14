using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Nodes;

namespace MunkeyClient.Contexts
{
    public class VaultContent
    {
        private JsonNode? _json;
        private byte[] _certificate;

        private VaultContent(JsonNode? root, byte[] certificate)
        {
            _json = root;
            _certificate = certificate;
        }

        public static VaultContent Parse(string source, byte[] signature)
        {
            return new VaultContent(JsonNode.Parse(source), signature);
        }

        public string this[string i]
        {
            get { return _json?[i]?.ToString() ?? ""; }
            set { if (_json != null) _json[i] = value; }
        }

        public byte[] Certificate
        {
            get { return _certificate; }
        }

        public byte[] Export()
        {
            return Encoding.ASCII.GetBytes(_json?.ToJsonString() ?? "");
        }
    }

    public interface IVaultPayload
    {
        enum VaultPayloadType : int
        {
            Raw = 0,
        }

        enum VaultPayloadAlgorithm : int
        {
            AesCbc192 = 0,
        }

        public delegate byte[] DecryptionAlgorithm(byte[] ciphertext);

        public VaultPayloadType PayloadType { get; }
        public VaultPayloadAlgorithm Algorithm { get; }
        public byte[] Vault { get; protected set; }
        public byte[] Seed { get; protected set; }

        public byte[] Serialize();
        public IVaultPayload Deserialize(byte[] payload);
    }

    public struct RawVaultPayload : IVaultPayload
    {
        public static readonly IVaultPayload.VaultPayloadType TYPE = IVaultPayload.VaultPayloadType.Raw;
        public static readonly IVaultPayload.VaultPayloadAlgorithm ALGORITHM = IVaultPayload.VaultPayloadAlgorithm.AesCbc192;

        IVaultPayload.VaultPayloadType IVaultPayload.PayloadType {
            get => TYPE;
        }
        IVaultPayload.VaultPayloadAlgorithm IVaultPayload.Algorithm {
            get => ALGORITHM;
        }

        public byte[] Vault { get; set; }
        public byte[] Seed { get; set; }

        public byte[] Serialize()
        {
            using MemoryStream stream = new();
            using BinaryWriter writer = new(stream);

            writer.Write((int) TYPE);
            writer.Write((int) ALGORITHM);
            writer.Write(Seed.Length);
            writer.Write(Vault.Length);
            writer.Write(Seed);
            writer.Write(Vault);

            return stream.ToArray();
        }

        public IVaultPayload Deserialize(byte[] payload)
        {
            using MemoryStream stream = new(payload);
            using BinaryReader reader = new(stream);

            int type = reader.ReadInt32();
            int algo = reader.ReadInt32();
            Seed = new byte[reader.ReadInt32()];
            Vault = new byte[reader.ReadInt32()];
            reader.Read(Seed);
            reader.Read(Vault);

            return this;
        }
    }

    public struct VaultDataset
    {
        public enum SignatureAlgorithm : int
        {
            SHA512 = 0,
        }

        public int ProtocolVersion { get; private set; }
        public SignatureAlgorithm Algorithm { get; private set; }
        public byte[] Signature { get; private set; }
        public byte[] Payload { get; private set; }

        public VaultDataset(byte[] signature, byte[] payload)
        {
            Signature = signature;
            Payload = payload;
            ProtocolVersion = 0;
            Algorithm = SignatureAlgorithm.SHA512;
        }

        public byte[] Serialize()
        {
            using MemoryStream stream = new();
            using BinaryWriter writer = new(stream);

            writer.Write(ProtocolVersion);
            writer.Write((int)Algorithm);
            writer.Write(Signature.Length);
            writer.Write(Payload.Length);
            writer.Write(Signature);
            writer.Write(Payload);

            return stream.ToArray();
        }

        public static VaultDataset Deserialize(byte[] serializedData)
        {
            using MemoryStream stream = new(serializedData);
            using BinaryReader reader = new(stream);

            int version = reader.ReadInt32();
            int algorithm = reader.ReadInt32(); // ignored for now
            int signatureSize = reader.ReadInt32();
            int payloadSize = reader.ReadInt32();

            return new VaultDataset
            {
                ProtocolVersion = version,
                Algorithm = SignatureAlgorithm.SHA512,
                Signature = reader.ReadBytes(signatureSize),
                Payload = reader.ReadBytes(payloadSize),
            };
        }
    }
}
