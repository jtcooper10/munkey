using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MunkeyApp.Model
{
    public class PasswordCollectionItem : INotifyPropertyChanged
    {
        public string EntryKey
        {
            get { return this._entryKey; }
            set 
            {
                this._entryKey = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(EntryKey)));
            }
        }

        public string Password
        {
            get { return this._password; }
            set
            {
                this._password = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Password)));
            }
        }

        public bool IsVisible
        {
            get { return _isVisible; }
            set
            {
                _isVisible = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsVisible)));
            }
        }

        public event PropertyChangedEventHandler PropertyChanged;

        private string _entryKey;
        private string _password;
        private bool _isVisible;
    }
}
