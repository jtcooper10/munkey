using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using MunkeyApp.Model;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Windows.Input;
using Windows.Foundation;
using Windows.Foundation.Collections;

// To learn more about WinUI, the WinUI project structure,
// and more about our project templates, see: http://aka.ms/winui-project-info.

namespace MunkeyApp.View
{
    public sealed partial class PasswordEntryForm : UserControl
    {
        public PasswordCollectionItem Item { get; set; }
        public ICommand OnSubmit { get; set; }

        public PasswordEntryForm()
        {
            this.InitializeComponent();
            this.Item = new PasswordCollectionItem();
        }

        private void PasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
        {
            Item.Password = (sender as PasswordBox).Password;
        }

        private void SubmitButton_Click(object sender, RoutedEventArgs e)
        {
            OnSubmit?.Execute(Item);
        }
    }
}
