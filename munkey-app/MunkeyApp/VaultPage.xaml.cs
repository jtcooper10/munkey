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


namespace MunkeyApp
{
    public sealed class SelectedEntryConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, string language)
        {
            if (targetType == typeof(Visibility))
                return ((bool) value)
                    ? Visibility.Visible
                    : Visibility.Collapsed;
            return !(bool) value;
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
        }

        private PasswordCollectionViewModel PasswordCollection { get; set; }
        private NetworkModel Network { get; set; }

        private async void FileFlyoutNew_Click(object sender, RoutedEventArgs e)
        {
            ContentDialog dialog;
            try
            {
                VaultCreationForm form = new(PasswordCollection.CreateClient);
                dialog = new()
                {
                    Title = "New Vault",
                    Content = form,
                    XamlRoot = this.XamlRoot,
                    CloseButtonText = "Done",
                };
            }
            catch (Exception ex)
            {
                dialog = new()
                {
                    Title = $"No Vault ({ex.GetType()})",
                    Content = ex.Message,
                    CloseButtonText = "Done",
                };
            }
            await dialog.ShowAsync();
        }

        private async void FileFlyoutOpen_Click(object sender, RoutedEventArgs e)
        {
            ContentDialog dialog;
            try
            {
                VaultCreationForm form = new(PasswordCollection.OpenClient);
                dialog = new()
                {
                    Title = "Open Vault",
                    Content = form,
                    XamlRoot = this.XamlRoot,
                    CloseButtonText = "Done",
                };
            }
            catch (Exception ex)
            {
                dialog = new()
                {
                    Title = $"No Vault ({ex.GetType()})",
                    Content = ex.Message,
                    CloseButtonText = "Done",
                };
            }
            await dialog.ShowAsync();
        }
        private async void FileFlyoutLinkRemote_Click(object sender, RoutedEventArgs e)
        {
            await new ContentDialog()
            {
                Title = "Link with Remote Vault",
                Content = new VaultLinkForm(
                    PasswordCollection.LinkRemoteClient,
                    PasswordCollection.ResolveRemoteClient),
                XamlRoot = this.XamlRoot,
                CloseButtonText = "Done",
            }.ShowAsync();
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
            await new ContentDialog()
            {
                Title = "Database Service Settings",
                Content = form,
                IsPrimaryButtonEnabled = true,
                PrimaryButtonText = "Update",
                PrimaryButtonCommand = form.Submit,
                CloseButtonText = "Cancel",
                XamlRoot = this.XamlRoot,
            }.ShowAsync();
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
