using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using MunkeyClient.Contexts;

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
            AuthenticationContext context = PromptPassword();
            try
            {
                using ValidationContext validation = ValidationContext.Create();
                byte[] initialData = context.Encrypt(INITIAL_DATA, validation.ExportPrivateKey());
                initialData = validation.Wrap(initialData);
                await _context.Authenticate(context).CreateVault(name, initialData, validation.ExportPublicKey());
            }
            catch (CryptographicException ex)
            {
                Console.WriteLine("Failed to encrypt starting data: " + ex.Message);
            }
            catch
            {
                Console.WriteLine("Connection could not be established");
            }
        }

        public async Task VaultGet(string vaultName, string entryKey)
        {
            try
            {
                await _context.Authenticate(PromptPassword()).GetVaultEntry(vaultName, entryKey);
            }
            catch (CryptographicException x)
            {
                Console.WriteLine("The password provided is invalid: " + x.Message);
            }
            catch
            {
                Console.WriteLine("Connection could not be established");
            }
        }

        public async Task VaultSet(string vaultName, string entryKey, string entryValue)
        {
            try
            {
                await _context.Authenticate(PromptPassword()).SetVaultEntry(vaultName, (entryKey, entryValue));
            }
            catch (CryptographicException)
            {
                Console.WriteLine("The password provided is invalid");
            }
            catch
            {
                Console.WriteLine("Connection could not be established");
            }
        }

        public async Task VaultList()
        {
            try
            {
                await foreach (var (name, id) in _context.VaultList())
                {
                    Console.WriteLine($"{name} = Vault[{id}]");
                }
            }
            catch
            {
                Console.WriteLine("Connection could not be established");
            }
        }

        public async Task VaultLink(string vaultName, string? hostname, int? portNum)
        {
            if (hostname == null)
            {
                await VaultResolve(vaultName);
                return;
            }

            int validPortNum = portNum ?? 0;
            if (portNum == null)
            {
                string[] hostPair = hostname.Split(":");
                string portString = hostPair.Last();
                if (!int.TryParse(portString, out validPortNum))
                {
                    Console.WriteLine("Cannot resolve vault location; port number invalid or missing");
                    return;
                }
                hostname = hostPair[0];
            }

            try
            {
                await _context.VaultLink(vaultName, hostname, validPortNum);
                Console.WriteLine("Vault linking was successful");
            }
            catch (Exception ex)
            {
                Console.WriteLine("Vault linking was not successful: " + ex.Message);
            }
        }

        public async Task VaultResolve(string vaultName)
        {
            await foreach (var (resolvedName, resolvedHost, resolvedPort) in _context.ResolveVaults(vaultName))
            {
                Console.Write($"Vault found ({resolvedName} @ {resolvedHost}:{resolvedPort}), " +
                              "Link? [y/N] ");
                if ((Console.ReadLine()?.ToLower() ?? "n") != "y")
                    continue;

                await _context.VaultLink(resolvedName, resolvedHost, resolvedPort);
                return;
            }

            Console.WriteLine("No other vaults found.");
        }

        private static string? Prompt()
        {
            StringBuilder builder = new();
            ConsoleKeyInfo key;
            while ((key = Console.ReadKey(true)).Key != ConsoleKey.Enter)
            {
                builder.Append(key.KeyChar);
            }

            Console.WriteLine();
            return builder.ToString();
        }

        private static AuthenticationContext PromptPassword()
        {
            string? password;
            do
            {
                Console.Write("Enter password: ");
                password = Prompt();
            } while (string.IsNullOrEmpty(password));

            return new AuthenticationContext(AuthenticationContext.GenerateKey(password));
        }
    }
}
