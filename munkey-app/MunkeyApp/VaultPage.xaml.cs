using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Foundation;
using Windows.Foundation.Collections;

using MunkeyApp.Model;
using MunkeyApp.View;
using MunkeyClient.Contexts;
using Grpc.Net.Client;
using System.Windows.Input;
using System.Threading;
using System.Threading.Tasks;

namespace MunkeyApp
{
    public sealed class SelectedEntryConverter : IValueConverter
    {
        public bool Invert { get; set; } = false;
        public object Convert(object value, Type targetType, object parameter, string language)
        {
            if (targetType == typeof(Visibility))
                return ((bool) value) ^ Invert
                    ? Visibility.Visible
                    : Visibility.Collapsed;
            return !((bool) value) ^ Invert;
        }

        public object ConvertBack(object value, Type targetType, object parameter, string language)
        {
            throw new NotImplementedException();
        }
    }

    public sealed partial class VaultPage : Page
    {
        public VaultPage()
        {
            this.InitializeComponent();
            Network = new();
            PasswordCollection = new PasswordCollectionViewModel(VaultClientContext.Create(Network.Channel));
            CloseVault = new VaultCloseCommand(PasswordCollection);
        }

        private PasswordCollectionViewModel PasswordCollection { get; set; }
        private NetworkModel Network { get; set; }
        private ICommand CloseVault { get; set; }

        private static int _resetCount = 0;

        public class VaultCloseCommand : ICommand
        {
            private PasswordCollectionViewModel _view;

            public event EventHandler CanExecuteChanged;

            public VaultCloseCommand(PasswordCollectionViewModel viewModel)
            {
                _view = viewModel;
                _view.PropertyChanged += (sender, args) =>
                {
                    if (args.PropertyName == nameof(PasswordCollectionViewModel.IsActive))
                        CanExecuteChanged?.Invoke(this, EventArgs.Empty);
                };
            }

            public bool CanExecute(object parameter) => _view.IsActive;

            public void Execute(object parameter)
            {
                _view.CloseClient();
            }
        }

        private async Task ShowFlyout(ContentDialog dialog)
        {
            if (Interlocked.Increment(ref _resetCount) > 1)
            {
                Interlocked.Decrement(ref _resetCount);
                return;
            }
            try
            {
                dialog.XamlRoot = XamlRoot;
                await dialog.ShowAsync();
            }
            finally
            {
                Interlocked.Decrement(ref _resetCount);
            }
        }

        private async void FileFlyoutNew_Click(object sender, RoutedEventArgs e)
        {
            await ShowFlyout(new ContentDialog
            {
                Title = "New Vault",
                Content = new VaultCreationForm(PasswordCollection.CreateClient),
                CloseButtonText = "Done",
            });
        }

        private async void FileFlyoutOpen_Click(object sender, RoutedEventArgs e)
        {
            await ShowFlyout(new ContentDialog
            {
                Title = "Open Vault",
                Content = new VaultCreationForm(PasswordCollection.OpenClient),
                XamlRoot = XamlRoot,
                CloseButtonText = "Done",
            });
        }
        private async void FileFlyoutLinkRemote_Click(object sender, RoutedEventArgs e)
        {
            await ShowFlyout(new ContentDialog
            {
                Title = "Link with Remote Vault",
                Content = new VaultLinkForm(
                    PasswordCollection.LinkRemoteClient,
                    PasswordCollection.ResolveRemoteClient),
                CloseButtonText = "Done"
            });
        }

        private async void SettingsFlyoutService_Click(object sender, RoutedEventArgs e)
        {
            var form = new DatabaseSettingsForm(
                Network.RpcLocation.HostName,
                Network.RpcLocation.Port,
                (host, port) =>
                {
                    Network.SetChannel(host, port);
                    PasswordCollection.Context = VaultClientContext.Create(Network.Channel);
                });
            await ShowFlyout(new ContentDialog
            {
                Title = "Database Service Settings",
                Content = form,
                IsPrimaryButtonEnabled = true,
                PrimaryButtonText = "Update",
                PrimaryButtonCommand = form.Submit,
                CloseButtonText = "Cancel",
            });
        }

        private void VaultPageEntryList_ItemClick(object sender, ItemClickEventArgs e)
        {
            ListView list = sender as ListView;
            ListViewItem listItem = list.ContainerFromItem(e.ClickedItem) as ListViewItem;
            
            if (listItem.IsSelected && e.ClickedItem is PasswordCollectionItem item)
                item.IsVisible = !item.IsVisible;
        }
    }
}
