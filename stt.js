// Wacht tot de hele HTML-pagina is geladen voordat we iets proberen te doen.
document.addEventListener('DOMContentLoaded', () => {

    // 1. Zoek de HTML-elementen die we nodig hebben
    const recordButton = document.getElementById('recordButton');
    const statusText = document.getElementById('status');
    const languageSelect = document.getElementById('languageSelect');
    const audioEl = document.getElementById('audio');
    const transcriptEl = document.getElementById('transcript');
    const customSelect = document.getElementById('customSelect');
    const customSelectLabel = document.getElementById('customSelectLabel');
    const customSelectList = document.getElementById('customSelectList');

    // 2. Variabelen om de opname-status bij te houden
    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    
    // !!! BELANGRIJK: Plak hier je API-sleutel als je automatische transcriptie wilt
    // NOOIT DEZE SLEUTEL PUBLIEK OP GITHUB ZETTEN!
    const GOOGLE_API_KEY = 


    // 3. Koppel de 'click'-functie aan de knop
    recordButton.addEventListener('click', async () => {
        
        // --- LOGICA OM OPNAME TE STARTEN ---
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

                // Kies een mimeType als mogelijk (proberen meerdere opties)
                let options = { mimeType: 'audio/webm;codecs=opus' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: 'audio/webm' };
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        options = {}; // Laat de browser kiezen
                    }
                }

                mediaRecorder = new MediaRecorder(stream, options);

                // Wat te doen als er een stukje audio *klaar* is
                mediaRecorder.addEventListener('dataavailable', event => {
                    if (event.data && event.data.size > 0) audioChunks.push(event.data);
                });

                // Wat te doen als de opname *stopt*
                mediaRecorder.addEventListener('stop', () => {
                    // Maak één groot audio-object van alle verzamelde stukjes
                    const mimeType = audioChunks.length ? audioChunks[0].type || 'audio/webm' : 'audio/webm';
                    const audioBlob = new Blob(audioChunks, { type: mimeType });

                    // Zet audio klaar voor afspelen in de pagina
                    audioEl.src = URL.createObjectURL(audioBlob);
                    audioEl.controls = true;
                    // Maak de emmer leeg voor de volgende opname
                    audioChunks = [];

                    // Converteer de Blob naar Base64 om het als JSON te kunnen versturen
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        const base64Audio = reader.result.split(',')[1];

                        // Als er een API-sleutel is, stuur naar Google Speech API
                        if (GOOGLE_API_KEY && GOOGLE_API_KEY !== 'JOUW_API_SLEUTEL_HIER') {
                            sendToGoogleAPI(base64Audio, languageSelect.value);
                        } else {
                            statusText.textContent = 'Opname klaar (geen API-sleutel ingesteld)';
                        }
                    };
                });

                // Start browser speech recognition (live transcript) if available
                startBrowserRecognition();

                // START de opname
                mediaRecorder.start();
                
                // Update de interface
                isRecording = true;
                statusText.textContent = 'Aan het luisteren...';
                recordButton.textContent = 'Stop Opname';
                recordButton.style.backgroundColor = '#cc0000';

                // Ensure custom select width matches button width
                syncControlWidths();

            } catch (err) {
                console.error('Fout bij ophalen microfoon:', err);
                statusText.textContent = 'Fout: Microfoon niet toegestaan.';
            }
        
        // --- LOGICA OM OPNAME TE STOPPEN ---
        } else {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();

            // Stop browser speech recognition when stopping recording
            stopBrowserRecognition();

            // Update de interface
            isRecording = false;
            statusText.textContent = 'Opname verwerken...';
            recordButton.textContent = 'Start met Praten';
            recordButton.style.backgroundColor = '#ff6200';
        }
    });

    // --- Sync widths so button and custom select match and button adapts to text ---
    function syncControlWidths() {
        // Let the button size to its content, then copy its width to the custom select
        const btnWidth = recordButton.getBoundingClientRect().width;
        // Add a tiny padding allowance for the custom select arrow
        customSelect.style.width = Math.ceil(btnWidth) + 'px';
        // Also ensure the button is nicely centered if needed (no fixed width)
        recordButton.style.width = 'auto';
    }

    // Run on load and resize
    window.addEventListener('resize', () => {
        syncControlWidths();
    });

    // Initialize widths after a short delay to allow fonts to load
    setTimeout(syncControlWidths, 100);

    // --- Custom select interactions ---
    if (customSelect) {
        customSelect.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCustomSelect();
        });

        // Click outside closes
        document.addEventListener('click', () => {
            customSelect.classList.remove('open');
            customSelect.setAttribute('aria-expanded', 'false');
        });

        // Option click
        customSelectList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (!li) return;
            const value = li.dataset.value;
            setLanguage(value, li.textContent.trim());
            customSelect.classList.remove('open');
            customSelect.setAttribute('aria-expanded', 'false');
        });

        // keyboard support
        customSelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleCustomSelect();
            } else if (e.key === 'Escape') {
                customSelect.classList.remove('open');
                customSelect.setAttribute('aria-expanded', 'false');
            }
        });
    }

    function toggleCustomSelect() {
        const open = customSelect.classList.toggle('open');
        customSelect.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function setLanguage(value, label) {
        // Update hidden native select
        const native = document.getElementById('languageSelect');
        if (native) {
            native.value = value;
            // trigger change event for existing listeners (like recognition)
            native.dispatchEvent(new Event('change'));
        }
        // Update custom label
        if (customSelectLabel) customSelectLabel.textContent = label;
        // Update active class
        Array.from(customSelectList.querySelectorAll('li')).forEach(li => li.classList.toggle('active', li.dataset.value === value));
        // If recognition exists, update language
        if (typeof recognition !== 'undefined' && recognition) {
            try { recognition.lang = value; } catch (e) { /* ignore */ }
        }
        // keep widths in sync (in case label length changed)
        setTimeout(syncControlWidths, 20);
    }

        // --- Browser SpeechRecognition (live, in-page transcript) ---
        let recognition = null;
        let finalTranscript = '';
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

        function startBrowserRecognition() {
            if (!SpeechRecognition) {
                // Not supported
                console.log('SpeechRecognition not supported in this browser');
                // keep status but do not error out; Google API fallback exists
                return;
            }

            // If already running, don't restart
            if (recognition && recognition.running) return;

            recognition = new SpeechRecognition();
            recognition.lang = languageSelect.value || 'nl-NL';
            recognition.interimResults = true;
            recognition.continuous = true; // keep listening while recording

            finalTranscript = '';
            transcriptEl.value = '';

            recognition.onresult = (event) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalTranscript += result[0].transcript + '\n';
                    } else {
                        interim += result[0].transcript;
                    }
                }
                transcriptEl.value = finalTranscript + interim;
                // Keep textarea scrolled to bottom
                transcriptEl.scrollTop = transcriptEl.scrollHeight;
                statusText.textContent = 'Transcriberen...';
            };

            recognition.onerror = (e) => {
                console.warn('SpeechRecognition error', e);
                // If fatal, show in status but allow recording to continue
                statusText.textContent = 'Fout bij lokale transcriptie.';
            };

            recognition.onend = () => {
                // mark as not running; sometimes onend fires automatically
                if (isRecording) {
                    // Try to restart if still recording (helps with long sessions)
                    try {
                        recognition.start();
                    } catch (err) {
                        console.warn('Kon recognition niet herstarten:', err);
                    }
                } else {
                    statusText.textContent = 'Opname klaar.';
                }
            };

            try {
                recognition.start();
                recognition.running = true;
                console.log('SpeechRecognition gestart');
            } catch (err) {
                console.warn('Fout bij starten SpeechRecognition:', err);
            }
        }

        function stopBrowserRecognition() {
            if (recognition) {
                try {
                    recognition.stop();
                } catch (err) {
                    console.warn('Fout bij stoppen recognition:', err);
                }
                recognition.running = false;
            }
        }

        // Update recognition language if user changes the select while active
        languageSelect.addEventListener('change', () => {
            if (recognition) {
                recognition.lang = languageSelect.value;
            }
        });

    // 4. Functie: API-aanroep (Google Speech-to-Text)
    async function sendToGoogleAPI(base64Audio, languageCode) {
        const API_URL = `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`;

        const requestBody = {
            config: {
                encoding: 'WEBM_OPUS',
                sampleRateHertz: 48000,
                languageCode: languageCode || 'nl-NL'
            },
            audio: {
                content: base64Audio
            }
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const text = await response.text();
                console.error('API response error', response.status, text);
                statusText.textContent = 'Fout bij transcriptie (API).';
                return;
            }

            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const transcript = data.results[0].alternatives[0].transcript;
                statusText.textContent = `Jij zei: "${transcript}"`;
            } else {
                statusText.textContent = 'Kon je niet verstaan. Probeer opnieuw.';
                console.log('Geen transcriptie gevonden in API-antwoord:', data);
            }

        } catch (error) {
            console.error('Fout bij het aanroepen van de Google API:', error);
            statusText.textContent = 'Fout bij verbinding met API.';
        }
    }


});
