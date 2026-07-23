@echo off
cd /d "E:\SayIt-main\SayIt-main\poc-diarization"
set SHERPA_ONNX_LIB_DIR=E:\SayIt-main\SayIt-main\poc-diarization\cache\sherpa-libs\sherpa-onnx-v1.13.4-win-x64-static-MT-Release-lib\lib
set SHERPA_ONNX_ARCHIVE_DIR=
echo Starting cargo build at %DATE% %TIME% > build.log
cargo build --release >> build.log 2>&1
echo Finished at %DATE% %TIME% with exit %ERRORLEVEL% >> build.log
exit