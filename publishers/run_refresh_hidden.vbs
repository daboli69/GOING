' Starts refresh_site.bat without a console window (used by the "GOING site refresh" scheduled task).
Set shell = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit shell.Run("cmd /c """ & here & "\refresh_site.bat""", 0, True)
