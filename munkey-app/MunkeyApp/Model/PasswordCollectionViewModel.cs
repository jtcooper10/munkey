using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
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
        }

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

        private ObservableCollection<PasswordCollectionItem> _items;
        private PasswordCollectionItem _selectedItem;
        private VaultClientContext _remote;
        private AuthenticatedClientContext _client;

        public event PropertyChangedEventHandler PropertyChanged;
    }
}
