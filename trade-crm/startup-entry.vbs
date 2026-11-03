' TradeCRM auto-start entry: silently launches the supervisor in C:\Users\4699\trade-crm
' Lives in the user's Startup folder; if you move the install directory, update ROOT below.
' NOTE: keep this file ASCII-only. WScript reads .vbs as ANSI, so UTF-8 Chinese
' comments would corrupt the script and break launching.
Option Explicit
Dim shell, fso, root, nodeExe, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = "C:\Users\4699\trade-crm"
nodeExe = "C:\Program Files\nodejs\node.exe"

If Not fso.FolderExists(root) Then WScript.Quit 0
If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"

shell.CurrentDirectory = root
cmd = """" & nodeExe & """ """ & root & "\supervisor.mjs"""
' 0 = hidden window, False = do not wait
shell.Run cmd, 0, False
