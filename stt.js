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
    
    // !!! BELANGRIJK: Dit is de veilige URL naar jouw eigen backend (Cloud Function)
    const BACKEND_URL = 'https://backend-171838792637.europe-west1.run.app';


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

                        // Stuur opname naar backend voor transcriptie
                        sendToGoogleAPI(base64Audio, languageSelect.value);
                    };
                });

                // Start browser speech recognition (live transcript) if available
                startBrowserRecognition();

                // START de opname
                mediaRecorder.start();
                
                // Update de interface
                isRecording = true;
                statusText.textContent = 'Aan het luisteren...';
                recordButton.classList.add('recording');
                recordButton.setAttribute('aria-pressed', 'true');

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
            recordButton.classList.remove('recording');
            recordButton.setAttribute('aria-pressed', 'false');
        }
    });

    // --- Sync widths so button and custom select match and button adapts to text ---
    function syncControlWidths() {
        // No width sync needed anymore — keep the mic button circular and the language
        // selector compact under the transcript. This function left as a noop for
        // backwards compatibility with previous calls.
        return;
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

    // 4. Functie: API-aanroep naar onze backend (Cloud Function)
    async function sendToGoogleAPI(base64Audio, languageCode) {
        const API_URL = BACKEND_URL;

        // Quick guard: remind developer to set the real backend URL instead of the placeholder
        if (!API_URL || API_URL.includes('jouw-cloud-function')) {
            console.warn('BACKEND_URL is niet ingesteld (placeholder gebruikt). Vervang BACKEND_URL in stt.js met je echte endpoint.');
            statusText.textContent = 'Fout: Backend-URL niet ingesteld. Vul BACKEND_URL in stt.js in.';
            return;
        }

        const requestBody = {
            audioData: base64Audio,
            lang: languageCode || 'nl-NL'
        };

        // Use an AbortController to avoid hanging forever
        const controller = new AbortController();
        const timeout = 25000; // 25s
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            console.log('Verstuur opname naar backend:', API_URL, 'lang=', requestBody.lang);
            statusText.textContent = 'Versturen naar backend...';

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                // Try to read JSON or text for helpful debug info
                let bodyText = '';
                try {
                    bodyText = await response.text();
                } catch (e) {
                    bodyText = '<kon response body niet lezen>';
                }
                console.error('Backend response error', response.status, bodyText);
                statusText.textContent = `Backend fout: ${response.status}. Controleer CORS en logs.`;
                return;
            }

            // Attempt to parse JSON; if that fails, show the raw text
            let data;
            try {
                data = await response.json();
            } catch (e) {
                const raw = await response.text();
                console.warn('Backend returned non-JSON response:', raw);
                statusText.textContent = 'Backend retourneerde geen JSON. Bekijk console.';
                console.log('Raw backend response:', raw);
                return;
            }

            // Verwacht { transcript: '...' }
            if (data && data.transcript) {
                statusText.textContent = `Jij zei: "${data.transcript}"`;
            } else {
                statusText.textContent = 'Kon je niet verstaan. Probeer opnieuw.';
                console.log('Geen transcriptie gevonden in backend-antwoord:', data);
            }

        } catch (error) {
            clearTimeout(timeoutId);
            console.error('Fout bij het aanroepen van de Backend:', error);

            // Differentiate abort (timeout) vs network errors
            if (error.name === 'AbortError') {
                statusText.textContent = 'Timeout: backend reageert niet (controleer URL/CORS).';
            } else if (!navigator.onLine) {
                statusText.textContent = 'Geen internetverbinding.';
            } else {
                statusText.textContent = 'Fout bij verbinding met backend. Bekijk console voor details.';
            }

            // Common causes to check
            console.info('Controleer: 1) BACKEND_URL correct en bereikbaar 2) CORS toestaat deze origin 3) HTTPS of localhost tijdens testen');
        }
    }

    // --- Debug helper: test backend connectivity and show full response ---
    const testBtn = document.getElementById('testBackendBtn');
    const backendDebug = document.getElementById('backendDebug');

    async function testBackend() {
        const API_URL = BACKEND_URL;
        backendDebug.style.display = 'block';
        backendDebug.textContent = '';

        if (!API_URL || API_URL.includes('jouw-cloud-function')) {
            backendDebug.textContent = 'BACKEND_URL is niet ingesteld in stt.js. Zet je endpoint in de variabele BACKEND_URL.';
            statusText.textContent = 'Fout: Backend-URL niet ingesteld.';
            return;
        }

        const payload = { ping: true };
        statusText.textContent = 'Ping naar backend...';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            backendDebug.textContent += `HTTP ${res.status} ${res.statusText}\n`;
            backendDebug.textContent += `URL: ${API_URL}\n\n`;

            // Show response headers (subset)
            try {
                const allowOrigin = res.headers.get('access-control-allow-origin');
                backendDebug.textContent += `Access-Control-Allow-Origin: ${allowOrigin}\n`;
            } catch (e) {
                // ignore header read errors
            }

            let bodyText;
            try {
                bodyText = await res.text();
            } catch (e) {
                bodyText = '<kon body niet lezen>';
            }

            // Try to pretty-print JSON if possible
            try {
                const parsed = JSON.parse(bodyText);
                backendDebug.textContent += '\nJSON body:\n' + JSON.stringify(parsed, null, 2) + '\n';
            } catch (e) {
                backendDebug.textContent += '\nBody:\n' + bodyText + '\n';
            }

            statusText.textContent = res.ok ? 'Backend reageert (bekijk debug-paneel).' : `Backend fout: ${res.status}`;

        } catch (err) {
            clearTimeout(timeoutId);
            console.error('Test backend fetch error:', err);
            if (err.name === 'AbortError') {
                backendDebug.textContent += 'Timeout: backend reageert niet binnen 15s.\n';
                statusText.textContent = 'Timeout bij backend-ping.';
            } else {
                backendDebug.textContent += 'Fetch error: ' + (err.message || String(err)) + '\n';
                backendDebug.textContent += 'Mogelijke oorzaken: CORS (zie console), onjuist URL, HTTP->HTTPS mismatch of netwerkproblemen.\n';
                statusText.textContent = 'Fout bij verbinding met backend. Controleer console.';
            }
        }
    }

    if (testBtn) testBtn.addEventListener('click', testBackend);

});