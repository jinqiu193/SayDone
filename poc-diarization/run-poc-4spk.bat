@echo off
cd /d "E:\SayIt-main\SayIt-main\poc-diarization"
set SEG_MODEL=models\sherpa-onnx-pyannote-segmentation-3-0\model.onnx
set EMB_MODEL=models\eres2net-base.onnx
set NUM_SPEAKERS=4
set CLUSTER_THRESHOLD=0.5
echo === FORCE 4 speakers ===
target\release\poc-diarization.exe models\0-four-speakers-zh.wav
exit /b 0