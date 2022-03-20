using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MunkeyApp.Model
{
    public class PasswordCollectionViewModel : INotifyPropertyChanged
    {
        public PasswordCollectionViewModel()
        {
            _items = new ObservableCollection<PasswordCollectionItem>
            {
                new PasswordCollectionItem { EntryKey = "Example1", Password = "hunter2" },
                new PasswordCollectionItem { EntryKey = "Example2", Password = "password123" },
                new PasswordCollectionItem { EntryKey = "Example3", Password = "gosaints4" },
            };
            _selectedItem = null;
        }

        public ObservableCollection<PasswordCollectionItem> Items
        {
            get { return _items; }
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

        public event PropertyChangedEventHandler PropertyChanged;
    }
}
