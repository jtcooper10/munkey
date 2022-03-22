using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Text;
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
            SetPassword = new PasswordSetCommand(this);
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
        }

        public ICommand SetPassword { get; set; }

        public ObservableCollection<PasswordCollectionItem> Items
        {
            get { return _items; }
        }

        public AuthenticatedClientContext Client
        {
            get { return _client; }
            set { _client = value; }
        }

        public async Task CreateClient(string vaultName, byte[] key)
        {
            AuthenticationContext auth = new(key);
            using ValidationContext validation = ValidationContext.Create();
            byte[] vs = auth.Encrypt("{}", validation.ExportPrivateKey());
            vs = validation.Wrap(vs);
            AuthenticatedClientContext newClient = _remote.Authenticate(auth);
            await newClient.CreateVault(vaultName, vs, validation.ExportPublicKey());
            Client = newClient;
            Items.Clear();
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

        private ObservableCollection<PasswordCollectionItem> _items;
        private PasswordCollectionItem _selectedItem;
        private VaultClientContext _remote;
        private AuthenticatedClientContext _client;
        private byte[] _key;

        public event PropertyChangedEventHandler PropertyChanged;
    }
}
