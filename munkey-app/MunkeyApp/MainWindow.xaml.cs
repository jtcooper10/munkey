using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using MunkeyApp.View;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Foundation.Collections;
using WinRT.Interop;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace MunkeyApp
{
    public sealed partial class MainWindow : Window
    {
        public static readonly string DEFAULT_WINDOW_TITLE = "Munkey Password Manager";

        public MainWindow()
        {
            InitializeComponent();
            Title = DEFAULT_WINDOW_TITLE;
        }

        private async void FileFlyoutNew_Click(object sender, RoutedEventArgs e)
        {

            ContentDialog dialog = new()
            {
                Title = "New Vault",
                Content = new VaultCreationForm(),
                XamlRoot = MainVaultView.XamlRoot,
                IsPrimaryButtonEnabled = true,
                PrimaryButtonText = "Create",
                CloseButtonText = "Cancel",
            };

            await dialog.ShowAsync();
        }

        private async void FileFlyoutOpen_Click(object sender, RoutedEventArgs e)
        {
            ContentDialog dialog = new()
            {
                Title = "Vault Login",
                Content = new VaultCreationForm(),
                XamlRoot = MainVaultView.XamlRoot,
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
                Title = "Not Implemented",
                Content = "This control has not yet been implemented",
                CloseButtonText = "Ok",
                XamlRoot = MainVaultView.XamlRoot,
            }.ShowAsync();
        }

        private async void SettingsFlyoutService_Click(object sender, RoutedEventArgs e)
        {
            await new ContentDialog()
            {
                Title = "Not Implemented",
                Content = "This control has not yet been implemented",
                CloseButtonText = "Ok",
                XamlRoot = MainVaultView.XamlRoot,
            }.ShowAsync();
        }
    }
}
