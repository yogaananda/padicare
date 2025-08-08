import os
import re
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify, render_template, url_for, session
from keras.models import load_model
import openai
from dotenv import load_dotenv

# Memuat variabel lingkungan dari file .env
load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

app = Flask(__name__)
app.secret_key = "supersecretkey"

UPLOAD_FOLDER = 'static/upload'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

model = load_model('models/inceptionV3_modifed_64dense.h5')

class_names = [
    'blast_parah', 'blast_sedang', 'blight_parah', 'blight_sedang',
    'brownspot_parah', 'brownspot_sedang', 'daun_sehat',
    'narrow brownspot_parah', 'narrow brownspot_sedang',
    'tungro_parah', 'tungro_sedang'
]

penyebab_penyakit = {
    "blast": "jamur Pyricularia oryzae",
    "blight": "bakteri Xanthomonas oryzae pv. oryzae",
    "brownspot": "jamur Bipolaris oryzae",
    "narrow brownspot": "jamur Cercospora oryzae",
    "tungro": "virus RTBV dan RTSV",
    "daun_sehat": "-"
}

@app.route('/')
def landing_page():
    return render_template('index.html')

@app.route('/detect')
def detect_page():
    return render_template('detect.html')

@app.route('/diseases')
def diseases_page():
    return render_template('diseases.html')

@app.route('/upload-and-predict', methods=['POST'])
def upload_and_predict():
    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'Tidak ada file'}), 400

    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)

    image = Image.open(filepath).resize((299, 299))
    img_array = np.array(image) / 255.0
    img_array = np.expand_dims(img_array, axis=0)

    prediction = model.predict(img_array)
    class_idx = np.argmax(prediction[0])
    confidence = float(np.max(prediction[0]) * 100)

    class_name = class_names[class_idx]
    disease, severity = ('Daun Sehat', '-') if class_name == 'daun_sehat' else class_name.rsplit('_', 1)

    session['prediction'] = {
        'disease': disease,
        'severity': severity,
        'confidence': f'{confidence:.2f}%',
        'filename': file.filename
    }

    return jsonify({'message': 'Gambar diupload', 'image_path': url_for('static', filename=f'upload/{file.filename}')})

def get_chatgpt_diagnosis_and_prevention(disease, severity, varietas=None, umur=None):
    try:
        label = disease.lower()
        penyebab_ilmiah = penyebab_penyakit.get(label, "patogen yang belum diketahui")

        diagnosis_prompt = (
            f"bayangkan anda seorang petani dengan pengalaman 10 tahun di bidang pertanian" 
            f"saya adalah petani padi (Oryza sativa) yang sedang menghadapi penyakit **{disease}** dengan tingkat keparahan **{severity}**."
            f" Varietas: {varietas if varietas else 'Tidak diketahui'}, umur tanaman: {umur if umur else 'Tidak diketahui'} hari."
            f"\nPenyakit ini diketahui disebabkan oleh **{penyebab_ilmiah}**."
            "\nBerikan diagnosis penyakit ini yang akurat dan mudah dipahami:"
            "\n Gejala khas pada daun atau batang tanaman."
            "\n Dampak terhadap hasil panen."
            "\n penyebab penyakit tersebut."
            "\n Jawaban maksimal 100 kata dan tanpa text style."
        )

        prevention_prompt = (
            f"Saya memiliki tanaman padi yang terkena penyakit **{disease}** dengan tingkat keparahan **{severity}**."
            " Sebagai pakar agronomi, tolong berikan solusi pencegahan yang praktis dan bisa diterapkan petani."
            " Jawaban berupa daftar solusi tanpa bullet point, setiap solusi dipisahkan dengan baris baru, maksimal 50 kata."
        )

        response_diagnosis = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": diagnosis_prompt}],
            max_tokens=300, temperature=0.5
        )

        response_prevention = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prevention_prompt}],
            max_tokens=200, temperature=0.5
        )

        return response_diagnosis["choices"][0]["message"]["content"].strip(), \
               response_prevention["choices"][0]["message"]["content"].strip()

    except Exception as e:
        print("Error di ChatGPT API:", str(e))
        return "Maaf, saya tidak dapat memberikan diagnosis saat ini.", "Maaf, saya tidak dapat memberikan solusi saat ini."

def clean_markdown(text):
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'^[\u2022\-]\s*', '', text, flags=re.MULTILINE)
    return text.strip()

@app.route('/submit-info', methods=['POST'])
def submit_info():
    data = request.json
    varietas = data.get('varietas', '-')
    umur = data.get('umur', '-')

    pred = session.get('prediction')
    if not pred:
        return jsonify({'error': 'Prediksi belum tersedia. Harap unggah gambar terlebih dahulu.'}), 400

    # 🔍 Jika daun sehat, langsung beri pesan khusus
    if pred['disease'].lower() == 'daun sehat':
        return jsonify({
            'disease': pred['disease'].capitalize(),
            'severity': pred['severity'].capitalize(),
            'confidence': pred['confidence'],
            'diagnosis': "Daun ini sehat, tidak memerlukan diagnosis.",
            'prevention': "Tidak ada tindakan pencegahan yang diperlukan.",
            'image_path': url_for('static', filename=f'upload/{pred["filename"]}')
        })

    # Jika bukan daun sehat, lanjutkan diagnosis AI
    diagnosis, prevention = get_chatgpt_diagnosis_and_prevention(
        pred['disease'], pred['severity'], varietas, umur
    )

    return jsonify({
        'disease': pred['disease'].capitalize(),
        'severity': pred['severity'].capitalize(),
        'confidence': pred['confidence'],
        'diagnosis': clean_markdown(diagnosis),
        'prevention': clean_markdown(prevention),
        'image_path': url_for('static', filename=f'upload/{pred["filename"]}')
    })


@app.route('/chatbot', methods=['POST'])
def chatbot():
    data = request.json
    user_message = data.get('message', '').strip()

    pred = session.get('prediction', {})
    disease = pred.get('disease', '-')
    severity = pred.get('severity', '-')

    if not user_message:
        return jsonify({'response': 'Silakan masukkan pertanyaan.'}), 400

    prompt = (
        f"Saya adalah asisten ahli penyakit padi. Tanaman Anda mengalami {disease} ({severity}). "
        f"Berikut adalah pertanyaan dari petani: {user_message}. "
        f"Jawablah dengan singkat, sederhana, dan relevan (maksimal 70 kata)."
    )

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.7
        )
        return jsonify({'response': response['choices'][0]['message']['content'].strip()})
    except Exception as e:
        print(f"GPT Error: {e}")
        return jsonify({'response': 'Gagal mengambil jawaban dari AI.'}), 500

if __name__ == '__main__':
    app.run(debug=True)