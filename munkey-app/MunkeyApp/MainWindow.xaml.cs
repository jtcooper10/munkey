using Microsoft.UI;
using Microsoft.UI.Windowing;
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

        private void FileFlyoutNew_Click(object sender, RoutedEventArgs e)
        {
            
        }
    }
}
