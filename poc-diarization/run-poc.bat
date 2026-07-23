@echo off
cd /d "E:\SayIt-main\SayIt-main\poc-diarization"
set SEG_MODEL=models\sherpa-onnx-pyannote-segmentation-3-0\model.onnx
set EMB_MODEL=models\eres2net-base.onnx
set NUM_SPEAKERS=-1
set CLUSTER_THRESHOLD=0.5
echo === AUTO mode (NUM_SPEAKERS=-1, threshold=0.5) ===
target\release\poc-diarization.exe models\0-four-speakers-zh.wav
exit /b 0