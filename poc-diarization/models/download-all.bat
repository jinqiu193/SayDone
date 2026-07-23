@echo off
cd /d "E:\SayIt-main\SayIt-main\poc-diarization\models"
echo Starting eres2net download at %TIME% > dl-eres2net.log
curl -L -C - --connect-timeout 30 -o "eres2net-base.onnx" "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx" >> dl-eres2net.log 2>&1
echo ExitCode: %ERRORLEVEL% at %TIME% >> dl-eres2net.log
if exist eres2net-base.onnx dir eres2net-base.onnx >> dl-eres2net.log
echo DONE > download-done.flag
exit