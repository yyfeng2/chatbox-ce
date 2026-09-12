!include LogicLib.nsh
!include FileFunc.nsh

; electron-builder's default close request sends WM_CLOSE on some Windows
; installations. Chatbox remains alive after its last window closes because it
; owns a tray icon, so ask the running instance to quit explicitly first.
Var /GLOBAL pid

!macro customUnInstall
  ; Ask whether to remove data. electron-builder's built-in deleteAppDataOnUninstall
  ; deletes without asking, so this macro implements the choice itself:
  ;   - uninstallers run with --delete-app-data remove data unconditionally (silent runs)
  ;   - interactive uninstallers show a localized Yes/No question, defaulting to keep
  ; The data dirs are %APPDATA%\Chatbox (leftover from previous official installs)
  ; and %APPDATA%\xyz.chatboxapp.ce (this app's config, session storage, blobs,
  ; IndexedDB, localStorage and logs). RMDir /r silently succeeds on missing dirs.
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--delete-app-data" $R1
  ${If} ${Errors}
    ${If} ${Silent}
      ; Silent uninstall keeps data by default (conservative).
      Goto skipAppDataRemoval
    ${EndIf}
    ; Localized delete question matched against the uninstaller language ($LANGUAGE,
    ; initialized by the MUI2 language pages). Unlisted languages fall back to English.
    ${If} $LANGUAGE = 2052
      MessageBox MB_YESNO|MB_ICONQUESTION "是否删除全部应用数据与遗留文件？$\r$\n$\r$\n选择「是」将删除设置、聊天记录与缓存文件；选择「否」将保留，以便将来重新安装。" /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1028
      MessageBox MB_YESNO|MB_ICONQUESTION "是否刪除全部應用程式資料與遺留檔案？$\r$\n$\r$\n選擇「是」將刪除設定、聊天記錄與快取檔案；選擇「否」將保留，以便將來重新安裝。" /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1041
      MessageBox MB_YESNO|MB_ICONQUESTION "すべてのアプリケーションデータと残りのファイルを削除しますか？$\r$\n$\r$\n「はい」を選択すると設定・チャット・キャッシュファイルを削除します。「いいえ」を選択すると将来の再インストールのために保持します。" /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1042
      MessageBox MB_YESNO|MB_ICONQUESTION "모든 애플리케이션 데이터와 남은 파일을 삭제하시겠습니까?$\r$\n$\r$\n예를 선택하면 설정, 채팅 및 캐시 파일이 삭제됩니다. 아니요를 선택하면 다시 설치할 때를 위해 유지됩니다." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1031
      MessageBox MB_YESNO|MB_ICONQUESTION "Alle Anwendungsdaten und zurückgebliebenen Dateien löschen?$\r$\n$\r$\nWählen Sie Ja, um Einstellungen, Chats und Cache-Dateien zu entfernen. Wählen Sie Nein, um sie für eine spätere Neuinstallation zu behalten." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1036
      MessageBox MB_YESNO|MB_ICONQUESTION "Supprimer toutes les données de l'application et les fichiers restants ?$\r$\n$\r$\nChoisissez Oui pour supprimer les paramètres, les conversations et les fichiers en cache. Choisissez Non pour les conserver en vue d'une réinstallation." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1034
      MessageBox MB_YESNO|MB_ICONQUESTION "¿Desea eliminar todos los datos de la aplicación y los archivos restantes?$\r$\n$\r$\nElija Sí para eliminar configuración, chats y archivos en caché. Elija No para conservarlos para una futura reinstalación." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1040
      MessageBox MB_YESNO|MB_ICONQUESTION "Eliminare tutti i dati dell'applicazione e i file rimanenti?$\r$\n$\r$\nScegli Sì per rimuovere impostazioni, chat e file nella cache. Scegli No per conservarli per una futura reinstallazione." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1049
      MessageBox MB_YESNO|MB_ICONQUESTION "Удалить все данные приложения и оставшиеся файлы?$\r$\n$\r$\nВыберите Да, чтобы удалить настройки, чаты и кэшированные файлы. Выберите Нет, чтобы сохранить их для будущей переустановки." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 2070
      MessageBox MB_YESNO|MB_ICONQUESTION "Eliminar todos os dados da aplicação e ficheiros restantes?$\r$\n$\r$\nEscolha Sim para remover definições, conversas e ficheiros em cache. Escolha Não para mantê-los para uma futura reinstalação." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1046
      MessageBox MB_YESNO|MB_ICONQUESTION "Excluir todos os dados do aplicativo e arquivos restantes?$\r$\n$\r$\nEscolha Sim para remover configurações, conversas e arquivos em cache. Escolha Não para mantê-los para uma futura reinstalação." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1025
      MessageBox MB_YESNO|MB_ICONQUESTION "هل تريد حذف جميع بيانات التطبيق والملفات المتبقية؟$\r$\n$\r$\nاختر نعم لإزالة الإعدادات والمحادثات والملفات المخزنة مؤقتاً. اختر لا للاحتفاظ بها لإعادة التثبيت في المستقبل." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 1053
      MessageBox MB_YESNO|MB_ICONQUESTION "Vill du ta bort all programdata och kvarvarande filer?$\r$\n$\r$\nVälj Ja för att ta bort inställningar, chattar och cachade filer. Välj Nej för att behålla dem för en framtida ominstallation." /SD IDNO IDYES removeAppData
    ${ElseIf} $LANGUAGE = 2068
      MessageBox MB_YESNO|MB_ICONQUESTION "Vil du slette all programdata og gjenværende filer?$\r$\n$\r$\nVelg Ja for å fjerne innstillinger, chatter og hurtigbufferfiler. Velg Nei for å beholde dem for en fremtidig installasjon på nytt." /SD IDNO IDYES removeAppData
    ${Else}
      MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to delete all application data and leftover files?$\r$\n$\r$\nChoose Yes to remove settings, chats and cached files. Choose No to keep them for a future reinstall." /SD IDNO IDYES removeAppData
    ${EndIf}
    Goto skipAppDataRemoval
  ${EndIf}

  removeAppData:
    DetailPrint "Removing application data and leftovers"
    RMDir /r "$APPDATA\Chatbox"
    RMDir /r "$APPDATA\xyz.chatboxapp.ce"
    RMDir /r "$APPDATA\chatbox"

  skipAppDataRemoval:
!macroend

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
