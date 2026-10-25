Option Explicit
Dim shell, fso, root, script, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(root, "scripts\launch-native.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & script & """"
shell.Run command, 0, False
