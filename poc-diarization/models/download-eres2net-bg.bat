@echo off
cd /d "E:\SayIt-main\SayIt-main\poc-diarization\models"
curl -L -o "eres2net-base.onnx" "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
echo DONE > download-done.flag
exit