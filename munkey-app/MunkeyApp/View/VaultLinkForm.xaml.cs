using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using MunkeyClient.Contexts;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading.Tasks;
using System.Windows.Input;
using Windows.Foundation;
using Windows.Foundation.Collections;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace MunkeyApp.View
{
    public sealed partial class VaultLinkForm : UserControl, INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;
        public ICommand LinkVault { get; set; }

        public VaultLinkForm(Func<string, byte[], string, int, Task> onLink, Func<string, byte[], Task> onResolve)
        {
            this.InitializeComponent();
            _vaultName = string.Empty;
            _key = Array.Empty<byte>();
            OnLink = onLink;
            OnResolve = onResolve;
            LinkVault = new VaultLinkCommand(this);
            RemoteHost = string.Empty;
            RemotePort = 8000;
        }

        public string VaultName
        {
            get { return _vaultName; }
            set
            {
                _vaultName = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(VaultName)));
            }
        }

        public string RemoteHost
        {
            get { return _hostname; }
            set
            {
                _hostname = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(RemoteHost)));
            }
        }

        public int RemotePort
        {
            get { return _portNum ?? 0; }
            set
            {
                _portNum = Math.Max(Math.Min(value, 65535), 0); // _portNum = [0,65535]
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(RemotePort)));
            }
        }

        public string ValidationErrorMessage
        {
            get { return _message; }
            set
            {
                _message = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ValidationErrorMessage)));
            }
        }

        public async Task Submit()
        {
            if (_vaultName.Length <= 0 || _key.Length <= 0)
                throw new FormatException("Name and Password are required");
            if (_hostname.Length <= 0 || _portNum == null)
            {
                await OnResolve(_vaultName, _key);
                return;
            }
            if (_hostname.Length > 0 && _portNum != null)
            {
                await OnLink(_vaultName, _key, _hostname, _portNum ?? 0);
                return;
            }

            throw new FormatException("Hostname and Port required to link with unresolved remote vault");
        }

        public class VaultLinkCommand : ICommand
        {
            public event EventHandler CanExecuteChanged;

            public VaultLinkCommand(VaultLinkForm form)
            {
                _form = form;
            }

            public bool CanExecute(object parameter) => true;

            public async void Execute(object parameter)
            {
                try
                {
                    _form.ValidationErrorMessage = "Linking vault...";
                    await _form.Submit();
                    _form.ValidationErrorMessage = "Vault link successful";
                }
                catch (Exception ex)
                {
                    _form.ValidationErrorMessage = ex.Message;
                }
            }

            private VaultLinkForm _form;
        }

        private string _vaultName;
        private string _message;
        private byte[] _key;

        public Func<string, byte[], string, int, Task> OnLink { get; }
        public Func<string, byte[], Task> OnResolve { get; }

        private string _hostname;
        private int? _portNum;

        private void PasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
        {
            _key = AuthenticationContext.GenerateKey((sender as PasswordBox).Password);
        }
    }
}
