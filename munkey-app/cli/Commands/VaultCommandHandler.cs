using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using MunkeyCli.Contexts;

namespace MunkeyCli.Commands
{
    public class VaultCommandHandler
    {
        public static readonly byte[] INITIAL_DATA = Encoding.ASCII.GetBytes("{}");
        private readonly VaultClientContext _context;

        public VaultCommandHandler(VaultClientContext context)
        {
            _context = context;
        }

        public async Task VaultNew(string name)
        {
            AuthenticationContext context = AuthenticationContext.PromptPassword();
            try
            {
                byte[] initialData = context.Encrypt(INITIAL_DATA);
                await _context.Authenticate(context).CreateVault(name, initialData);
            }
            catch (CryptographicException ex)
            {
                Console.WriteLine("Failed to encrypt starting data: " + ex.Message);
            }
        }

        public async Task VaultGet(string vaultName, string entryKey)
        {
            try
            {
                await _context.Authenticate().GetVaultEntry(vaultName, entryKey);
            }
            catch (CryptographicException)
            {
                Console.WriteLine("The password provided is invalid");
            }
        }

        public async Task VaultSet(string vaultName, string entryKey, string entryValue)
        {
            try
            {
                await _context.Authenticate().SetVaultEntry(vaultName, (entryKey, entryValue));
            }
            catch (CryptographicException)
            {
                Console.WriteLine("The password provided is invalid");
            }
        }

        public async Task VaultList()
        {
            await foreach (var (name, id) in _context.VaultList())
            {
                Console.WriteLine($"{name} = Vault[{id}]");
            }
        }

        public async Task VaultLink(string vaultName, string? hostname, int? portNum)
        {
            if (hostname == null)
            {
                await _context.ResolveVaults(vaultName);
                return;
            }

            int validPortNum = portNum ?? 0;
            if (portNum == null)
            {
                string[] hostPair = hostname.Split(":");
                string portString = hostname.Split(":").Last();
                if (!Int32.TryParse(portString, out validPortNum))
                {
                    Console.WriteLine("Cannot resolve vault location; port number invalid or missing");
                }
                hostname = hostPair[0];
            }

            await _context.VaultLink(vaultName, hostname, validPortNum);
        }
    }
}
