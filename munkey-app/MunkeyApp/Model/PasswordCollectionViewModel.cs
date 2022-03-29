using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Input;
using Grpc.Core;
using MunkeyClient.Contexts;

namespace MunkeyApp.Model
{
    public class PasswordCollectionViewModel : INotifyPropertyChanged
    {
        public PasswordCollectionViewModel(VaultClientContext remote)
        {
            _remote = remote;
            _items = new ObservableCollection<PasswordCollectionItem>
            {
                new PasswordCollectionItem { EntryKey = "Example1", Password = "hunter2" },
                new PasswordCollectionItem { EntryKey = "Example2", Password = "password123" },
                new PasswordCollectionItem { EntryKey = "Example3", Password = "gosaints4" },
            };
            _selectedItem = null;
            _client = null;
            _key = Array.Empty<byte>();
            _vaultName = null;
            _message = "Use the buttons below to save or sync your database";

            SavePasswords = new ManualCollectionSyncCommand(this);
            PullPasswords = new ManualCollectionPullCommand(this);
            SetPassword = new PasswordSetCommand(this);
        }

        public string Message
        {
            get { return _message; }
            set
            {
                if (_message?.Equals(value) ?? true)
                    return;
                _message = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Message)));
            }
        }

        public string SelectedVaultName
        {
            get { return _vaultName; }
            set
            {
                if (value?.Equals(_vaultName) ?? false)
                    return;
                _vaultName = value;
                PropertyChanged.Invoke(this, new PropertyChangedEventArgs(nameof(SelectedVaultName)));
            }
        }

        public ICommand SetPassword { get; set; }
        public ICommand SavePasswords { get; set; }
        public ICommand PullPasswords { get; set; }
        public VaultClientContext Context
        {
            get { return _remote; }
            set { _remote = value; }
        }

        public ObservableCollection<PasswordCollectionItem> Items
        {
            get { return _items; }
        }

        public AuthenticatedClientContext Client
        {
            get { return _client; }
            set
            {
                if (value?.Equals(_client) ?? false)
                    return;
                _client = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Client)));
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsActive)));
            }
        }

        public bool IsActive { get => _client != null; }

        public async Task CreateClient(string vaultName, byte[] encryptionKey)
        {
            AuthenticationContext auth = new(encryptionKey);
            using ValidationContext validation = ValidationContext.Create();
            byte[] key = validation.ExportPrivateKey();
            byte[] vs = auth.Encrypt("{}", key);
            vs = validation.Wrap(vs);
            AuthenticatedClientContext newClient = _remote.Authenticate(auth);
            await newClient.CreateVault(vaultName, vs, validation.ExportPublicKey());
            Client = newClient;
            Items.Clear();

            SelectedVaultName = vaultName;
            _key = key;
        }

        public async Task LinkRemoteClient(string vaultName, byte[] encryptionKey, string hostname, int portNum)
        {
            await _remote.VaultLink(vaultName, hostname, portNum);
            await OpenClient(vaultName, encryptionKey);
        }

        public async Task ResolveRemoteClient(string vaultName, byte[] encryptionKey)
        {
            bool vaultResolved = false;
            using (CancellationTokenSource cancellation = new())
            {
                await foreach (var (_, host, port) in _remote.ResolveVaults(vaultName, cancellation.Token))
                {
                    try
                    {
                        await _remote.VaultLink(vaultName, host, port);
                        vaultResolved = true;
                    }
                    catch (ApplicationException)
                    {
                        continue;
                    }

                    vaultResolved = true;
                }
            }

            if (!vaultResolved)
                throw new Exception($"Vault name '{vaultName}' could not be resolved");
            await OpenClient(vaultName, encryptionKey);
        }

        public async Task OpenClient(string vaultName, byte[] key)
        {
            AuthenticationContext auth = new(key);
            AuthenticatedClientContext client = _remote.Authenticate(auth);
            var (content, privateKey) = await client.FetchVaultContent(vaultName);
            ReplaceContent(content);

            Client = client;
            SelectedVaultName = vaultName;
            _key = privateKey;
        }

        public void CloseClient()
        {
            Client = null;
            SelectedItem = null;
            SelectedVaultName = null;
            Message = "Use the buttons below to save or sync your database";
            _key = Array.Empty<byte>();
        }

        public async Task SaveClient()
        {
            // TODO: require users to login so that _client is never null
            if (_client == null)
                throw new InvalidOperationException("Cannot sync changes; vault service not connected");
            if (_key == null)
                throw new InvalidOperationException("Cannot sync changes; vault signature key is null");
            if (_vaultName == null)
                throw new InvalidOperationException("Cannot sync changes; unknown vault name");

            var dict = Items.ToDictionary((entry) => entry.EntryKey, (entry) => entry.Password);

            await _client.PushVaultContent(_vaultName, JsonSerializer.SerializeToUtf8Bytes(dict), _key);
        }

        public async Task UpdateClient()
        {
            // TODO: require users to login so that _client is never null
            if (_client == null)
                throw new InvalidOperationException("Cannot sync changes; vault service not connected");
            if (_key == null)
                throw new InvalidOperationException("Cannot sync changes; vault signature key is null");
            if (_vaultName == null)
                throw new InvalidOperationException("Cannot sync changes; unknown vault name");

            var (content, key) = await _client.FetchVaultContent(_vaultName);
            ReplaceContent(content);
            _key = key;
        }


        public void ReplaceContent(VaultContent content)
        {
            Items.Clear();
            foreach (var (entryKey, item) in content)
            {
                Items.Add(new PasswordCollectionItem
                {
                    EntryKey = entryKey,
                    Password = item,
                });
            }
        }

        public PasswordCollectionItem SelectedItem
        {
            get { return _selectedItem; }
            set
            {
                if (value?.Equals(_selectedItem) ?? false)
                    return;
                if (_selectedItem != null)
                    _selectedItem.IsVisible = false;
                if (value != null)
                    value.IsVisible = true;

                _selectedItem = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(SelectedItem)));
            }
        }

        public class PasswordSetCommand : ICommand
        {
            private PasswordCollectionViewModel _viewModel;

            public event EventHandler CanExecuteChanged;

            public PasswordSetCommand(PasswordCollectionViewModel viewModel)
            {
                _viewModel = viewModel;
            }

            public bool CanExecute(object parameter) => true;

            public void Execute(object parameter)
            {
                PasswordCollectionItem item = parameter as PasswordCollectionItem;
                PasswordCollectionItem existingItem = (from modelItem in _viewModel.Items
                                                      where modelItem.EntryKey.Equals(item.EntryKey)
                                                      select modelItem).FirstOrDefault(item);
                _viewModel.Items.Remove(existingItem);
                _viewModel.Items.Add(new PasswordCollectionItem
                {
                    EntryKey = item.EntryKey,
                    Password = item.Password,
                    IsVisible = false,
                });
            }
        }

        public class ManualCollectionSyncCommand : ICommand
        {
            public event EventHandler CanExecuteChanged;

            private PasswordCollectionViewModel _viewModel;

            public ManualCollectionSyncCommand(PasswordCollectionViewModel viewModel)
            {
                _viewModel = viewModel;
            }

            public bool CanExecute(object parameter) => true;

            public void Execute(object parameter)
            {
                _viewModel.Message = "Saving vault content...";
                try
                {
                    _viewModel.SaveClient().GetAwaiter()
                        .OnCompleted(() =>
                        {
                            _viewModel.Message = "Vault contents were saved successfully";
                        });
                }
                catch
                {
                    _viewModel.Message = "Failed to save";
                }
            }
        }

        public class ManualCollectionPullCommand : ICommand
        {
            public event EventHandler CanExecuteChanged;
            private PasswordCollectionViewModel _viewModel;

            public ManualCollectionPullCommand(PasswordCollectionViewModel viewModel)
            {
                _viewModel = viewModel ?? throw new ArgumentNullException("viewModel");
            }

            public bool CanExecute(object parameter) => true;

            public async void Execute(object parameter)
            {
                _viewModel.Message = "Fetching vault content...";
                try
                {
                    await _viewModel.UpdateClient();
                    _viewModel.Message = "Vault contents were pulled successfully";
                }
                catch
                {
                    _viewModel.Message = "Failed to fetch vault content";
                }
            }
        }

        private ObservableCollection<PasswordCollectionItem> _items;
        private PasswordCollectionItem _selectedItem;
        private VaultClientContext _remote;
        private AuthenticatedClientContext _client;
        private string _vaultName;
        private byte[] _key;
        private string _message;

        public event PropertyChangedEventHandler PropertyChanged;
    }
}
