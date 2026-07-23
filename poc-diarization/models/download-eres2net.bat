@echo off
cd /d "E:\SayIt-main\SayIt-main\poc-diarization\models"
if exist eres2net-base.onnx del eres2net-base.onnx
curl -L --fail --silent --show-error -o "eres2net-base.onnx" "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
echo ExitCode: %ERRORLEVEL%
if exist eres2net-base.onnx (echo SIZE: & dir eres2net-base.onnx | findstr "eres2net") else (echo MISSING)