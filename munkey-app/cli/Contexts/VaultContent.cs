using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Text.Json.Nodes;

namespace MunkeyCli.Contexts
{
    class VaultContent
    {
        private JsonNode? _json;
        private byte[] _certificate;

        private VaultContent(JsonNode? root, byte[] certificate)
        {
            _json = root;
            _certificate = certificate;
        }

        public static VaultContent Parse(string source)
        {
            return new VaultContent(JsonNode.Parse(source), Array.Empty<byte>());
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
}
