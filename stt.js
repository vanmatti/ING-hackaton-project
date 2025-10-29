document.getElementById('start-stt').addEventListener('click', async () => {
    const response = await fetch('/start-stt', { method: 'POST' });
    const data = await response.json();
    document.getElementById('transcript').textContent = data.transcript;
});