using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using System;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Foundation;
using Windows.Foundation.Collections;

using MunkeyClient.Contexts;
using System.Windows.Input;
using System.ComponentModel;
using MunkeyApp.Model;
using Grpc.Core;
using System.Security.Cryptography;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace MunkeyApp.View
{
    public sealed partial class VaultCreationForm : UserControl, INotifyPropertyChanged
    {
        public ICommand CreateVault { get; }

        public string VaultName
        {
            get { return _vaultName; }
            set
            {
                if (value?.Equals(_vaultName) ?? false)
                    return;
                _vaultName = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(VaultName)));
            }
        }
        public string ValidationErrorMessage
        {
            get { return _errorMessage; }
            set
            {
                if (value?.Equals(_errorMessage) ?? true)
                    return;
                _errorMessage = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ValidationErrorMessage)));
            }
        }
        public byte[] VaultKey { get; set; }
        private Func<string, byte[], Task> OnSubmit { get; set; }

        public VaultCreationForm() : this(async (_, _) => { })
        {

        }

        public VaultCreationForm(Func<string, byte[], Task> onSubmit)
        {
            this.InitializeComponent();
            CreateVault = new VaultCreationCommand(this);
            VaultKey = Array.Empty<byte>();
            OnSubmit = onSubmit;
        }

        public class VaultCreationCommand : ICommand
        {
            public event EventHandler CanExecuteChanged;

            public VaultCreationCommand(VaultCreationForm form)
            {
                if (form == null)
                    throw new ArgumentNullException("form");
                _form = form;
            }

            public bool CanExecute(object parameter) => true;

            public async void Execute(object parameter)
            {
                try
                {
                    _form.ValidationErrorMessage = "Creating vault...";
                    await _form.OnSubmit(_form.VaultName, _form.VaultKey);
                    _form.ValidationErrorMessage = "Vault creation was successful";
                }
                catch (RpcException)
                {
                    // TODO: modify error message once "vault in use" is a dedicated status code
                    _form.ValidationErrorMessage = "Couldn't connect to service, or vault in use";
                }
                catch (CryptographicException)
                {
                    _form.ValidationErrorMessage = "Invalid password";
                }
                catch
                {
                    _form.ValidationErrorMessage = "An unknown error occurred";
                }
            }

            private VaultCreationForm _form;
        }

        private string _vaultName;
        private string _errorMessage;

        public event PropertyChangedEventHandler PropertyChanged;

        public void PasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
        {
            VaultKey = AuthenticationContext.GenerateKey((sender as PasswordBox).Password);
        }
    }
}
