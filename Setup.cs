using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("ScreenStudy Setup")]
[assembly: AssemblyProduct("ScreenStudy")]
[assembly: AssemblyVersion("0.1.0.0")]

internal static class Setup
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool quiet = args.Length == 1 && args[0] == "--quiet";
        if (!quiet && MessageBox.Show("为当前 Windows 用户安装 ScreenStudy？", "ScreenStudy 安装程序",
            MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return 0;
        try
        {
            string local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
            if (String.IsNullOrEmpty(local)) throw new InvalidOperationException("找不到 Windows 应用数据目录。");
            string parent = Path.Combine(local, "Programs");
            string destination = Path.Combine(parent, "ScreenStudy");
            string staging = Path.Combine(parent, "SS-stage-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            string previous = Path.Combine(parent, "SS-old-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(staging);
            try
            {
                using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
                using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        if (entry.Name != entry.FullName || String.IsNullOrEmpty(entry.Name))
                            throw new InvalidDataException("安装包内容有误。");
                        entry.ExtractToFile(Path.Combine(staging, entry.Name));
                    }
                }
                if (Directory.Exists(destination)) Directory.Move(destination, previous);
                try { Directory.Move(staging, destination); }
                catch
                {
                    if (Directory.Exists(previous)) Directory.Move(previous, destination);
                    throw;
                }
            }
            finally
            {
                if (Directory.Exists(staging)) Directory.Delete(staging, true);
            }

            if (Directory.Exists(previous))
            {
                try { Directory.Delete(previous, true); }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
            if (!quiet)
            {
                string launcher = Path.Combine(destination, "ScreenStudy.exe");
                string menu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                Directory.CreateDirectory(menu);
                Type shellType = Type.GetTypeFromProgID("WScript.Shell", true);
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(Path.Combine(menu, "ScreenStudy.lnk"));
                shortcut.TargetPath = launcher;
                shortcut.WorkingDirectory = destination;
                shortcut.Save();
                Process.Start(new ProcessStartInfo(launcher) { UseShellExecute = true });
            }
            return 0;
        }
        catch (Exception error)
        {
            if (quiet)
            {
                string local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
                if (!String.IsNullOrEmpty(local))
                    File.WriteAllText(Path.Combine(local, "ScreenStudy-setup-error.txt"), error.ToString());
            }
            else MessageBox.Show(error.Message, "ScreenStudy 安装失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
