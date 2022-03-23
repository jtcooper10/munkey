using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Text.Json;
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

        public ICommand SetPassword { get; set; }
        public ICommand SavePasswords { get; set; }
        public ICommand PullPasswords { get; set; }

        public ObservableCollection<PasswordCollectionItem> Items
        {
            get { return _items; }
        }

        public AuthenticatedClientContext Client
        {
            get { return _client; }
            set { _client = value; }
        }

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

            _vaultName = vaultName;
            _client = newClient;
            _key = key;
        }

        public async Task OpenClient(string vaultName, byte[] key)
        {
            AuthenticationContext auth = new(key);
            AuthenticatedClientContext client = _remote.Authenticate(auth);
            var (content, privateKey) = await client.FetchVaultContent(vaultName);

            Items.Clear();
            foreach (var (entryKey, item) in content)
            {
                Items.Add(new PasswordCollectionItem
                {
                    EntryKey = entryKey,
                    Password = item,
                });
            }

            _vaultName = vaultName;
            _client = client;
            _key = privateKey;
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
                // TODO: require users to login so that _client is never null
                if (_viewModel._client == null)
                    throw new InvalidOperationException("Cannot sync changes; vault service not connected");
                if (_viewModel._key == null)
                    throw new InvalidOperationException("Cannot sync changes; vault signature key is null");
                if (_viewModel._vaultName == null)
                    throw new InvalidOperationException("Cannot sync changes; unknown vault name");

                _viewModel.Message = "Saving vault content...";
                try
                {
                    var dict = _viewModel.Items
                    .ToDictionary((entry) => entry.EntryKey, (entry) => entry.Password);

                    _viewModel._client
                        .PushVaultContent(_viewModel._vaultName, JsonSerializer.SerializeToUtf8Bytes(dict), _viewModel._key)
                        .GetAwaiter()
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
