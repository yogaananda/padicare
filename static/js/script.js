document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("fileInput");
    const fileNameDisplay = document.getElementById("fileName");
    const previewImage = document.getElementById("previewImage");
    const previewContainer = previewImage.parentNode;
    const loader = document.getElementById("loading");
    const resultContainer = document.querySelector(".result-container");

    const diseaseElement = document.getElementById("namaPenyakit");
    const severityElement = document.getElementById("tingkatKeparahan");
    const accuracyElement = document.getElementById("presentasePrediksi");
    const diagnosisElement = document.getElementById("diagnosis");
    const preventionElement = document.getElementById("caraMengatasi");

    const varietasInput = document.getElementById("varietas");
    const umurInput = document.getElementById("umur");
    const skipVarietas = document.getElementById("skipVarietas");
    const skipUmur = document.getElementById("skipUmur");
    const submitButton = document.getElementById("submit");
    const cardInput = document.getElementById("cardInput");
    const cardOutput = document.getElementById("cardOutput");
    const backToUploadButton = document.getElementById("backToUploadButton");

    const openAIButton = document.getElementById("openAIButton");
    const aiModalElement = document.getElementById("aiModal");
    const aiModalInstance = new bootstrap.Modal(aiModalElement);
    const chatInput = document.getElementById("chat-input");
    const chatMessages = document.getElementById("chat-messages");
    const sendChatButton = document.getElementById("sendButton");

    const takePhotoBtn = document.getElementById("takePhoto");
    const video = document.getElementById("camera");
    const canvas = document.getElementById("canvas");
    const captureBtn = document.getElementById("capturePhoto");
    const cameraModalElement = document.getElementById("cameraModal");
    const cameraModal = new bootstrap.Modal(cameraModalElement);

    // 🔥 Nonaktifkan AI Asisten saat halaman pertama kali dimuat
    openAIButton.disabled = true;
    backToUploadButton.disabled = true;
    let stream = null;
    let cameraCaptured = false;
    let capturedBlob = null; 


    function showNotification(message) {
        const modalMessage = document.getElementById("modalMessage");
        modalMessage.textContent = message;
        const notificationModal = new bootstrap.Modal(document.getElementById("notificationModal"));
        notificationModal.show();
    }

    // Saat tombol "Take a Photo" diklik
    takePhotoBtn.addEventListener("click", async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }  // 🔁 Meminta kamera belakang
            });
            video.srcObject = stream;
            cameraModal.show();
        } catch (err) {
            showNotification("Tidak dapat mengakses kamera belakang. Menggunakan kamera depan sebagai alternatif.");
            try {
                // Fallback ke kamera depan jika belakang gagal
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user" }
                });
                video.srcObject = stream;
                cameraModal.show();
            } catch (err) {
                showNotification("Gagal mengakses kamera.");
            }
        }
    });


    // Saat tombol "Ambil Foto" diklik
    captureBtn.addEventListener("click", () => {
        const context = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async function (blob) {
            const formData = new FormData();
            formData.append("image", blob, "captured_image.jpg");

            try {
                await fetch("/upload-and-predict", {
                    method: "POST",
                    body: formData
                });

                fileNameDisplay.textContent = "captured_image.jpg";
                previewImage.src = URL.createObjectURL(blob);
                previewImage.style.display = "block";
                cameraCaptured = true;

                // Tutup modal kamera
                cameraModal.hide();

                // Hentikan kamera
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
            } catch (error) {
                showNotification("Gagal mengunggah foto.");
            }
        }, "image/jpeg");
    });

    // Saat modal kamera ditutup, hentikan stream
    cameraModalElement.addEventListener("hidden.bs.modal", () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    });

    fileInput.addEventListener("change", async function () {
        const file = fileInput.files[0];
        if (!file) return;

        fileNameDisplay.textContent = file.name;
        resultContainer.style.display = "none";

 // Tombol Kembali ke Deteksi Baru
    backToUploadButton.addEventListener("click", function () {
        // Reset nilai input, gambar preview, dan tampilkan card input kembali
        resetCardInput();
        cardInput.classList.remove("d-none");
        cardOutput.classList.add("d-none");
    });

    // Fungsi untuk mereset card input
    function resetCardInput() {
        // Reset gambar preview
        previewImage.style.display = "none";
        fileInput.value = "";  // Reset file input
        fileNameDisplay.textContent = "No file chosen";  // Reset nama file

        // Reset nilai input
        varietasInput.value = "";
        umurInput.value = "";

        // Reset checkbox
        skipVarietas.checked = false;
        skipUmur.checked = false;
    }

        // 2️⃣ Load gambar lokal langsung sebagai preview
        const reader = new FileReader();
        reader.onload = function (e) {
            previewImage.src = e.target.result;
            previewImage.style.display = "block";

        };
        reader.readAsDataURL(file);

        // 3️⃣ Kirim gambar ke server untuk prediksi
        const formData = new FormData();
        formData.append("image", file);

        try {
            await fetch("/upload-and-predict", {
                method: "POST",
                body: formData
            });
        } catch (error) {
            showNotification("Gagal mengunggah gambar ke server.");
        }
    });

    submitButton.addEventListener("click", async function (e) {
        e.preventDefault();

        // 🔥 Cek apakah gambar sudah dipilih
        if (!fileInput.files.length && !cameraCaptured) {
            showNotification("Silakan unggah gambar atau ambil foto terlebih dahulu.");
            return;
        }


        // 🔥 Cek apakah varietas dan umur sudah diisi atau checkbox 'Kosongkan' dicentang
        if ((!skipVarietas.checked && varietasInput.value.trim() === "") ||
            (!skipUmur.checked && umurInput.value.trim() === "")) {
            showNotification("Silakan isi varietas dan umur, atau centang 'Kosongkan'.");
            return;
        }

        const payload = {
            varietas: skipVarietas.checked ? "" : varietasInput.value,
            umur: skipUmur.checked ? "" : umurInput.value
        };

        // Pastikan semua komponen tampil seperti baru
        openAIButton.disabled = true;
        backToUploadButton.disabled = true;
        cardOutput.classList.remove("d-none");
        cardOutput.style.display = "block";
        cardInput.style.display = "none";
        loader.classList.remove("d-none");

        try {
            const response = await fetch("/submit-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            loader.classList.add("d-none");

            if (data.error) {
                showNotification(data.error);
            } else {
                tampilkanHasil(data);
                // 🔥 Aktifkan AI Asisten setelah prediksi berhasil
                openAIButton.disabled = false;
            }
        } catch (error) {
            loader.classList.add("d-none");
            showNotification("Gagal mengirim data tambahan.");
        }
    });

    backToUploadButton.addEventListener("click", function () {
        // Tampilkan kembali form input
        cardInput.style.display = "block";
        cardOutput.style.display = "none";

        // Reset file input
        fileInput.value = "";
        fileNameDisplay.textContent = "No file chosen";

        // Reset preview image
        previewImage.src = "";
        previewImage.style.display = "none";

        // Reset field varietas dan umur
        varietasInput.value = "";
        umurInput.value = "";

        // Reset checkbox dan aktifkan kembali input
        skipVarietas.checked = false;
        skipUmur.checked = false;
        varietasInput.disabled = false;
        umurInput.disabled = false;

        // Reset hasil prediksi
        diseaseElement.textContent = "-";
        severityElement.textContent = "-";
        accuracyElement.textContent = "-";
        diagnosisElement.textContent = "-";
        preventionElement.textContent = "-";

        // Nonaktifkan tombol AI dan tombol kembali
        openAIButton.disabled = true;
        backToUploadButton.disabled = true;
    });


    function tampilkanHasil(data) {
        diseaseElement.textContent = data.disease;
        severityElement.textContent = data.severity;
        accuracyElement.textContent = data.confidence;
        diagnosisElement.textContent = data.diagnosis;

        // 🔥 Format pencegahan sebagai bullet points
        preventionElement.innerHTML = formatPreventionList(data.prevention);
        resultContainer.style.display = "block";
        

        // 🔥 Aktifkan AI Asisten setelah prediksi berhasil
        openAIButton.disabled = false;
        backToUploadButton.disabled= false;
    }

    function formatPreventionList(preventionText) {
        return "<ul>" + preventionText
            .split("\n")
            .filter(item => item.trim() !== "")  // Hapus baris kosong
            .map(item => `<li>${item.trim()}</li>`)
            .join("") + "</ul>";
    }

    [skipVarietas, skipUmur].forEach(input => {
        input.addEventListener("change", () => {
            const targetInput = input.id === "skipVarietas" ? varietasInput : umurInput;
            targetInput.disabled = input.checked;
            if (input.checked) targetInput.value = "";
        });
    });

    openAIButton.addEventListener("click", () => {
        if (openAIButton.disabled) {
            showNotification("Harap lakukan proses prediksi terlebih dahulu.");
            return;
        }
        aiModalInstance.show();
    });

    function addMessageToChat(sender, message, isTyping = false) {
        const messageElement = document.createElement("div");
        messageElement.classList.add("chat-message", sender === "Anda" ? "user-bubble" : "bot-bubble");

        if (isTyping) {
            messageElement.classList.add("typing-indicator");
            messageElement.innerHTML = `<span>.</span><span>.</span><span>.</span>`;
        } else {
            messageElement.textContent = message;
        }

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageElement;
    }

    sendChatButton.addEventListener("click", async function () {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        addMessageToChat("Anda", userMessage);
        chatInput.value = "";

        const typingIndicator = addMessageToChat("Asisten", "", true);

        try {
            const response = await fetch("/chatbot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage })
            });

            const data = await response.json();
            chatMessages.removeChild(typingIndicator);
            addMessageToChat("Asisten", data.response);

        } catch (error) {
            chatMessages.removeChild(typingIndicator);
            addMessageToChat("Asisten", "Terjadi kesalahan saat menghubungi asisten.");
        }
    });
});
