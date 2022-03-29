using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Navigation;
using System;
using System.Collections.Generic;
using System.ComponentModel;
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
    public sealed partial class DatabaseSettingsForm : UserControl, INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;
        public ICommand Submit { get; set; }

        public DatabaseSettingsForm(string initialHost, int initialPort, Action<string, int> onSubmit)
        {
            this.InitializeComponent();
            _onSubmit = onSubmit;
            HostName = initialHost;
            PortNum = initialPort;
            Submit = new DatabaseSettingsUpdateCommand(this);
        }

        public string HostName
        {
            get { return _hostName; }
            set
            {
                if (_hostName == value)
                    return;
                _hostName = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(HostName)));
            }
        }

        public int PortNum
        {
            get { return _port; }
            set
            {
                if (_port == value)
                    return;
                _port = value;
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(PortNum)));
            }
        }

        public class DatabaseSettingsUpdateCommand : ICommand
        {
            public event EventHandler CanExecuteChanged;

            public DatabaseSettingsUpdateCommand(DatabaseSettingsForm form)
            {
                _form = form;
            }

            public bool CanExecute(object parameter) => true;
            public void Execute(object parameter) => _form._onSubmit(_form._hostName, _form._port);

            private readonly DatabaseSettingsForm _form;
        }

        private string _hostName;
        private int _port;
        private Action<string, int> _onSubmit;
    }
}
