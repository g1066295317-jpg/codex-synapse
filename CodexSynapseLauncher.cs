using System;
using System.IO;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Security.Cryptography;

[DataContract] public class RuntimeState {
 [DataMember(Name="pid")] public int Pid;
 [DataMember(Name="appPid")] public int AppPid;
 [DataMember(Name="startedAt")] public string StartedAt;
}
[DataContract] public class WindowState {
 [DataMember] public int Pid;
 [DataMember] public int AppPid;
 [DataMember] public long Handle;
}
internal static class CodexSynapseLauncher {
 static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 static readonly string Data=Path.Combine(Root,"data","local");
 static readonly string LogPath=Path.Combine(Data,"launcher.log");
 static readonly object LogLock=new object();
 static string MutexName(){using(var sha=SHA256.Create()){return "Local\\CodexSynapseNativeLauncher-"+BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Root.ToUpperInvariant()))).Replace("-","").Substring(0,16);}}
 delegate bool EnumProc(IntPtr hwnd,IntPtr param);
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int L,T,R,B;}
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr param);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd,uint command);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr hwnd,int index);
 [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd,int command);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
 static void Log(string message){try{lock(LogLock){Directory.CreateDirectory(Data);File.AppendAllText(LogPath,DateTimeOffset.Now.ToString("o")+" "+message+Environment.NewLine,Encoding.UTF8);}}catch{}}
 static RuntimeState ReadState(){
  try{using(var stream=new FileStream(Path.Combine(Data,"canvas","runtime-status.json"),FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){
   var state=(RuntimeState)new DataContractJsonSerializer(typeof(RuntimeState)).ReadObject(stream);
   using(var controller=Process.GetProcessById(state.Pid))using(var app=Process.GetProcessById(state.AppPid)){
    if(controller.HasExited||app.HasExited||!String.Equals(Path.GetFileName(controller.MainModule.FileName),"node.exe",StringComparison.OrdinalIgnoreCase))return null;
    string exe=app.MainModule.FileName;
    if(!exe.StartsWith(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"WindowsApps","OpenAI.Codex_"),StringComparison.OrdinalIgnoreCase)||!exe.EndsWith("\\app\\ChatGPT.exe",StringComparison.OrdinalIgnoreCase))return null;
    var started=DateTimeOffset.Parse(state.StartedAt,CultureInfo.InvariantCulture);
    if(Math.Abs((app.StartTime.ToUniversalTime()-started.UtcDateTime).TotalSeconds)>180||Math.Abs((controller.StartTime.ToUniversalTime()-started.UtcDateTime).TotalSeconds)>180)return null;
    return state;
   }
  }}catch{return null;}
 }
 static IntPtr FindWindow(int pid){
  IntPtr best=IntPtr.Zero;long bestScore=0;
  EnumWindows(delegate(IntPtr h,IntPtr ignored){
   uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=(uint)pid)return true;
   if((GetWindowLong(h,-20)&0x80)!=0||GetWindow(h,4)!=IntPtr.Zero)return true;
   Rect r;if(!GetWindowRect(h,out r))return true;
   bool minimized=IsIconic(h);if(!minimized&&(r.R-r.L<300||r.B-r.T<200))return true;
   long score=(long)(r.R-r.L)*(r.B-r.T)+(IsWindowVisible(h)?10000000000L:0)+(minimized?20000000000L:0);
   if(score>bestScore){best=h;bestScore=score;}return true;
  },IntPtr.Zero);return best;
 }
 static bool Activate(){
  var state=ReadState();if(state==null)return false;
  IntPtr hwnd=IntPtr.Zero;
  try{using(var stream=File.OpenRead(Path.Combine(Data,"launcher-window.json"))){var saved=(WindowState)new DataContractJsonSerializer(typeof(WindowState)).ReadObject(stream);uint pid;var candidate=new IntPtr(saved.Handle);if(saved.Pid==state.Pid&&saved.AppPid==state.AppPid&&IsWindow(candidate)){GetWindowThreadProcessId(candidate,out pid);if(pid==(uint)state.AppPid)hwnd=candidate;}}}catch{}
  if(hwnd==IntPtr.Zero)hwnd=FindWindow(state.AppPid);if(hwnd==IntPtr.Zero)return false;
  ShowWindowAsync(hwnd,IsIconic(hwnd)?9:5);SetForegroundWindow(hwnd);
  for(int n=0;n<20;n++){if(IsWindowVisible(hwnd)&&!IsIconic(hwnd)){
   try{using(var stream=File.Create(Path.Combine(Data,"launcher-window.json"))){new DataContractJsonSerializer(typeof(WindowState)).WriteObject(stream,new WindowState{Pid=state.Pid,AppPid=state.AppPid,Handle=hwnd.ToInt64()});}}catch{}
   Log("window visible; activated existing instance");return true;
  }Thread.Sleep(100);}
  return false;
 }
 [STAThread] static int Main(string[] args){
  try{
   using(var mutex=new Mutex(false,MutexName())){
    bool owned=false;try{try{owned=mutex.WaitOne(15000);}catch(AbandonedMutexException){owned=true;}
     if(!owned){Activate();return 0;}
     Log("launch requested");if(Activate())return 0;
     string script=Path.Combine(Root,"scripts","launch-native.ps1");
     if(!File.Exists(script))throw new FileNotFoundException("Missing launch script",script);
     string powershell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32","WindowsPowerShell","v1.0","powershell.exe");
     var start=new ProcessStartInfo(powershell,"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+script+"\"");
     start.WorkingDirectory=Root;start.UseShellExecute=false;start.CreateNoWindow=true;start.WindowStyle=ProcessWindowStyle.Hidden;
     start.RedirectStandardOutput=true;start.RedirectStandardError=true;
     using(var process=new Process()){
      process.StartInfo=start;
      process.OutputDataReceived+=(sender,e)=>{if(!String.IsNullOrEmpty(e.Data))Log("preflight: "+e.Data);};
      process.ErrorDataReceived+=(sender,e)=>{if(!String.IsNullOrEmpty(e.Data))Log("preflight error: "+e.Data);};
      process.Start();Log("preflight started");process.BeginOutputReadLine();process.BeginErrorReadLine();
      if(!process.WaitForExit(30000))throw new TimeoutException("Startup preflight timed out");
      Log("preflight exited: "+process.ExitCode);if(process.ExitCode!=0)throw new InvalidOperationException("Startup preflight failed ("+process.ExitCode+")");
     }
     for(int n=0;n<225;n++){if(Activate()){Log("startup verified");return 0;}Thread.Sleep(200);}
     throw new TimeoutException("Codex did not create an available window. See controller.stderr.log.");
    }finally{if(owned)mutex.ReleaseMutex();}
   }
  }catch(Exception error){
   Log("startup failed: "+error.Message);
   MessageBox.Show("Codex 启动失败。\n\n"+error.Message+"\n\n诊断日志："+LogPath,"Codex Synapse",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;
  }
 }
}
