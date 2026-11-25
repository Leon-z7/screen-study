using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static int Main()
    {
        try
        {
            string folder = AppDomain.CurrentDomain.BaseDirectory;
            string shell = Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            var info = new ProcessStartInfo(shell,
                "-NoLogo -NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(folder, "start.ps1") + "\"");
            info.WorkingDirectory = folder;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            Process.Start(info);
            return 0;
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "ScreenStudy", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
