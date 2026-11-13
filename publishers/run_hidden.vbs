' Starts publish_models.bat without a console window (used by the "GOING model publish" scheduled task).
Set shell = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WScript.Quit shell.Run("cmd /c """ & here & "\publish_models.bat""", 0, True)
