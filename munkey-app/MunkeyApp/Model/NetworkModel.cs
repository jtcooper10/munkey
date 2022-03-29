using Grpc.Net.Client;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MunkeyApp.Model
{
    public class NetworkModel : IDisposable
    {
        private bool disposedValue;

        public record NetworkLocation(string HostName, int Port);

        public NetworkLocation RpcLocation { get; set; } = new("localhost", 5050);
        public GrpcChannel Channel { get; set; }

        public NetworkModel(NetworkLocation location)
        {
            SetChannel(location);
        }
        public NetworkModel(string hostName, int portNum) : this(new NetworkLocation(hostName, portNum)) { }
        public NetworkModel() : this("localhost", 5050) { }

        public void SetChannel(string hostName, int portNum) =>
            SetChannel(new NetworkLocation(hostName, portNum));
        public void SetChannel(string hostName) =>
            SetChannel(RpcLocation with { HostName = hostName });
        public void SetChannel(int portNum) =>
            SetChannel(RpcLocation with { Port = portNum });

        public void SetChannel(NetworkLocation location)
        {
            RpcLocation = location;
            Channel?.ShutdownAsync().Wait();
            Channel = GrpcChannel.ForAddress($"http://{location.HostName}:{location.Port}", new GrpcChannelOptions
            {
                Credentials = Grpc.Core.ChannelCredentials.Insecure,
            });
        }

        protected virtual void Dispose(bool disposing)
        {
            if (!disposedValue)
            {
                if (disposing)
                    Channel?.Dispose();
                disposedValue = true;
            }
        }

        ~NetworkModel() => Dispose(disposing: false);

        public void Dispose()
        {
            // Do not change this code. Put cleanup code in 'Dispose(bool disposing)' method
            Dispose(disposing: true);
            GC.SuppressFinalize(this);
        }
    }
}
