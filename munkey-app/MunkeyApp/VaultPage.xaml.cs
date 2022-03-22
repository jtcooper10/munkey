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

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

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
    /// <summary>
    /// An empty page that can be used on its own or navigated to within a Frame.
    /// </summary>
    public sealed partial class VaultPage : Page
    {
        public VaultPage()
        {
            this.InitializeComponent();
            _channel = GrpcChannel.ForAddress("http://localhost:5050", new GrpcChannelOptions
            {
                Credentials = Grpc.Core.ChannelCredentials.Insecure,
            });
            PasswordCollection = new PasswordCollectionViewModel(VaultClientContext.Create(_channel));
        }

        private PasswordCollectionViewModel PasswordCollection { get; set; }


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
                    CloseButtonText = "Cancel",
                };
            }
            catch (Exception ex)
            {
                dialog = new()
                {
                    Title = $"No Vault ({ex.GetType()})",
                    Content = ex.Message,
                    CloseButtonText = "Ok",
                };
            }
            await dialog.ShowAsync();
        }

        private async void FileFlyoutOpen_Click(object sender, RoutedEventArgs e)
        {
            ContentDialog dialog = new()
            {
                Title = "Vault Login",
                Content = new VaultCreationForm(),
                XamlRoot = this.XamlRoot,
                IsPrimaryButtonEnabled = true,
                PrimaryButtonText = "Login",
                CloseButtonText = "Cancel",
            };

            await dialog.ShowAsync();
        }
        private async void FileFlyoutLinkRemote_Click(object sender, RoutedEventArgs e)
        {
            await new ContentDialog()
            {
                Title = "Link with Remote Vault",
                Content = new VaultLinkForm(),
                XamlRoot = this.XamlRoot,
                IsPrimaryButtonEnabled = true,
                PrimaryButtonText = "Link",
                CloseButtonText = "Cancel",
            }.ShowAsync();
        }

        private async void SettingsFlyoutService_Click(object sender, RoutedEventArgs e)
        {
            await new ContentDialog()
            {
                Title = "Not Implemented",
                Content = "This control has not yet been implemented",
                CloseButtonText = "Ok",
                XamlRoot = this.XamlRoot,
            }.ShowAsync();
        }

        private void VaultPageEntryList_ItemClick(object sender, ItemClickEventArgs e)
        {
            ListView list = sender as ListView;
            ListViewItem listItem = list.ContainerFromItem(e.ClickedItem) as ListViewItem;
            
            if (listItem.IsSelected)
            {
                PasswordCollectionItem item = e.ClickedItem as PasswordCollectionItem;
                if (item != null)
                    item.IsVisible = !item.IsVisible;
            }
        }

        private Grpc.Core.ChannelBase _channel;
    }
}
