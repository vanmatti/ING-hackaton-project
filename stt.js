// Wacht tot de hele HTML-pagina is geladen voordat we iets proberen te doen.
document.addEventListener('DOMContentLoaded', () => {

    // 1. Zoek de HTML-elementen die we nodig hebben
    const recordButton = document.getElementById('recordButton');
    const statusText = document.getElementById('status');

    // 2. Variabelen om de opname-status bij te houden
    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    
    // !!! BELANGRIJK: Plak hier je API-sleutel !!!
    // NOOIT DEZE SLEUTEL PUBLIEK OP GITHUB ZETTEN!
    const GOOGLE_API_KEY = 'JOUW_API_SLEUTEL_HIER';


    // 3. Koppel de 'click'-functie aan de knop
    recordButton.addEventListener('click', async () => {
        
        // --- LOGICA OM OPNAME TE STARTEN ---
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Specificeer het formaat

                // Wat te doen als de opname *stopt*
                mediaRecorder.addEventListener('stop', () => {
                    // Maak één groot audio-object van alle verzamelde stukjes
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                    // Converteer de Blob naar Base64 om het als JSON te kunnen versturen
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = () => {
                        // 'base64Audio' is de audio, maar met een 'data:...' header ervoor
                        // We hebben alleen de data *na* de komma nodig
                        const base64Audio = reader.result.split(',')[1];
                        
                        // Stuur deze data naar de Google API
                        sendToGoogleAPI(base64Audio);
                    };

                    // Maak de emmer leeg voor de volgende opname
                    audioChunks = [];
                });

                // Wat te doen als er een stukje audio *klaar* is
                mediaRecorder.addEventListener('dataavailable', event => {
                    audioChunks.push(event.data);
                });

                // START de opname
                mediaRecorder.start();
                
                // Update de interface
                isRecording = true;
                statusText.textContent = "Aan het luisteren...";
                recordButton.textContent = "Stop Opname";
                recordButton.style.backgroundColor = "#cc0000";

            } catch (err) {
                console.error("Fout bij ophalen microfoon:", err);
                statusText.textContent = "Fout: Microfoon niet toegestaan.";
            }
        
        // --- LOGICA OM OPNAME TE STOPPEN ---
        } else {
            mediaRecorder.stop();

            // Update de interface
            isRecording = false;
            statusText.textContent = "Opname verwerken..."; // Nieuwe status
            recordButton.textContent = "Start met Praten";
            recordButton.style.backgroundColor = "#ff6200";
        }
    });

    // 4. De nieuwe functie: API-aanroep
    async function sendToGoogleAPI(base64Audio) {
        
        // De URL van de Google API, met jouw sleutel erin
        const API_URL = `https://speech.googleapis.com/v1/speech:recognize?key=${GOOGLE_API_KEY}`;

        // Het 'pakketje' dat we naar Google sturen
        const requestBody = {
            config: {
                encoding: "WEBM_OPUS", // Het formaat dat MediaRecorder maakt
                sampleRateHertz: 48000, // Standaard voor de meeste web-opnames
                languageCode: "nl-NL"   // Stel de taal in op Nederlands
            },
            audio: {
                content: base64Audio    // De audio-data zelf
            }
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            // Controleer of Google iets heeft teruggestuurd
            if (data.results && data.results.length > 0) {
                const transcript = data.results[0].alternatives[0].transcript;
                statusText.textContent = `Jij zei: "${transcript}"`;
            } else {
                statusText.textContent = "Kon je niet verstaan. Probeer opnieuw.";
                console.log("Geen transcriptie gevonden in API-antwoord:", data);
            }

        } catch (error) {
            console.error("Fout bij het aanroepen van de Google API:", error);
            statusText.textContent = "Fout bij verbinding met API.";
        }
    }

});
