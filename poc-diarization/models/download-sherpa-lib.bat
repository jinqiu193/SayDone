@echo off
setlocal
set DEST=E:\SayIt-main\SayIt-main\poc-diarization\cache\sherpa-libs
if not exist "%DEST%" mkdir "%DEST%"
echo Downloading sherpa-onnx prebuilt Windows x64 static lib...
curl -L -o "%DEST%\sherpa-onnx-v1.13.4-win-x64-static-MT-Release-lib.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.4/sherpa-onnx-v1.13.4-win-x64-static-MT-Release-lib.tar.bz2"
echo ExitCode: %ERRORLEVEL%
if exist "%DEST%\sherpa-onnx-v1.13.4-win-x64-static-MT-Release-lib.tar.bz2" (
  dir "%DEST%\sherpa-onnx-v1.13.4-win-x64-static-MT-Release-lib.tar.bz2"
)
echo DONE > "%DEST%\download-done.flag"
exit