!include LogicLib.nsh

; electron-builder's default close request sends WM_CLOSE on some Windows
; installations. Chatbox remains alive after its last window closes because it
; owns a tray icon, so ask the running instance to quit explicitly first.
Var /GLOBAL pid

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0

  ${If} $R0 == 0
    ${IfNot} ${Silent}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK installerRequestAppExit
      Quit
    ${EndIf}

    installerRequestAppExit:
      DetailPrint "$(appClosing)"
      Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --quit-for-install'

      ; Give the app time to persist state and complete its normal quit hooks.
      StrCpy $R1 0

    installerWaitForAppExit:
      Sleep 250
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 != 0
        Goto installerAppClosed
      ${EndIf}

      IntOp $R1 $R1 + 1
      ${If} $R1 < 20
        Goto installerWaitForAppExit
      ${EndIf}

      ; Older Chatbox versions do not understand --quit-for-install. Fall back
      ; to electron-builder's process termination after the graceful timeout.
      DetailPrint "Graceful exit timed out; force-closing Chatbox"
      StrCpy $pid 0
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1

      ; Process termination can finish after the kill command returns. Poll for
      ; up to 3 seconds before asking the user to close the app manually.
      StrCpy $R1 0

    installerWaitForForceClose:
      Sleep 250
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 != 0
        DetailPrint "Force-close completed"
        Goto installerAppClosed
      ${EndIf}

      IntOp $R1 $R1 + 1
      ${If} $R1 < 12
        Goto installerWaitForForceClose
      ${EndIf}

      DetailPrint "Force-close timed out after 3 seconds"
      ${If} ${Silent}
        SetErrorLevel 2
        Quit
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY installerRequestAppExit
      Quit

    installerAppClosed:
  ${EndIf}
!macroend

!macro customInit
  ; Check for x64 VC++ Redistributable (skip ARM64 check for now)
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 != "1"
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION "\
        ${PRODUCT_NAME} requires Microsoft Visual C++ Redistributable 2015-2022 (x64).$\r$\n$\r$\n\
        Would you like to download and install it now?" IDYES InstallVCRedist IDNO SkipVCRedist
    ${EndIf}
    
    InstallVCRedist:
      ${If} ${Silent}
        ; INetC otherwise opens its own progress window even when NSIS uses /S.
        inetc::get /SILENT "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$TEMP\vc_redist.x64.exe" /END
      ${Else}
        inetc::get /CAPTION " " /BANNER "Downloading Microsoft Visual C++ Redistributable..." "https://aka.ms/vs/17/release/vc_redist.x64.exe" "$TEMP\vc_redist.x64.exe" /END
      ${EndIf}
      Pop $1
      ${If} $1 != "OK"
        ${If} ${Silent}
          SetErrorLevel 2
          Quit
        ${EndIf}
        MessageBox MB_OK|MB_ICONSTOP "Failed to download Visual C++ Redistributable.$\r$\n$\r$\nPlease install it manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
        Abort
      ${EndIf}
      
      ; Install VC++ Redistributable
      DetailPrint "Installing Microsoft Visual C++ Redistributable..."
      ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $2
      
      ; Clean up
      Delete "$TEMP\vc_redist.x64.exe"
      
      ; Check if installation was successful
      ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
      ${If} $0 != "1"
        ${If} ${Silent}
          SetErrorLevel 2
          Quit
        ${EndIf}
        MessageBox MB_OK|MB_ICONSTOP "Failed to install Visual C++ Redistributable.$\r$\n$\r$\nThe installation cannot continue."
        Abort
      ${EndIf}
      
      DetailPrint "Visual C++ Redistributable installed successfully!"
      Goto Done
    
    SkipVCRedist:
      MessageBox MB_OK|MB_ICONEXCLAMATION "Visual C++ Redistributable is required for ${PRODUCT_NAME} to run properly.$\r$\n$\r$\nPlease install it manually from:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
      Abort
  ${EndIf}
  
  Done:
!macroend
