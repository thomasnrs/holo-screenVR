param(
  [string]$Action = 'list',
  [long]$Hwnd = 0,
  [string]$Match = '',
  [int]$X = 0,
  [int]$Y = 0
)

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinBridge {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  public static List<string> List() {
    var res = new List<string>();
    EnumWindows((h, l) => {
      if (IsWindowVisible(h)) {
        int len = GetWindowTextLength(h);
        if (len > 0) {
          var sb = new StringBuilder(len + 1);
          GetWindowText(h, sb, sb.Capacity);
          res.Add(((long)h) + "|~|" + sb.ToString());
        }
      }
      return true;
    }, IntPtr.Zero);
    return res;
  }
  public static void Focus(long h) {
    IntPtr p = new IntPtr(h);
    // toque no ALT contorna o bloqueio de foreground do Windows
    keybd_event(0x12, 0, 0, IntPtr.Zero);
    keybd_event(0x12, 0, 2, IntPtr.Zero);
    ShowWindow(p, 9); // SW_RESTORE
    SetForegroundWindow(p);
  }
  public static void Warp(int x, int y) { SetCursorPos(x, y); }
}
"@

switch ($Action) {
  'list' {
    $out = foreach ($i in [WinBridge]::List()) {
      $parts = $i -split '\|~\|', 2
      [pscustomobject]@{ hwnd = [long]$parts[0]; title = $parts[1] }
    }
    $out | ConvertTo-Json -Compress
  }
  'focus' {
    [WinBridge]::Focus($Hwnd)
  }
  'cockpit' {
    foreach ($i in [WinBridge]::List()) {
      $parts = $i -split '\|~\|', 2
      if ($parts[1] -like "*$Match*") { [WinBridge]::Focus([long]$parts[0]); break }
    }
  }
  'warp' {
    [WinBridge]::Warp($X, $Y)
  }
  'monitors' {
    Add-Type -AssemblyName System.Windows.Forms
    $ms = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
      [pscustomobject]@{
        name = $_.DeviceName; primary = $_.Primary;
        x = $_.Bounds.X; y = $_.Bounds.Y; w = $_.Bounds.Width; h = $_.Bounds.Height
      }
    }
    $ms | ConvertTo-Json -Compress
  }
  'stats' {
    $cpu = $null; $gpu = $null; $ramU = $null; $ramT = $null
    try {
      $cpu = [math]::Round((Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -ErrorAction Stop |
        Where-Object { $_.Name -eq '_Total' }).PercentProcessorTime)
    } catch {}
    try {
      $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
      $ramT = [math]::Round($os.TotalVisibleMemorySize / 1mb, 1)
      $ramU = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1mb, 1)
    } catch {}
    try {
      $eng = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop |
        Where-Object { $_.Name -like '*engtype_3D*' }
      $gpu = [math]::Round((($eng | Measure-Object -Property UtilizationPercentage -Sum).Sum))
      if ($gpu -gt 100) { $gpu = 100 }
    } catch {}
    [pscustomobject]@{ cpu = $cpu; gpu = $gpu; ramUsed = $ramU; ramTotal = $ramT } | ConvertTo-Json -Compress
  }
}
