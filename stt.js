let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    const recordBtn = document.getElementById('recordBtn');
    const audio = document.getElementById('audio');

    recordBtn.onclick = async () => {
      if (!isRecording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          audio.src = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = audio.src;
          link.download = 'opname.webm';
          link.click();
          audioChunks = [];
        };
        mediaRecorder.start();
        recordBtn.textContent = "⏹️ Stop opname";
        isRecording = true;
      } else {
        mediaRecorder.stop();
        recordBtn.textContent = "🎙️ Start opname";
        isRecording = false;
      }
    };
